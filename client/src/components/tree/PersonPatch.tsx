import { useEffect, useRef, useState } from 'react'
import type { Person } from '../../types'
import { Icon } from '../shared/Icon'
import { getPrimaryPhoto } from '../../api/photos'

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

  // Each card fetches its own thumbnail independently — this is the single
  // render path every tree location (ancestor rows, both sides of every
  // couple, sibling lists, descendant branches) already goes through via
  // Couple.tsx, so this covers all of them without needing to thread a photo
  // prop through each call site individually.
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    void getPrimaryPhoto(person.id).then((url) => {
      if (!cancelled) setPhotoUrl(url)
    })
    return () => {
      cancelled = true
    }
  }, [person.id])

  // A real browser always fires `click` before `dblclick` — a double-click
  // is `click, click, dblclick`. Sibling patches single-click to re-center
  // the whole tree (a destructive-feeling action for an accidental double
  // click), so the single-click side effect is held behind a short timer and
  // cancelled if a double-click arrives first, matching the standard
  // double-click disambiguation pattern.
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (clickTimer.current) clearTimeout(clickTimer.current)
    }
  }, [])

  function handleClick() {
    // A real double-click fires TWO `click` events before `dblclick` (not
    // one) — mousedown/mouseup/click, mousedown/mouseup/click, dblclick. If
    // each click started its own independent timer without clearing the
    // previous one, the first timer would survive the dblclick's cancel
    // (which only clears the *latest* timer ref) and still fire `onOpen`
    // late. Clearing any pending timer before arming a new one makes this a
    // proper debounce: at most one timer is ever live, so a genuine
    // dblclick's cancel always reaches the only outstanding timer.
    if (clickTimer.current) clearTimeout(clickTimer.current)
    clickTimer.current = setTimeout(() => {
      onOpen(person.id)
      clickTimer.current = null
    }, 250)
  }

  function handleDoubleClick() {
    if (clickTimer.current) {
      clearTimeout(clickTimer.current)
      clickTimer.current = null
    }
    onDoubleOpen(person.id)
  }

  return (
    <div
      className={classes}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
    >
      <div className="thumb">
        {photoUrl ? <img src={photoUrl} alt="" /> : <Icon name="photo" size={18} />}
      </div>
      <div className="name">{name}</div>
      <div className="years">{formatYears(person)}</div>
      {fresh && <div className="fresh-badge" title="Recently added or edited" />}
    </div>
  )
}
