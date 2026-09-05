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

type Panel =
  | { kind: 'none' }
  | { kind: 'profile'; personId: string }
  | { kind: 'form'; editingId: string | null }
  | { kind: 'picker'; anchorId: string }
  | { kind: 'creating' }
  | { kind: 'gate'; onUnlocked: () => void }

type LoadState = 'loading' | 'loaded' | 'failed'

type UploadResult = { ok: true } | { ok: false; message: string }

function isIncorrectPassphraseError(err: unknown): boolean {
  return err instanceof Error && /incorrect passphrase/i.test(err.message)
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

  async function load() {
    setLoadState('loading')
    try {
      const [peopleRows, relRows] = await Promise.all([fetchPeople(), fetchRelationships()])
      setPeople(peopleRows)
      setRelationships(relRows)
      if (peopleRows.length > 0) setFocalId((prev) => prev ?? peopleRows[0].id)
      setLoadState('loaded')
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
    setPeople(await fetchPeople())
    setRelationships(await fetchRelationships())
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
    setErrorMessage(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    return false
  }

  async function handleSavePerson(fields: PersonFields) {
    const editingId = panel.kind === 'form' ? panel.editingId : null
    try {
      setErrorMessage(null)
      if (editingId) {
        await updatePerson(editingId, fields)
        await refresh()
        // Editing was launched from a profile panel — return there rather than
        // dropping the user back on the bare tree.
        setPanel({ kind: 'profile', personId: editingId })
      } else {
        const newId = await addPerson(fields)
        if (!focalId) setFocalId(newId)
        await refresh()
        setPanel({ kind: 'none' })
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
      // The anchor becomes the parent of the picked/created person.
      await addRelationship('parent-child', anchorId, otherId)
    } else {
      await addRelationship('spouse', anchorId, otherId)
    }
    await refresh()
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
        />
      )}

      {panel.kind === 'profile' && (
        <PersonProfile
          person={people.find((p) => p.id === panel.personId)!}
          people={people}
          relationships={relationships}
          onEdit={() => requirePassphrase(() => setPanel({ kind: 'form', editingId: panel.personId }))}
          onAddRelationship={() => requirePassphrase(() => setPanel({ kind: 'picker', anchorId: panel.personId }))}
          onOpenPerson={(id) => setPanel({ kind: 'profile', personId: id })}
          onCenterHere={() => setFocalId(panel.personId)}
          onDelete={() => requirePassphrase(() => { void handleDeletePerson(panel.personId) })}
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

      {panel.kind === 'picker' && (
        <RelationshipPicker
          anchorPerson={people.find((p) => p.id === panel.anchorId)!}
          people={people}
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
