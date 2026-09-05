import type { Person, Relationship } from '../../types'
import { computeImmediateFamily } from '../../lib/familyGraph'
import { Icon } from '../shared/Icon'
import { Button } from '../shared/Button'

interface PersonProfileProps {
  person: Person
  people: Person[]
  relationships: Relationship[]
  onEdit: () => void
  onAddRelationship: () => void
  onOpenPerson: (id: string) => void
}

export function PersonProfile({ person, people, relationships, onEdit, onAddRelationship, onOpenPerson }: PersonProfileProps) {
  const byId = new Map(people.map((p) => [p.id, p]))
  const family = computeImmediateFamily(person.id, relationships)
  const name = [person.first_name, person.last_name].filter(Boolean).join(' ')
  const meta = [person.birth_date && `b. ${person.birth_date}`, person.birth_place, person.occupation].filter(Boolean).join(' · ')

  const chips: { role: string; personId: string }[] = [
    ...family.parents.map((id) => ({ role: 'Parent', personId: id })),
    ...(family.spouse ? [{ role: 'Spouse', personId: family.spouse }] : []),
    ...family.children.map((id) => ({ role: 'Child', personId: id })),
  ]

  return (
    <div className="profile-layout">
      <div>
        <div className="profile-photo"><Icon name="photo" size={28} /></div>
      </div>
      <div>
        <div className="profile-name">{name}</div>
        {meta && <div className="profile-meta">{meta}</div>}
        <Button variant="ghost" onClick={onEdit}><Icon name="edit" size={14} /> Edit Profile</Button>

        <div className="section-title">Relationships</div>
        <div>
          {chips.map(({ role, personId }) => {
            const related = byId.get(personId)
            if (!related) return null
            return (
              <span className="rel-chip" key={personId} onClick={() => onOpenPerson(personId)}>
                {role} · {related.first_name}
              </span>
            )
          })}
          <span className="rel-chip add" onClick={onAddRelationship}>
            <Icon name="plus" size={12} /> Add relationship
          </span>
        </div>

        {person.bio && (
          <>
            <div className="section-title">Life events &amp; bio</div>
            <p className="bio-text">{person.bio}</p>
          </>
        )}
      </div>
    </div>
  )
}
