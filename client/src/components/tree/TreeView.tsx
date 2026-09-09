import { Fragment, useEffect, useLayoutEffect, useState, type MouseEvent, type ReactNode } from 'react'
import type { Person, Relationship } from '../../types'
import { buildAncestorRows, computeImmediateFamily, getParentIds, getSiblingIds, getSpouseIds, getDescendantIds, type AncestorUnit } from '../../lib/familyGraph'
import { computeAncestorLayout } from '../../lib/ancestorLayout'
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

  // The root (depth-0) ancestor-row unit is the focal couple's own row —
  // used both to decide whether an open flap forces the flex fallback (any
  // flap NOT on the focal couple's own person/spouse ids counts as "deep")
  // and reused by renderAncestorGrid below to append the focal couple's own
  // revealed sibling columns.
  const rootUnit = visibleRows.find((row) => row.depth === 0)?.units[0] ?? null
  const rootDepth0Ids = rootUnit ? [rootUnit.personId, rootUnit.spouseId].filter((id): id is string => id !== null) : []
  const hasDeepFlapOpen = [...openFlaps].some((id) => !rootDepth0Ids.includes(id))

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

  // Sibling columns render only a Couple, with nothing above it (plus,
  // optionally, a spacer below it — see `bottomReserve`). The owner's own
  // column can have a `.couple-slots` Add-Parent row above its Couple (see
  // `anyMissingParent` below) — when it does (flex path only), every sibling
  // column in the same `.gen` row needs a same-height reserved spacer above
  // its Couple too, or `align-items: flex-start` on `.gen` leaves the
  // owner's Couple sitting visibly lower than the siblings', undoing Task
  // 3's fix. `bottomReserve` is the grid path's equivalent fix for the
  // opposite edge: under `align-self: end` (bottom-alignment), a sibling
  // column (which never shows its own sibling-flap row) ends right after
  // its Couple, while the focal couple's own `.gen-column` ends with a
  // sibling-flap row — bottom-aligned, the sibling's Couple would sit lower
  // than the focal couple's. `reserveTopSlot` is a no-op under
  // bottom-alignment (it only pads the top of a stretched column), so the
  // grid path never passes it; only the flex path does.
  function renderSiblingColumn(
    sibId: string,
    sibling: Person,
    sibSpouse: Person | null,
    reserveTopSlot: boolean,
    bottomReserve = false,
  ): ReactNode {
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
        {bottomReserve && <div className="sibling-flap-reserve" aria-hidden="true" />}
      </div>
    )
  }

  // Shared couple-column JSX used by both renderers below — Add-Parent
  // slots, the <Couple> patch itself, and the sibling-flap row. The two
  // renderers only differ in whether a <SeamLine> belongs directly under
  // this column (`seam`; only the flex path's per-unit rendering draws it
  // here — the grid path draws its connectors separately, positioned by
  // grid row/column) and whether a SiblingFlap's `open` state reflects the
  // real openFlaps set (`flapsInteractive`; the flex path always passes
  // true, while the grid path passes true only for the depth-0/root unit —
  // the only unit that can have an open flap while still being in grid
  // mode — and false for every other ancestor unit).
  function renderCoupleColumn(
    unit: AncestorUnit,
    person: Person,
    spouse: Person | null,
    options: { seam: boolean; flapsInteractive: boolean },
  ): ReactNode {
    const personHasParents = getParentIds(unit.personId, relationships).length > 0
    const spouseHasParents = spouse ? getParentIds(spouse.id, relationships).length > 0 : true
    const anyMissingParent = !personHasParents || (spouse ? !spouseHasParents : false)
    const personSiblingIds = siblingsOf(unit.personId)
    const spouseSiblingIds = spouse ? siblingsOf(spouse.id) : []
    const anyHasSiblings = personSiblingIds.length > 0 || spouseSiblingIds.length > 0

    return (
      <div className="gen-column">
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
                  open={options.flapsInteractive && openFlaps.has(unit.personId)}
                  onToggle={() => toggleFlap(unit.personId)}
                />
              )}
            </div>
            {spouse && (
              <div className="person-slot">
                {spouseSiblingIds.length > 0 && (
                  <SiblingFlap
                    count={spouseSiblingIds.length}
                    open={options.flapsInteractive && openFlaps.has(spouse.id)}
                    onToggle={() => toggleFlap(spouse.id)}
                  />
                )}
              </div>
            )}
          </div>
        )}
        {options.seam && <SeamLine kind="parent-child" />}
      </div>
    )
  }

  // The pre-existing flex-based rendering, used whenever a sibling flap is
  // open above depth 0 (see hasDeepFlapOpen / the branch in the main render
  // body). A flap opened on the depth-0/root unit itself stays on
  // renderAncestorGrid instead — see Global Constraints in the precise-
  // ancestor-layout plan for why full composition at every depth is out of
  // scope, an explicit scope decision, not an oversight.
  function renderFlexAncestorRows(): ReactNode {
    return visibleRows.map((row) => (
      <div className="gen" key={row.depth}>
        {row.units.map((unit) => {
          const person = byId.get(unit.personId)
          if (!person) return null
          const spouse = unit.spouseId ? byId.get(unit.spouseId) ?? null : null

          const personHasParents = getParentIds(unit.personId, relationships).length > 0
          const spouseHasParents = spouse ? getParentIds(spouse.id, relationships).length > 0 : true
          const personSiblingIds = siblingsOf(unit.personId)
          const spouseSiblingIds = spouse ? siblingsOf(spouse.id) : []

          const anyMissingParent = !personHasParents || (spouse ? !spouseHasParents : false)

          const coupleColumn = (
            <Fragment key="couple">
              {renderCoupleColumn(unit, person, spouse, {
                seam: row.depth > 0 || focalChildren.length > 0,
                flapsInteractive: true,
              })}
            </Fragment>
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
            <Fragment key={unit.id}>
              {shouldGroup
                ? groupSegmentsIntoClusters(segments, row.units.length > 1)
                : segments.map((s) => <Fragment key={s.id}>{s.node}</Fragment>)}
            </Fragment>
          )
        })}
      </div>
    ))
  }

  // Renders every currently-visible ancestor row as one shared CSS Grid, so
  // a unit's horizontal position is guaranteed (by the grid itself, not by
  // coincidental flex-centering) to sit above the specific person it's the
  // parent-pair of. Only called when no DEEP sibling flap is open — i.e. no
  // flap above depth 0 (see hasDeepFlapOpen / the branch in the main render
  // body). A flap opened on the depth-0/root unit itself stays on this grid
  // path: its revealed siblings are appended below as trailing grid
  // columns, positioned after the root unit's own person/spouse columns —
  // see the "Depth-0 sibling-flap composition" block below.
  function renderAncestorGrid(): ReactNode {
    const spans = computeAncestorLayout(visibleRows)
    const maxVisibleDepth = visibleRows.length > 0 ? Math.max(...visibleRows.map((r) => r.depth)) : 0
    const items: ReactNode[] = []

    const rootRow = visibleRows.find((r) => r.depth === 0)
    const rootUnitForSiblings = rootRow?.units[0] ?? null
    const rootPerson = rootUnitForSiblings ? byId.get(rootUnitForSiblings.personId) ?? null : null
    const rootSpouse = rootUnitForSiblings?.spouseId ? byId.get(rootUnitForSiblings.spouseId) ?? null : null
    const rootAnyMissingParent =
      rootUnitForSiblings != null &&
      rootPerson != null &&
      (getParentIds(rootUnitForSiblings.personId, relationships).length === 0 ||
        (rootSpouse != null && getParentIds(rootSpouse.id, relationships).length === 0))

    // Depth-0 revealed siblings, gathered up front (person's own siblings
    // first, then spouse's — matching renderFlexAncestorRows'
    // addSiblingSegments order) so the couple's own boxing decision below
    // can see every sibling's cluster label before any column renders. This
    // also replaces the old per-sibling `openFlaps.has(...)` guard inside
    // the append loop — that guard duplicated the two `if` checks around its
    // call sites (an OR across both owners, scoped to neither) with dead
    // logic; gathering here via one `collect` call per owner, each already
    // gated on that owner's own flap, makes the same intent unambiguous.
    const revealedSiblings: { sibId: string; sibling: Person; sibSpouse: Person | null; label: string | null }[] = []
    if (rootUnitForSiblings) {
      const collect = (ownerId: string) => {
        if (!openFlaps.has(ownerId)) return
        for (const sibId of siblingsOf(ownerId)) {
          const sibling = byId.get(sibId)
          if (!sibling) continue
          const sibSpouseId = getSpouseIds(sibId, relationships)[0]
          const sibSpouse = sibSpouseId ? byId.get(sibSpouseId) ?? null : null
          revealedSiblings.push({ sibId, sibling, sibSpouse, label: clusterLabel(sibling, sibSpouse) })
        }
      }
      collect(rootUnitForSiblings.personId)
      if (rootUnitForSiblings.spouseId) collect(rootUnitForSiblings.spouseId)
    }

    // The depth-0 couple's own column only gets boxed when doing so is
    // visually warranted — mirroring renderFlexAncestorRows' `shouldGroup`
    // rule (row.units.length > 1, always false at depth 0, OR 2+ distinct
    // surnames among the couple's own column and its revealed siblings). A
    // lone couple with no siblings revealed, or siblings that all share the
    // couple's own surname, stays unboxed — same as the flex path. Each
    // revealed sibling with its OWN determinable surname is boxed
    // individually regardless of this couple-level decision (see the append
    // loop below) — a simpler rule than the flex path's adjacent-run
    // merging into one shared box, deliberately not replicated here (out of
    // scope per the final-review finding this composes).
    const rootLabel = rootPerson ? clusterLabel(rootPerson, rootSpouse) : null
    const depth0DistinctLabels = new Set(
      [rootLabel, ...revealedSiblings.map((s) => s.label)].filter((l): l is string => l !== null),
    )
    const depth0ShouldBoxCouple = depth0DistinctLabels.size >= 2

    for (const row of visibleRows) {
      const contentRow = 2 * (maxVisibleDepth - row.depth) + 1
      const connectorRow = contentRow + 1

      for (const unit of row.units) {
        const person = byId.get(unit.personId)
        if (!person) continue
        const spouse = unit.spouseId ? byId.get(unit.spouseId) ?? null : null
        const span = spans.get(unit.id)
        if (!span) {
          console.warn('ancestor unit missing computed span, skipping render', unit.id)
          continue
        }

        const label = clusterLabel(person, spouse)
        const boxed = row.depth === 0 ? depth0ShouldBoxCouple : row.units.length > 1

        // Only the depth-0/root unit can ever have an open flap while still
        // being in grid mode (any flap opened on a non-root unit is exactly
        // what forces the flex fallback above) — so it's the only one whose
        // SiblingFlap should reflect the real openFlaps set here.
        const coupleColumn = renderCoupleColumn(unit, person, spouse, {
          seam: false,
          flapsInteractive: unit.id === rootUnit?.id,
        })

        items.push(
          <div
            className={boxed ? 'family-cluster ancestor-grid-item' : 'ancestor-grid-item'}
            key={`content-${unit.id}`}
            style={{ gridColumn: `${span.start + 1} / ${span.end + 1}`, gridRow: contentRow }}
          >
            {boxed && label && <div className="family-cluster-label">{label}</div>}
            {coupleColumn}
          </div>,
        )

        if (row.depth > 0) {
          items.push(
            <div
              className="seam seam-parent-child ancestor-grid-connector"
              key={`connector-${unit.id}`}
              style={{ gridColumn: `${span.start + 1} / ${span.end + 1}`, gridRow: connectorRow }}
            />,
          )
        }
      }
    }

    // The focal couple's own connection down to their own children (the
    // `.descendants` section) is a separate concern from ancestor-to-
    // ancestor connectors above — it always exists whenever the focal
    // person has recorded children, same condition as the old code used.
    if (rootRow && focalChildren.length > 0) {
      const rootSpan = spans.get(rootRow.units[0].id)
      if (rootSpan) {
        items.push(
          <div
            className="seam seam-parent-child ancestor-grid-connector"
            key="connector-focal-children"
            style={{ gridColumn: `${rootSpan.start + 1} / ${rootSpan.end + 1}`, gridRow: 2 * maxVisibleDepth + 2 }}
          />,
        )
      }
    }

    // Depth-0 sibling-flap composition: the focal couple's own revealed
    // siblings render as trailing grid columns, positioned after the
    // depth-0 unit's own person/spouse columns. They get no connector row
    // (no ancestor lineage of their own is drawn above them, matching the
    // established rule for revealed siblings) and don't affect any span
    // computed above, since they're appended strictly after the highest
    // column index already in use. Each sibling column also gets a bottom
    // spacer (`bottomReserve`) matching the height of the focal couple's own
    // sibling-flap row, so its Couple lands at the same vertical position as
    // the focal couple's under the grid's bottom-alignment (align-self: end)
    // — see .sibling-flap-reserve in global.css.
    if (rootUnitForSiblings) {
      let nextColumn = 0
      for (const span of spans.values()) {
        if (span.end > nextColumn) nextColumn = span.end
      }

      for (const { sibId, sibling, sibSpouse, label } of revealedSiblings) {
        const boxed = label !== null
        items.push(
          <div
            className={boxed ? 'family-cluster ancestor-grid-item' : 'ancestor-grid-item'}
            key={`sibling-${sibId}`}
            style={{ gridColumn: `${nextColumn + 1} / ${nextColumn + 2}`, gridRow: 2 * maxVisibleDepth + 1 }}
          >
            {boxed && <div className="family-cluster-label">{label}</div>}
            {renderSiblingColumn(sibId, sibling, sibSpouse, rootAnyMissingParent, true)}
          </div>,
        )
        nextColumn += 1
      }
    }

    return <div className="ancestor-grid">{items}</div>
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
      {hasDeepFlapOpen ? renderFlexAncestorRows() : renderAncestorGrid()}
      {hasMoreAncestors && (
        <button className="show-more-ancestors" onClick={() => setMaxAncestorDepth((d) => d + 1)}>
          Show more ancestors
        </button>
      )}
    </div>
  )
}
