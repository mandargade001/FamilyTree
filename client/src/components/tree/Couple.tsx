import type { ReactNode } from 'react'
import type { Person } from '../../types'
import { isFresh } from '../../lib/freshness'
import { PersonPatch } from './PersonPatch'
import { SeamLine } from './SeamLine'

export interface PersonVisualState {
  inFocus: boolean
  dimmed: boolean
}

const DEFAULT_STATE: PersonVisualState = { inFocus: false, dimmed: false }

interface CoupleProps {
  person: Person
  spouse?: Person | null
  onOpen: (id: string) => void
  onDoubleOpen: (id: string) => void
  personState?: PersonVisualState
  spouseState?: PersonVisualState
  children?: ReactNode
}

// Shared couple-patch markup: a person, optionally seamed to their spouse.
// Used for the main ancestor row, the sibling-flap list, and DescendantBranch
// so couple rendering only needs to change in one place.
export function Couple({
  person,
  spouse,
  onOpen,
  onDoubleOpen,
  personState = DEFAULT_STATE,
  spouseState = DEFAULT_STATE,
  children,
}: CoupleProps) {
  return (
    <div className="couple">
      <PersonPatch person={person} {...personState} fresh={isFresh(person)} onOpen={onOpen} onDoubleOpen={onDoubleOpen} />
      {spouse && (
        <>
          <SeamLine kind="spouse" />
          <PersonPatch person={spouse} {...spouseState} fresh={isFresh(spouse)} onOpen={onOpen} onDoubleOpen={onDoubleOpen} />
        </>
      )}
      {children}
    </div>
  )
}
