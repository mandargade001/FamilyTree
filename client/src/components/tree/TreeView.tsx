import { useState } from 'react'
import type { Person, Relationship } from '../../types'
import { buildAncestorRows, getParentIds, getSiblingIds, getSpouseIds, getDescendantIds } from '../../lib/familyGraph'
import { Couple } from './Couple'
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
      <Couple
        person={person}
        spouse={spouse}
        onOpen={onOpenProfile}
        onDoubleOpen={onDoubleOpen}
        personState={stateFor(personId)}
        spouseState={spouse ? stateFor(spouse.id) : undefined}
      >
        {childIds.length > 0 && (
          <CollapseToggle
            expanded={expanded}
            label={expanded ? `Hide ${person.first_name}’s children` : `Show ${person.first_name}’s children`}
            onToggle={() => setExpanded((v) => !v)}
          />
        )}
      </Couple>
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
  const focalChildren = getDescendantIds(focalId, relationships).filter((id) => byId.has(id))
  const focusedSet = null as Set<string> | null // populated in Task 14

  function toggleFlap(personId: string) {
    setOpenFlaps((prev) => {
      const next = new Set(prev)
      next.has(personId) ? next.delete(personId) : next.add(personId)
      return next
    })
  }

  // For a given ancestor-row member (whether the row unit's anchor or their
  // spouse), a missing recorded parent and a set of recorded siblings are
  // both independent per-person facts — buildAncestorRows' choice of which
  // side becomes `personId` vs `spouseId` is arbitrary w.r.t. the underlying
  // relationship data, so both sides of a couple must be checked separately.
  function siblingsOf(personId: string) {
    return getSiblingIds(personId, relationships).filter((id) => byId.has(id))
  }

  function renderSiblingList(ids: string[]) {
    return (
      <div className="gen sibling-list">
        {ids.map((sibId) => {
          const sibling = byId.get(sibId)
          if (!sibling) return null
          const sibSpouseId = getSpouseIds(sibId, relationships)[0]
          const sibSpouse = sibSpouseId ? byId.get(sibSpouseId) : null
          return <Couple key={sibId} person={sibling} spouse={sibSpouse} onOpen={onOpenProfile} onDoubleOpen={() => {}} />
        })}
      </div>
    )
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

            const personHasParents = getParentIds(unit.personId, relationships).length > 0
            const spouseHasParents = spouse ? getParentIds(spouse.id, relationships).length > 0 : true
            const personSiblingIds = siblingsOf(unit.personId)
            const spouseSiblingIds = spouse ? siblingsOf(spouse.id) : []

            const anyMissingParent = !personHasParents || (spouse ? !spouseHasParents : false)
            const anyHasSiblings = personSiblingIds.length > 0 || spouseSiblingIds.length > 0

            return (
              <div className="gen-column" key={unit.personId}>
                {anyMissingParent && (
                  <div className="couple-slots">
                    <div className="person-slot">
                      {!personHasParents && <AddParentSlot onClick={() => onAddParent(unit.personId)} />}
                    </div>
                    {spouse && (
                      <div className="person-slot">
                        {!spouseHasParents && <AddParentSlot onClick={() => onAddParent(spouse.id)} />}
                      </div>
                    )}
                  </div>
                )}
                <Couple person={person} spouse={spouse} onOpen={onOpenProfile} onDoubleOpen={() => {}} />
                {anyHasSiblings && (
                  <div className="couple-slots">
                    <div className="person-slot">
                      {personSiblingIds.length > 0 && (
                        <SiblingFlap
                          count={personSiblingIds.length}
                          open={openFlaps.has(unit.personId)}
                          onToggle={() => toggleFlap(unit.personId)}
                        />
                      )}
                    </div>
                    {spouse && (
                      <div className="person-slot">
                        {spouseSiblingIds.length > 0 && (
                          <SiblingFlap
                            count={spouseSiblingIds.length}
                            open={openFlaps.has(spouse.id)}
                            onToggle={() => toggleFlap(spouse.id)}
                          />
                        )}
                      </div>
                    )}
                  </div>
                )}
                {personSiblingIds.length > 0 && openFlaps.has(unit.personId) && renderSiblingList(personSiblingIds)}
                {spouse && spouseSiblingIds.length > 0 && openFlaps.has(spouse.id) && renderSiblingList(spouseSiblingIds)}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
