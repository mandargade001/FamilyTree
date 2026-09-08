import { Fragment, useEffect, useLayoutEffect, useState, type MouseEvent, type ReactNode } from 'react'
import type { Person, Relationship } from '../../types'
import { buildAncestorRows, computeImmediateFamily, getParentIds, getSiblingIds, getSpouseIds, getDescendantIds } from '../../lib/familyGraph'
import { Couple, type PersonVisualState } from './Couple'
import { SiblingFlap } from './SiblingFlap'
import { AddParentSlot } from './AddParentSlot'
import { CollapseToggle } from './CollapseToggle'
import { SeamLine } from './SeamLine'

const NEUTRAL_STATE: PersonVisualState = { inFocus: false, dimmed: false }

function clusterLabel(person: Person, spouse: Person | null): string | null {
  if (!person.last_name) return null
  if (!spouse) return person.last_name
  return spouse.last_name === person.last_name ? person.last_name : null
}

interface ColumnSegment {
  id: string
  label: string | null
  node: ReactNode
}

// Groups adjacent same-label segments into one boxed, captioned
// .family-cluster; a null-label segment (no determinable surname) normally
// stands alone, unboxed, next to whatever's on either side of it. Callers
// only invoke this when boxing has already been decided as warranted (see
// `shouldGroup` at the call site) — this function doesn't itself decide
// whether to box anything, only how to partition segments once boxing is
// happening.
//
// `forceLeadBox`: when true (row.units.length > 1 — two unrelated lineages
// sharing one ancestor row), the first segment (the unit's couple column)
// must always render inside a `.family-cluster` box even if its label is
// null, so the row keeps a visible boundary between lineages. The caption
// is simply omitted when there's no label, matching the pre-fix behavior's
// `{label && ...}` pattern. Any OTHER null-label segment that ends up
// unboxed here (this function only runs when at least one real box is
// being drawn somewhere in the unit) still gets a `.family-cluster-spacer`
// wrapper — same padding/border-width as a real box, transparent border —
// so its content baseline-aligns with its boxed neighbors instead of
// sitting higher in the row.
function groupSegmentsIntoClusters(segments: ColumnSegment[], forceLeadBox: boolean): ReactNode {
  const output: ReactNode[] = []
  let i = 0
  while (i < segments.length) {
    const { label } = segments[i]
    if (label === null) {
      const boxed = i === 0 && forceLeadBox
      output.push(
        <div className={boxed ? 'family-cluster' : 'family-cluster-spacer'} key={segments[i].id}>
          {segments[i].node}
        </div>,
      )
      i += 1
      continue
    }
    const run: ReactNode[] = []
    let j = i
    while (j < segments.length && segments[j].label === label) {
      run.push(segments[j].node)
      j += 1
    }
    output.push(
      <div className="family-cluster" key={segments[i].id}>
        <div className="family-cluster-label">{label}</div>
        {run}
      </div>,
    )
    i = j
  }
  return output
}

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
  onCenterOn: (id: string) => void
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
      {/* This seam represents the connection UP to this person's own parent,
          which always exists for anyone rendered in DescendantBranch (they're
          only here because they ARE someone's child) — so it renders
          unconditionally, not gated on having children of their own. It must
          be a sibling of <Couple>, not a child passed into it: <Couple>
          renders its children inside `.couple`, a horizontal flex row, which
          would lay the seam out sideways next to the spouse patch instead of
          above/below the couple. `.gen-column` (this component's own
          wrapper) is vertical-flex, matching the ancestor-row seam's correct
          placement. */}
      <SeamLine kind="parent-child" />
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

