import { useEffect, useState } from 'react'
import type { Person, PersonFields, Relationship } from './types'
import { fetchPeople, addPerson, updatePerson, deletePerson } from './api/people'
import { fetchRelationships, addRelationship } from './api/relationships'
import { uploadPhoto } from './api/photos'
import { getPassphrase, clearPassphrase } from './lib/passphrase'
import { TreeView } from './components/tree/TreeView'
import { PersonProfile } from './components/profile/PersonProfile'
import { PersonForm } from './components/form/PersonForm'
import { RelationshipPicker, type PickKind } from './components/picker/RelationshipPicker'
import { PassphraseGate } from './components/gate/PassphraseGate'
import { Icon } from './components/shared/Icon'
import { getParentIds, getSpouseIds } from './lib/familyGraph'
import { resolveLastNames } from './lib/lastNameInheritance'
import { parentRoleLabel } from './lib/relationshipLabels'

type Panel =
  | { kind: 'none' }
  | { kind: 'profile'; personId: string }
  | { kind: 'form'; editingId: string | null }
  | { kind: 'picker'; anchorId: string; heading?: string; subheading?: string; cancelLabel?: string }
  | { kind: 'creating' }
  | { kind: 'gate'; onUnlocked: () => void }

type LoadState = 'loading' | 'loaded' | 'failed'

type UploadResult = { ok: true } | { ok: false; message: string }

function isIncorrectPassphraseError(err: unknown): boolean {
  return err instanceof Error && /incorrect passphrase/i.test(err.message)
}

// Translates known raw Postgres/PostgREST error substrings into human-readable
// messages for the error banner. Falls through to the raw message for
// anything not recognized here, so unknown errors are never hidden.
function friendlyErrorMessage(message: string): string {
  if (message.includes('duplicate key') && message.includes('relationships_unique_edge')) {
    return "They're already linked that way."
  }
  if (/incorrect passphrase/i.test(message)) {
    return 'Incorrect passphrase.'
  }
  if (/first name is required/i.test(message)) {
    return 'Please enter a first name.'
  }
  if (/person not found/i.test(message) || /relationship not found/i.test(message)) {
    return 'That record no longer exists — try reloading.'
  }
  return message
}

