import { useState } from 'react'
import type { Person, Relationship } from '../../types'
import { buildAncestorRows, getParentIds, getSiblingIds, getSpouseIds, getDescendantIds } from '../../lib/familyGraph'
import { PersonPatch } from './PersonPatch'
import { SeamLine } from './SeamLine'
import { SiblingFlap } from './SiblingFlap'
import { AddParentSlot } from './AddParentSlot'
import { CollapseToggle } from './CollapseToggle'

interface TreeViewProps {
  people: Person[]
  relationships: Relationship[]
  focalId: string
  onAddParent: (personId: string) => void
  onOpenProfile: (id: string) => void
}

// Renders one descendant and, once expanded, their own children below them.
// The focal person's own children (depth 1) render open by default; every
// generation beyond that starts collapsed behind a CollapseToggle — this is
// the vertical/downward collapse, independent of the sideways sibling flap.
function DescendantBranch({
  personId,
  byId,
  relationships,
  onOpenProfile,
  onDoubleOpen,
  focusedSet,
  defaultExpanded,
}: {
  personId: string
  byId: Map<string, Person>
  relationships: Relationship[]
  onOpenProfile: (id: string) => void
  onDoubleOpen: (id: string) => void
  focusedSet: Set<string> | null
  defaultExpanded: boolean
}) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const person = byId.get(personId)
  if (!person) return null
  const spouseId = getSpouseIds(personId, relationships)[0]
  const spouse = spouseId ? byId.get(spouseId) : null
  const childIds = getDescendantIds(personId, relationships).filter((id) => byId.has(id))
  const stateFor = (id: string) => (focusedSet ? { inFocus: focusedSet.has(id), dimmed: !focusedSet.has(id) } : { inFocus: false, dimmed: false })

  return (
    <div className="gen-column">
      <div className="couple">
        <PersonPatch person={person} {...stateFor(personId)} fresh={false} onOpen={onOpenProfile} onDoubleOpen={onDoubleOpen} />
        {spouse && (
          <>
            <SeamLine kind="spouse" />
            <PersonPatch person={spouse} {...stateFor(spouse.id)} fresh={false} onOpen={onOpenProfile} onDoubleOpen={onDoubleOpen} />
          </>
        )}
        {childIds.length > 0 && (
          <CollapseToggle
            expanded={expanded}
            label={expanded ? `Hide ${person.first_name}’s children` : `Show ${person.first_name}’s children`}
            onToggle={() => setExpanded((v) => !v)}
          />
        )}
      </div>
      {expanded && childIds.length > 0 && (
        <div className="descendants">
          <div className="gen">
            {childIds.map((childId) => (
              <DescendantBranch
                key={childId}
                personId={childId}
                byId={byId}
                relationships={relationships}
                onOpenProfile={onOpenProfile}
                onDoubleOpen={onDoubleOpen}
                focusedSet={focusedSet}
                defaultExpanded={false}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export function TreeView({ people, relationships, focalId, onAddParent, onOpenProfile }: TreeViewProps) {
  const [openFlaps, setOpenFlaps] = useState<Set<string>>(new Set())
  const byId = new Map(people.map((p) => [p.id, p]))
  const rows = buildAncestorRows(focalId, relationships)
  const topDepth = Math.max(...rows.map((r) => r.depth))
  const focalChildren = getDescendantIds(focalId, relationships).filter((id) => byId.has(id))
  const focusedSet = null as Set<string> | null // populated in Task 14

  function toggleFlap(personId: string) {
    setOpenFlaps((prev) => {
      const next = new Set(prev)
      next.has(personId) ? next.delete(personId) : next.add(personId)
      return next
    })
  }

  return (
    <div className="tree">
      {focalChildren.length > 0 && (
        <div className="descendants">
          <div className="gen">
            {focalChildren.map((childId) => (
              <DescendantBranch
                key={childId}
                personId={childId}
                byId={byId}
                relationships={relationships}
                onOpenProfile={onOpenProfile}
                onDoubleOpen={() => {}}
                focusedSet={focusedSet}
                defaultExpanded={false}
              />
            ))}
          </div>
        </div>
      )}
      {rows.map((row) => (
        <div className="gen" key={row.depth}>
          {row.units.map((unit) => {
            const person = byId.get(unit.personId)
            if (!person) return null
            const spouse = unit.spouseId ? byId.get(unit.spouseId) : null
            const siblingIds = getSiblingIds(unit.personId, relationships).filter((id) => byId.has(id))
            const hasParents = getParentIds(unit.personId, relationships).length > 0
            const isTopmost = row.depth === topDepth

            return (
              <div className="gen-column" key={unit.personId}>
                {isTopmost && !hasParents && <AddParentSlot onClick={() => onAddParent(unit.personId)} />}
                <div className="couple">
                  <PersonPatch person={person} inFocus={false} dimmed={false} fresh={false} onOpen={onOpenProfile} onDoubleOpen={() => {}} />
                  {spouse && (
                    <>
                      <SeamLine kind="spouse" />
                      <PersonPatch person={spouse} inFocus={false} dimmed={false} fresh={false} onOpen={onOpenProfile} onDoubleOpen={() => {}} />
                    </>
                  )}
                </div>
                {siblingIds.length > 0 && (
                  <>
                    <SiblingFlap
                      count={siblingIds.length}
                      open={openFlaps.has(unit.personId)}
                      onToggle={() => toggleFlap(unit.personId)}
                    />
                    {openFlaps.has(unit.personId) && (
                      <div className="gen" style={{ marginTop: 8 }}>
                        {siblingIds.map((sibId) => {
                          const sibling = byId.get(sibId)
                          if (!sibling) return null
                          const sibSpouseId = getSpouseIds(sibId, relationships)[0]
                          const sibSpouse = sibSpouseId ? byId.get(sibSpouseId) : null
                          return (
                            <div className="couple" key={sibId}>
                              <PersonPatch person={sibling} inFocus={false} dimmed={false} fresh={false} onOpen={onOpenProfile} onDoubleOpen={() => {}} />
                              {sibSpouse && (
                                <>
                                  <SeamLine kind="spouse" />
                                  <PersonPatch person={sibSpouse} inFocus={false} dimmed={false} fresh={false} onOpen={onOpenProfile} onDoubleOpen={() => {}} />
                                </>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </>
                )}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
