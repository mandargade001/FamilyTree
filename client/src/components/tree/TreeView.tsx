import { useEffect, useState, type MouseEvent } from 'react'
import type { Person, Relationship } from '../../types'
import { buildAncestorRows, computeImmediateFamily, getParentIds, getSiblingIds, getSpouseIds, getDescendantIds } from '../../lib/familyGraph'
import { Couple, type PersonVisualState } from './Couple'
import { SiblingFlap } from './SiblingFlap'
import { AddParentSlot } from './AddParentSlot'
import { CollapseToggle } from './CollapseToggle'

const NEUTRAL_STATE: PersonVisualState = { inFocus: false, dimmed: false }

function focusSetFor(personId: string, relationships: Relationship[]): Set<string> {
  const family = computeImmediateFamily(personId, relationships)
  return new Set([
    personId,
    ...family.parents,
    ...(family.spouse ? [family.spouse] : []),
    ...family.children,
    ...family.siblings,
  ])
}

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
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const [focusModeEnabled, setFocusModeEnabled] = useState(false)
  const byId = new Map(people.map((p) => [p.id, p]))
  const rows = buildAncestorRows(focalId, relationships)
  const focalChildren = getDescendantIds(focalId, relationships).filter((id) => byId.has(id))

  const focusedSet = focusedId ? focusSetFor(focusedId, relationships) : null

  function toggleFlap(personId: string) {
    setOpenFlaps((prev) => {
      const next = new Set(prev)
      next.has(personId) ? next.delete(personId) : next.add(personId)
      return next
    })
  }

  // Auto-expand any flap (on either the anchor or spouse side of a row unit)
  // whose contents overlap the newly focused family — e.g. focusing a
  // parent should still auto-reveal that parent's *other children* even
  // though those children aren't the parent's own "siblings"; checking
  // against the full computed focus set (not just family.siblings) covers
  // that case as well as the sibling-focused case.
  function focusOn(personId: string) {
    const newFocusSet = focusSetFor(personId, relationships)
    setOpenFlaps((prev) => {
      const next = new Set(prev)
      for (const row of rows) {
        for (const unit of row.units) {
          const owners = [unit.personId, unit.spouseId].filter((id): id is string => !!id)
          for (const ownerId of owners) {
            const siblingIds = getSiblingIds(ownerId, relationships)
            if (siblingIds.some((s) => newFocusSet.has(s))) {
              next.add(ownerId)
            }
          }
        }
      }
      return next
    })
    setFocusedId(personId)
  }

  function clearFocus() {
    setFocusedId(null)
  }

  // Escape clears focus mode too, not just the "Exit focus" button. Only
  // listen while there's an active focus, and clean up on every re-run so
  // there's never more than one listener attached across renders/unmounts.
  useEffect(() => {
    if (!focusedId) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') clearFocus()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [focusedId])

  // Clicking the tree's background (not a patch/chip/button) also clears
  // focus when active. Interactive elements (patches, flaps, toggles, slots)
  // are all distinct nested elements, so a click that bubbles up from one of
  // them is excluded by checking for a `closest` interactive ancestor rather
  // than requiring the click to land exactly on the outer `.tree` element.
  function handleBackgroundClick(e: MouseEvent<HTMLDivElement>) {
    if (!focusedId) return
    const target = e.target as HTMLElement
    if (target.closest('.patch, .flap, .rel-chip, .collapse-dot, .add-parent-slot, button')) return
    clearFocus()
  }

  function patchState(personId: string): PersonVisualState {
    if (!focusedSet) return NEUTRAL_STATE
    return { inFocus: focusedSet.has(personId), dimmed: !focusedSet.has(personId) }
  }

  // When Focus Mode is toggled on, a single click on a patch focuses that
  // person instead of opening their profile; double-click always focuses,
  // regardless of the toggle.
  function handleOpen(personId: string) {
    if (focusModeEnabled) {
      focusOn(personId)
    } else {
      onOpenProfile(personId)
    }
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
          return (
            <Couple
              key={sibId}
              person={sibling}
              spouse={sibSpouse}
              onOpen={handleOpen}
              onDoubleOpen={focusOn}
              personState={patchState(sibId)}
              spouseState={sibSpouse ? patchState(sibSpouse.id) : undefined}
            />
          )
        })}
      </div>
    )
  }

  return (
    <div className="tree" onClick={handleBackgroundClick}>
      {focusedId && (
        <button className="exit-focus" onClick={clearFocus}>Exit focus</button>
      )}
      <button
        className={`focus-mode-toggle${focusModeEnabled ? ' active' : ''}`}
        onClick={() => setFocusModeEnabled((v) => !v)}
      >
        Focus Mode
      </button>
      {focalChildren.length > 0 && (
        <div className="descendants">
          <div className="gen">
            {focalChildren.map((childId) => (
              <DescendantBranch
                key={childId}
                personId={childId}
                byId={byId}
                relationships={relationships}
                onOpenProfile={handleOpen}
                onDoubleOpen={focusOn}
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
                <Couple
                  person={person}
                  spouse={spouse}
                  onOpen={handleOpen}
                  onDoubleOpen={focusOn}
                  personState={patchState(unit.personId)}
                  spouseState={spouse ? patchState(spouse.id) : undefined}
                />
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