export default function App() {
  const [people, setPeople] = useState<Person[]>([])
  const [relationships, setRelationships] = useState<Relationship[]>([])
  const [focalId, setFocalId] = useState<string | null>(null)
  const [panel, setPanel] = useState<Panel>({ kind: 'none' })
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    void load()
  }, [])

  // A panel can hold a stale person id — e.g. another browser tab deleted
  // that person, or a race between two writes — after which `.find()` would
  // return undefined. Self-heal by dropping back to a sane panel state
  // instead of leaving the render-time guards below to paper over it forever.
  useEffect(() => {
    const missing = (id: string) => !people.some((p) => p.id === id)
    if (panel.kind === 'profile' && missing(panel.personId)) {
      setPanel({ kind: 'none' })
    } else if (panel.kind === 'picker' && missing(panel.anchorId)) {
      setPanel({ kind: 'none' })
    } else if (panel.kind === 'form' && panel.editingId && missing(panel.editingId)) {
      setPanel({ kind: 'none' })
    }
  }, [people, panel])

  async function load() {
    setLoadState('loading')
    try {
      const [peopleRows, relRows] = await Promise.all([fetchPeople(), fetchRelationships()])
      setPeople(peopleRows)
      setRelationships(relRows)
      if (peopleRows.length > 0) setFocalId((prev) => prev ?? peopleRows[0].id)
      setLoadState('loaded')
      void reconcileLastNames(peopleRows, relRows)
    } catch (err) {
      // Deliberately do NOT fall through to the empty-state UI here — that would
      // invite re-entering data that may already exist. Show a distinct
      // couldn't-load state instead.
      console.error('Failed to load people/relationships', err)
      setLoadState('failed')
    }
  }

  function requirePassphrase(action: () => void) {
    if (getPassphrase()) {
      action()
    } else {
      setPanel({ kind: 'gate', onUnlocked: () => { setPanel({ kind: 'none' }); action() } })
    }
  }

  async function refresh() {
    const [newPeople, newRelationships] = await Promise.all([fetchPeople(), fetchRelationships()])
    setPeople(newPeople)
    setRelationships(newRelationships)
    return { people: newPeople, relationships: newRelationships }
  }

  // After any edit that could make a previously-unresolved last name
  // resolvable (a new parent-child/spouse link, or a gender change), persist
  // any newly-resolved names and reflect them in state. Safe to call after
  // every relevant write since resolveLastNames only ever fills a blank
  // field — a call that resolves nothing is a no-op past its first line.
  async function reconcileLastNames(currentPeople: Person[], currentRelationships: Relationship[]) {
    const updates = resolveLastNames(currentPeople, currentRelationships)
    if (updates.length === 0) return
    const byId = new Map(currentPeople.map((p) => [p.id, p]))
    for (const update of updates) {
      const person = byId.get(update.id)
      if (!person) continue
      await updatePerson(person.id, {
        first_name: person.first_name,
        last_name: update.last_name,
        gender: person.gender,
        birth_date: person.birth_date,
        death_date: person.death_date,
        birth_place: person.birth_place,
        occupation: person.occupation,
        bio: person.bio,
      })
    }
    await refresh()
  }

  // Centralizes save-failure handling: a write rejected specifically for an
  // incorrect passphrase clears the stale/wrong stored passphrase and
  // re-opens the gate so the user can enter the current one, instead of being
  // stuck. Any other failure just surfaces an inline error message. Returns
  // true when the gate was (re-)opened, so callers can avoid clobbering it
  // with their own panel transition.
  function handleWriteError(err: unknown): boolean {
    console.error(err)
    if (isIncorrectPassphraseError(err)) {
      clearPassphrase()
      setErrorMessage('Your stored passphrase was rejected. Please re-enter it.')
      setPanel({ kind: 'gate', onUnlocked: () => setPanel({ kind: 'none' }) })
      return true
    }
    setErrorMessage(err instanceof Error ? friendlyErrorMessage(err.message) : 'Something went wrong. Please try again.')
    return false
  }

  async function handleSavePerson(fields: PersonFields) {
    const editingId = panel.kind === 'form' ? panel.editingId : null
    try {
      setErrorMessage(null)
      if (editingId) {
        await updatePerson(editingId, fields)
        const { people: freshPeople, relationships: freshRelationships } = await refresh()
        await reconcileLastNames(freshPeople, freshRelationships)
        // Editing was launched from a profile panel — return there rather than
        // dropping the user back on the bare tree.
        setPanel({ kind: 'profile', personId: editingId })
      } else {
        const newId = await addPerson(fields)
        if (!focalId) setFocalId(newId)
        const { people: freshPeople, relationships: freshRelationships } = await refresh()
        await reconcileLastNames(freshPeople, freshRelationships)
        // The standalone "+ Add Person" flow creates a person with no
        // relationship yet — land on their own profile so they're immediately
        // visible and editable, rather than leaving them an orphan only
        // reachable later via another person's relationship-picker search.
        setPanel({ kind: 'profile', personId: newId })
      }
    } catch (err) {
      // Leave the form panel in place (unless handleWriteError opened the
      // gate) so the user can see the error and retry without losing input.
      handleWriteError(err)
    }
  }

  async function handleLinkExisting(anchorId: string, kind: PickKind, otherId: string) {
    if (kind === 'parent') {
      // The picked/created person becomes the parent of the anchor.
      await addRelationship('parent-child', otherId, anchorId)
    } else if (kind === 'child') {
      // The anchor becomes the parent of the picked/created person — and,
      // if the anchor has a recorded spouse, the spouse becomes a parent
      // too, since a child's other parent is assumed to be whoever the
      // anchor is currently married to.
      await addRelationship('parent-child', anchorId, otherId)
      const spouseId = getSpouseIds(anchorId, relationships)[0]
      if (spouseId) {
        try {
          await addRelationship('parent-child', spouseId, otherId)
        } catch (err) {
          // The anchor's own link above already succeeded. If the picked
          // person is already recorded as the spouse's child from a
          // different action, this second call is a harmless duplicate —
          // treat it as "already done" rather than surfacing a "They're
          // already linked that way" error for an operation that mostly
          // worked. Same pattern as the sibling branch below.
          if (!(err instanceof Error && err.message.includes('relationships_unique_edge'))) throw err
        }
      }
    } else if (kind === 'sibling') {
      // The picked/created person becomes a parent-child of each of the
      // anchor's own recorded parents (using relationships as it stood
      // before this add — the sibling link itself never changes the
      // anchor's own parents), making them a full or half sibling
      // depending on how many parents are already known.
      for (const parentId of getParentIds(anchorId, relationships)) {
        try {
          await addRelationship('parent-child', parentId, otherId)
        } catch (err) {
          // If a retry after a partial failure re-links a parent that's
          // already recorded, treat it as "already done" and keep going to
          // the next parent rather than aborting the whole retry.
          if (!(err instanceof Error && err.message.includes('relationships_unique_edge'))) throw err
        }
      }
    } else {
      await addRelationship('spouse', anchorId, otherId)
    }

    const { people: freshPeople, relationships: freshRelationships } = await refresh()
    await reconcileLastNames(freshPeople, freshRelationships)

    if (kind === 'parent') {
      const parentIds = getParentIds(anchorId, freshRelationships)
      if (parentIds.length === 1) {
        const addedPerson = freshPeople.find((p) => p.id === otherId)
        const anchorName = freshPeople.find((p) => p.id === anchorId)?.first_name ?? ''
        const addedRole = parentRoleLabel(addedPerson?.gender ?? null)
        const complementRole = addedPerson?.gender === 'Male' ? 'Mother' : addedPerson?.gender === 'Female' ? 'Father' : null
        setPanel({
          kind: 'picker',
          anchorId,
          heading: complementRole ? `Add ${complementRole} for ${anchorName}?` : `Add another parent for ${anchorName}?`,
          subheading: `You just added ${addedPerson?.first_name ?? 'them'} as ${anchorName}'s ${addedRole.toLowerCase()}. ${complementRole ? `Add their ${complementRole.toLowerCase()} now, or skip for later.` : 'Add another now, or skip for later.'}`,
          cancelLabel: 'Skip',
        })
        return
      }
    }

    setPanel({ kind: 'profile', personId: anchorId })
  }

  async function handleDeletePerson(personId: string) {
    try {
      setErrorMessage(null)
      await deletePerson(personId)
      const [newPeople, newRelationships] = await Promise.all([fetchPeople(), fetchRelationships()])
      setPeople(newPeople)
      setRelationships(newRelationships)
      const wasFocal = focalId === personId
      const nextFocalId = wasFocal ? newPeople[0]?.id ?? null : focalId
      setFocalId(nextFocalId)
      // Return to a sane panel state: back to the tree if the deleted person
      // was the focal one (or nobody's left), otherwise back to the focal
      // person's profile.
      if (wasFocal || !nextFocalId) {
        setPanel({ kind: 'none' })
      } else {
        setPanel({ kind: 'profile', personId: nextFocalId })
      }
    } catch (err) {
      handleWriteError(err)
    }
  }

  async function handleUploadPhoto(personId: string, file: File): Promise<UploadResult> {
    try {
      setErrorMessage(null)
      await uploadPhoto(personId, file)
      return { ok: true }
    } catch (err) {
      handleWriteError(err)
      return { ok: false, message: err instanceof Error ? err.message : 'Upload failed. Please try again.' }
    }
  }

  // Same passphrase-gating pattern as requirePassphrase, but for an async
  // action whose result the caller (PersonProfile) needs back to render
  // inline upload feedback. On unlock, returns to the profile panel rather
  // than dropping to 'none'.
  function requestUploadPhoto(personId: string, file: File): Promise<UploadResult> {
    return new Promise((resolve) => {
      const run = () => { void handleUploadPhoto(personId, file).then(resolve) }
      if (getPassphrase()) {
        run()
      } else {
        setPanel({ kind: 'gate', onUnlocked: () => { setPanel({ kind: 'profile', personId }); run() } })
      }
    })
  }

  const errorBanner = errorMessage && (
    <div className="error-banner" role="alert">
      <span>{errorMessage}</span>
      <button className="error-banner-dismiss" onClick={() => setErrorMessage(null)} aria-label="Dismiss error">
        <Icon name="close" size={12} />
      </button>
    </div>
  )

  if (loadState === 'failed') {
    return (
      <div className="app">
        {errorBanner}
        <div className="load-failed">
          <p>Couldn't load your family tree. Please check your connection and try again.</p>
          <button className="btn btn-primary" onClick={() => void load()}>Reload</button>
        </div>
      </div>
    )
  }

  if (loadState === 'loading') {
    return <div className="app">{errorBanner}<p className="callout">Loading…</p></div>
  }

  if (people.length === 0) {
    return (
      <div className="app">
        {errorBanner}
        <button className="btn btn-primary" onClick={() => requirePassphrase(() => setPanel({ kind: 'form', editingId: null }))}>
          Add the first person
        </button>
        {panel.kind === 'gate' && <PassphraseGate onUnlocked={panel.onUnlocked} onCancel={() => setPanel({ kind: 'none' })} />}
        {panel.kind === 'form' && (
          <PersonForm initial={null} onSave={handleSavePerson} onCancel={() => setPanel({ kind: 'none' })} />
        )}
      </div>
    )
  }

  // Resolve any panel-referenced person id once, up front, so a stale id
  // (the person was deleted — by this session or another) never reaches a
  // non-null assertion. The self-healing effect above will reset the panel
  // shortly after; these guards just make sure nothing crashes in the render
  // before that effect runs.
  const profilePerson = panel.kind === 'profile' ? people.find((p) => p.id === panel.personId) : undefined
  const pickerAnchor = panel.kind === 'picker' ? people.find((p) => p.id === panel.anchorId) : undefined

  return (
    <div className="app">
      {errorBanner}

      <div className="app-toolbar">
        <button
          className="btn btn-primary"
          onClick={() => requirePassphrase(() => setPanel({ kind: 'form', editingId: null }))}
        >
          <Icon name="plus" size={14} /> Add Person
        </button>
      </div>

      {focalId && (
        <TreeView
          people={people}
          relationships={relationships}
          focalId={focalId}
          onAddParent={(personId) => requirePassphrase(() => setPanel({ kind: 'picker', anchorId: personId }))}
          onOpenProfile={(id) => setPanel({ kind: 'profile', personId: id })}
          onCenterOn={(id) => setFocalId(id)}
        />
      )}

      {panel.kind === 'profile' && profilePerson && (
        <PersonProfile
          person={profilePerson}
          people={people}
          relationships={relationships}
          onEdit={() => requirePassphrase(() => setPanel({ kind: 'form', editingId: panel.personId }))}
          onAddRelationship={() => requirePassphrase(() => setPanel({ kind: 'picker', anchorId: panel.personId }))}
          onOpenPerson={(id) => setPanel({ kind: 'profile', personId: id })}
          onCenterHere={() => setFocalId(panel.personId)}
          onDelete={() => requirePassphrase(() => { void handleDeletePerson(panel.personId) })}
          onClose={() => setPanel({ kind: 'none' })}
          onUploadPhoto={(file) => requestUploadPhoto(panel.personId, file)}
        />
      )}

      {panel.kind === 'form' && (
        <PersonForm
          initial={panel.editingId ? people.find((p) => p.id === panel.editingId) ?? null : null}
          onSave={handleSavePerson}
          onCancel={() => setPanel(panel.editingId ? { kind: 'profile', personId: panel.editingId } : { kind: 'none' })}
        />
      )}

      {panel.kind === 'picker' && pickerAnchor && (
        <RelationshipPicker
          key={panel.anchorId + (panel.heading ?? '')}
          anchorPerson={pickerAnchor}
          people={people}
          relationships={relationships}
          heading={panel.heading}
          subheading={panel.subheading}
          cancelLabel={panel.cancelLabel}
          onLinkExisting={(kind, personId) => {
            const anchorId = panel.anchorId
            void handleLinkExisting(anchorId, kind, personId).catch((err) => {
              handleWriteError(err)
            })
          }}
          onCancel={() => setPanel({ kind: 'profile', personId: panel.anchorId })}
          onCreateNew={(kind, searchText) => {
            const anchorId = panel.anchorId
            // Don't render an interactive form during the async round trip — that
            // would let the user submit or cancel a second, conflicting action
            // (e.g. creating a duplicate person) before this one finishes.
            setPanel({ kind: 'creating' })
            void (async () => {
              try {
                const newId = await addPerson({ first_name: searchText, last_name: null, gender: null, birth_date: null, death_date: null, birth_place: null, occupation: null, bio: null })
                await handleLinkExisting(anchorId, kind, newId)
              } catch (err) {
                const gated = handleWriteError(err)
                if (!gated) {
                  setPanel({ kind: 'profile', personId: anchorId })
                }
              }
            })()
          }}
        />
      )}

      {panel.kind === 'creating' && (
        <div className="modal-shell" aria-live="polite">
          <div className="profile-name" style={{ fontSize: 19, marginBottom: 18 }}>Creating person…</div>
        </div>
      )}

      {panel.kind === 'gate' && (
        <PassphraseGate onUnlocked={panel.onUnlocked} onCancel={() => setPanel({ kind: 'none' })} />
      )}
    </div>
  )
}
