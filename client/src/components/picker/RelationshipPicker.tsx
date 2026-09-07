import { useState } from 'react'
import type { Person, Relationship } from '../../types'
import { Icon } from '../shared/Icon'
import { Button } from '../shared/Button'
import { getParentIds } from '../../lib/familyGraph'

// UI-facing pick kind: distinguishes "the picked person becomes the anchor's
// parent" from "the picked person becomes the anchor's child" — a direction
// the DB-facing RelationshipType ('parent-child' | 'spouse') doesn't carry on
// its own. Callers translate this into the correct addRelationship from/to
// order (see App.tsx's handleLinkExisting).
export type PickKind = 'parent' | 'child' | 'spouse' | 'sibling'

interface RelationshipPickerProps {
  anchorPerson: Person
  people: Person[]
  relationships: Relationship[]
  onLinkExisting: (kind: PickKind, personId: string) => void
  onCreateNew: (kind: PickKind, searchText: string) => void
  onCancel: () => void
}

const TYPES: PickKind[] = ['parent', 'child', 'spouse', 'sibling']
const LABELS: Record<PickKind, string> = { parent: 'Parent', child: 'Child', spouse: 'Spouse', sibling: 'Sibling' }

// Same first + last name combination used in the result row, so search
// matches whatever the user actually sees (including a last-name-only query).
function displayName(p: Person): string {
  return p.last_name ? `${p.first_name} ${p.last_name}` : p.first_name
}

export function RelationshipPicker({ anchorPerson, people, relationships, onLinkExisting, onCreateNew, onCancel }: RelationshipPickerProps) {
  const [type, setType] = useState<PickKind>('parent')
  const [search, setSearch] = useState('')
  const anchorHasParents = getParentIds(anchorPerson.id, relationships).length > 0

  const results = people.filter(
    (p) => p.id !== anchorPerson.id && search.length > 0 && displayName(p).toLowerCase().includes(search.toLowerCase()),
  )

  // Selecting a disabled type is blocked at the point of action (linking or
  // creating), not at the point of selection — so the type row still shows
  // "Sibling" as chosen, styled disabled, while nothing fires until the
  // anchor has a recorded parent.
  const typeIsBlocked = type === 'sibling' && !anchorHasParents

  return (
    <div className="picker-shell">
      <div className="profile-name" style={{ fontSize: 18, marginBottom: 2 }}>
        Add relationship to {anchorPerson.first_name}
      </div>
      <p className="callout" style={{ marginBottom: 16 }}>Choose the relationship type, then find or create the person.</p>

      <div className="rel-type-row">
        {TYPES.map((t) => {
          const disabled = t === 'sibling' && !anchorHasParents
          return (
            <div
              key={t}
              className={['rel-type', type === t ? 'selected' : '', disabled ? 'disabled' : ''].filter(Boolean).join(' ')}
              aria-disabled={disabled}
              onClick={() => setType(t)}
            >
              {LABELS[t]}
            </div>
          )
        })}
      </div>
      {!anchorHasParents && <p className="callout">Add a parent first to add siblings.</p>}

      <input className="field" placeholder="Search existing people…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ marginBottom: 12 }} />

      {results.length > 0 && (
        <div className="result-list">
          {results.map((p) => (
            <div className="result-row" key={p.id} onClick={() => { if (!typeIsBlocked) onLinkExisting(type, p.id) }}>
              <div className="result-avatar"><Icon name="photo" size={14} /></div>
              <div>{displayName(p)}</div>
            </div>
          ))}
        </div>
      )}

      {search.length > 0 && (
        <div className="create-new-row" onClick={() => { if (!typeIsBlocked) onCreateNew(type, search) }}>
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
