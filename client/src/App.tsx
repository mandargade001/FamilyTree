import { useEffect, useState } from 'react'
import type { Person, PersonFields, Relationship, RelationshipType } from './types'
import { fetchPeople, addPerson, updatePerson, deletePerson } from './api/people'
import { fetchRelationships, addRelationship } from './api/relationships'
import { getPassphrase } from './lib/passphrase'
import { TreeView } from './components/tree/TreeView'
import { PersonProfile } from './components/profile/PersonProfile'
import { PersonForm } from './components/form/PersonForm'
import { RelationshipPicker } from './components/picker/RelationshipPicker'
import { PassphraseGate } from './components/gate/PassphraseGate'

type Panel =
  | { kind: 'none' }
  | { kind: 'profile'; personId: string }
  | { kind: 'form'; editingId: string | null }
  | { kind: 'picker'; anchorId: string }
  | { kind: 'gate'; onUnlocked: () => void }

export default function App() {
  const [people, setPeople] = useState<Person[]>([])
  const [relationships, setRelationships] = useState<Relationship[]>([])
  const [focalId, setFocalId] = useState<string | null>(null)
  const [panel, setPanel] = useState<Panel>({ kind: 'none' })

  useEffect(() => {
    fetchPeople().then((rows) => {
      setPeople(rows)
      if (rows.length > 0) setFocalId((prev) => prev ?? rows[0].id)
    })
    fetchRelationships().then(setRelationships)
  }, [])

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

  async function handleSavePerson(fields: PersonFields) {
    const editingId = panel.kind === 'form' ? panel.editingId : null
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
  }

  async function handleLinkExisting(anchorId: string, type: RelationshipType, otherId: string) {
    if (type === 'parent-child') {
      await addRelationship('parent-child', otherId, anchorId)
    } else {
      await addRelationship('spouse', anchorId, otherId)
    }
    await refresh()
    setPanel({ kind: 'profile', personId: anchorId })
  }

  if (people.length === 0) {
    return (
      <div className="app">
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
          onLinkExisting={(type, personId) => handleLinkExisting(panel.anchorId, type, personId)}
          onCreateNew={(type, searchText) => {
            const anchorId = panel.anchorId
            setPanel({ kind: 'form', editingId: null })
            void (async () => {
              try {
                const newId = await addPerson({ first_name: searchText, last_name: null, gender: null, birth_date: null, death_date: null, birth_place: null, occupation: null, bio: null })
                await handleLinkExisting(anchorId, type, newId)
              } catch (err) {
                console.error('Failed to create and link new person', err)
                setPanel({ kind: 'profile', personId: anchorId })
              }
            })()
          }}
        />
      )}

      {panel.kind === 'gate' && (
        <PassphraseGate onUnlocked={panel.onUnlocked} onCancel={() => setPanel({ kind: 'none' })} />
      )}
    </div>
  )
}