export function TreeView({ people, relationships, focalId, onAddParent, onOpenProfile, onCenterOn }: TreeViewProps) {
  const [openFlaps, setOpenFlaps] = useState<Set<string>>(new Set())
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const [focusModeEnabled, setFocusModeEnabled] = useState(false)
  const [maxAncestorDepth, setMaxAncestorDepth] = useState(1)
  const byId = new Map(people.map((p) => [p.id, p]))
  const rows = buildAncestorRows(focalId, relationships)
  const visibleRows = rows.filter((row) => row.depth <= maxAncestorDepth)
  const hasMoreAncestors = rows.some((row) => row.depth > maxAncestorDepth)
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

  // Re-centering the tree on a new focal person (via a sibling click, an
  // "Add Parent" flow, etc.) should reset the ancestor window back to just
  // immediate parents, close any open sibling flaps, and clear any active
  // Focus Mode dimming — an expanded/focused state built around the previous
  // focal person doesn't make sense for the new one (stale dimming plus a
  // lingering "Exit focus" button that no longer refers to anything
  // sensible). This must run via useLayoutEffect, not useEffect: a plain
  // effect runs after the browser paints, so the FIRST paint after
  // `focalId` changes would still show the new focal person's tree combined
  // with the OLD depth/flaps/focus state — a visible flash/jump before the
  // reset effect runs and triggers a second paint. useLayoutEffect runs
  // synchronously before paint, so the reset is applied before the user ever
  // sees the stale intermediate state.
  useLayoutEffect(() => {
    setMaxAncestorDepth(1)
    setOpenFlaps(new Set())
    setFocusedId(null)
  }, [focalId])

  // Clicking the tree's background (not a patch/chip/button) also clears
  // focus when active. Interactive elements (patches, flaps, toggles, slots)
  // are all distinct nested elements, so a click that bubbles up from one of
  // them is excluded by checking for a `closest` interactive ancestor rather
  // than requiring the click to land exactly on the outer `.tree` element.
  function handleBackgroundClick(e: MouseEvent<HTMLDivElement>) {
    if (!focusedId) return
    const target = e.target as HTMLElement
    if (target.closest('.patch, .rel-chip, .collapse-dot, .add-parent-slot, button')) return
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

  // Sibling-column patches single-click to re-center the tree instead of
  // opening a profile — but that must still respect Focus Mode the same way
  // handleOpen does for every other patch, or toggling Focus Mode on and
  // clicking a sibling silently keeps re-centering instead of focusing.
  function handleSiblingOpen(personId: string) {
    if (focusModeEnabled) {
      focusOn(personId)
    } else {
      onCenterOn(personId)
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

  // Sibling columns render only a Couple, with nothing above it. The owner's
  // own column can have a `.couple-slots` Add-Parent row above its Couple
  // (see `anyMissingParent` below) — when it does, every sibling column in
  // the same `.gen` row needs a same-height reserved spacer above its Couple
  // too, or `align-items: flex-start` on `.gen` leaves the owner's Couple
  // sitting visibly lower than the siblings', undoing Task 3's fix.
  function renderSiblingColumn(sibId: string, sibling: Person, sibSpouse: Person | null, reserveTopSlot: boolean): ReactNode {
    return (
      <div className="gen-column" key={sibId}>
        {reserveTopSlot && <div className="sibling-slot-reserve" aria-hidden="true" />}
        <Couple
          person={sibling}
          spouse={sibSpouse}
          onOpen={handleSiblingOpen}
          onDoubleOpen={focusOn}
          personState={patchState(sibId)}
          spouseState={sibSpouse ? patchState(sibSpouse.id) : undefined}
        />
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
      {visibleRows.map((row) => (
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

            const coupleColumn = (
              <div className="gen-column" key="couple">
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
                {(row.depth > 0 || focalChildren.length > 0) && <SeamLine kind="parent-child" />}
              </div>
            )

            const segments: ColumnSegment[] = [
              { id: `couple-${unit.personId}`, label: clusterLabel(person, spouse), node: coupleColumn },
            ]

            function addSiblingSegments(siblingIds: string[], ownerId: string) {
              if (siblingIds.length === 0 || !openFlaps.has(ownerId)) return
              for (const sibId of siblingIds) {
                const sibling = byId.get(sibId)
                if (!sibling) continue
                const sibSpouseId = getSpouseIds(sibId, relationships)[0]
                const sibSpouse = sibSpouseId ? byId.get(sibSpouseId) ?? null : null
                segments.push({
                  id: sibId,
                  label: clusterLabel(sibling, sibSpouse),
                  node: renderSiblingColumn(sibId, sibling, sibSpouse, anyMissingParent),
                })
              }
            }
            addSiblingSegments(personSiblingIds, unit.personId)
            if (spouse) addSiblingSegments(spouseSiblingIds, spouse.id)

            const distinctLabels = new Set(segments.map((s) => s.label).filter((l): l is string => l !== null))
            const shouldGroup = row.units.length > 1 || distinctLabels.size >= 2

            return (
              <Fragment key={unit.personId}>
                {shouldGroup
                  ? groupSegmentsIntoClusters(segments, row.units.length > 1)
                  : segments.map((s) => <Fragment key={s.id}>{s.node}</Fragment>)}
              </Fragment>
            )
          })}
        </div>
      ))}
      {hasMoreAncestors && (
        <button className="show-more-ancestors" onClick={() => setMaxAncestorDepth((d) => d + 1)}>
          Show more ancestors
        </button>
      )}
    </div>
  )
}
