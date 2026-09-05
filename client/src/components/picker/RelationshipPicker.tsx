import { useState } from 'react'
import type { Person } from '../../types'
import { Icon } from '../shared/Icon'
import { Button } from '../shared/Button'

// UI-facing pick kind: distinguishes "the picked person becomes the anchor's
// parent" from "the picked person becomes the anchor's child" — a direction
// the DB-facing RelationshipType ('parent-child' | 'spouse') doesn't carry on
// its own. Callers translate this into the correct addRelationship from/to
// order (see App.tsx's handleLinkExisting).
export type PickKind = 'parent' | 'child' | 'spouse'

interface RelationshipPickerProps {
  anchorPerson: Person
  people: Person[]
  onLinkExisting: (kind: PickKind, personId: string) => void
  onCreateNew: (kind: PickKind, searchText: string) => void
  onCancel: () => void
}

const TYPES: PickKind[] = ['parent', 'child', 'spouse']
const LABELS: Record<PickKind, string> = { parent: 'Parent', child: 'Child', spouse: 'Spouse' }

export function RelationshipPicker({ anchorPerson, people, onLinkExisting, onCreateNew, onCancel }: RelationshipPickerProps) {
  const [type, setType] = useState<PickKind>('parent')
  const [search, setSearch] = useState('')

  const results = people.filter(
    (p) => p.id !== anchorPerson.id && p.first_name.toLowerCase().includes(search.toLowerCase()) && search.length > 0,
  )

  return (
    <div className="picker-shell">
      <div className="profile-name" style={{ fontSize: 18, marginBottom: 2 }}>
        Add relationship to {anchorPerson.first_name}
      </div>
      <p className="callout" style={{ marginBottom: 16 }}>Choose the relationship type, then find or create the person.</p>

      <div className="rel-type-row">
        {TYPES.map((t) => (
          <div key={t} className={['rel-type', type === t ? 'selected' : ''].filter(Boolean).join(' ')} onClick={() => setType(t)}>
            {LABELS[t]}
          </div>
        ))}
      </div>

      <input className="field" placeholder="Search existing people…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ marginBottom: 12 }} />

      {results.length > 0 && (
        <div className="result-list">
          {results.map((p) => (
            <div className="result-row" key={p.id} onClick={() => onLinkExisting(type, p.id)}>
              <div className="result-avatar"><Icon name="photo" size={14} /></div>
              <div>{p.first_name}</div>
            </div>
          ))}
        </div>
      )}

      {search.length > 0 && (
        <div className="create-new-row" onClick={() => onCreateNew(type, search)}>
          <Icon name="plus" size={14} />
          Create new person "{search}"
        </div>
      )}

      <div className="form-actions">
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  )
}
