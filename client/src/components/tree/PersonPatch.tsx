import type { Person } from '../../types'
import { Icon } from '../shared/Icon'

interface PersonPatchProps {
  person: Person
  inFocus: boolean
  dimmed: boolean
  fresh: boolean
  onOpen: (id: string) => void
  onDoubleOpen: (id: string) => void
}

function formatYears(person: Person): string {
  if (person.death_date) return `${person.birth_date ?? '?'}–${person.death_date}`
  if (person.birth_date) return `b. ${person.birth_date}`
  return ''
}

export function PersonPatch({ person, inFocus, dimmed, fresh, onOpen, onDoubleOpen }: PersonPatchProps) {
  const classes = ['patch', inFocus ? 'in-focus' : '', dimmed ? 'dimmed' : ''].filter(Boolean).join(' ')
  const name = [person.first_name, person.last_name].filter(Boolean).join(' ')

  return (
    <div
      className={classes}
      onClick={() => onOpen(person.id)}
      onDoubleClick={() => onDoubleOpen(person.id)}
    >
      <div className="thumb"><Icon name="photo" size={18} /></div>
      <div className="name">{name}</div>
      <div className="years">{formatYears(person)}</div>
      {fresh && <div className="fresh-badge" title="Recently added or edited" />}
    </div>
  )
}
