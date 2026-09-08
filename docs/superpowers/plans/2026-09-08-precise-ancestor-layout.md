# Precise ancestor layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An ancestor unit renders positioned directly above (and connected end-to-end, without gaps, to) the specific person it's the parent-pair of — so two sides of a couple's ancestry are unambiguously distinguishable by position, not just coincidentally centered.

**Architecture:** A pure, two-pass column-span algorithm (`computeAncestorLayout`) computes each ancestor unit's exact horizontal grid-column span from the relationship graph alone. `TreeView.tsx` renders all currently-visible ancestor rows as one shared CSS Grid using those spans, with connecting lines rendered as grid items positioned at the same spans. **Scope decision, made here per the design doc's own note that sibling-flap integration was left open:** the new grid rendering activates only when no sibling flap is currently open anywhere in the tree (`openFlaps.size === 0`); opening any flap falls back to the existing flex-based rendering, unchanged, for as long as any flap stays open. This avoids merging two genuinely separate layout problems (precise ancestor positioning vs. lateral sibling-column display) into one pass, at the cost of not yet composing the two features — an explicit, documented tradeoff, not an oversight.

**Tech Stack:** React + TypeScript client, CSS Grid, Vitest + Testing Library.

## Global Constraints

- Descendant-row rendering (`DescendantBranch`, `.descendants`) is completely unaffected by this plan — out of scope per the design doc (children are jointly owned by a couple, no positional ambiguity to resolve).
- The existing flex-based ancestor rendering must remain fully intact and reachable (used whenever `openFlaps.size > 0`) — do not delete or modify it, only branch around it.
- `familyGraph.ts`'s `buildAncestorRows` keeps its existing behavior for every row/unit it already returns — the only change is one additional field per unit (`childId`), populated from data the function already computes locally.
- A unit's own rendered content box may end up wider than its natural 2-person visual width when its own ancestors need more room than its sibling-in-law's side does — the box centers within that reserved width via CSS. This means the focal couple's own on-screen horizontal position can shift slightly as more ancestor depth is expanded. This is intentional, standard tree-layout behavior, not a bug — note it in any test or manual-check commentary, don't try to "fix" it back to a fixed position.
- Connector-line precision is at the couple level (which side of a differently-weighted couple's box a connector visually lands near), not sub-pixel-exact to one specific person within a couple's combined visual box — splitting `Couple.tsx`'s internal rendering into independently-positioned grid halves is out of scope for this plan.

---

### Task 1: Track which child each ancestor unit belongs to

**Files:**
- Modify: `client/src/lib/familyGraph.ts`
- Modify: `client/src/lib/familyGraph.test.ts`

**Interfaces:**
- Produces: `AncestorUnit` gains `childId: string | null` (`null` only for the depth-0 root unit). Task 2's `computeAncestorLayout` and Task 3's rendering both consume this field.

- [ ] **Step 1: Add `childId` to `AncestorUnit` and populate it in `buildAncestorRows`**

In `client/src/lib/familyGraph.ts`, change:

```typescript
export interface AncestorUnit {
  personId: string
  spouseId: string | null
}
```

to:

```typescript
export interface AncestorUnit {
  personId: string
  spouseId: string | null
  childId: string | null
}
```

Then change `buildAncestorRows`'s body — the seed row and the loop that discovers each new row's units — from:

```typescript
export function buildAncestorRows(focalId: string, relationships: Relationship[]): AncestorRow[] {
  const rows: AncestorRow[] = [{ depth: 0, units: [{ personId: focalId, spouseId: getSpouseIds(focalId, relationships)[0] ?? null }] }]

  let currentIds = [focalId]
  let depth = 0

  while (currentIds.length > 0) {
    depth += 1
    const seenParentIds = new Set<string>()
    const units: AncestorUnit[] = []

    for (const id of currentIds) {
      for (const parentId of getParentIds(id, relationships)) {
        if (seenParentIds.has(parentId)) continue
        const spouseId = getSpouseIds(parentId, relationships)[0] ?? null
        if (spouseId) seenParentIds.add(spouseId)
        seenParentIds.add(parentId)
        units.push({ personId: parentId, spouseId })
      }
    }

    if (units.length === 0) break
    rows.push({ depth, units })
    currentIds = units.flatMap((u) => (u.spouseId ? [u.personId, u.spouseId] : [u.personId]))
  }

  return rows
}
```

to:

```typescript
export function buildAncestorRows(focalId: string, relationships: Relationship[]): AncestorRow[] {
  const rows: AncestorRow[] = [{ depth: 0, units: [{ personId: focalId, spouseId: getSpouseIds(focalId, relationships)[0] ?? null, childId: null }] }]

  let currentIds = [focalId]
  let depth = 0

  while (currentIds.length > 0) {
    depth += 1
    const seenParentIds = new Set<string>()
    const units: AncestorUnit[] = []

    for (const id of currentIds) {
      for (const parentId of getParentIds(id, relationships)) {
        if (seenParentIds.has(parentId)) continue
        const spouseId = getSpouseIds(parentId, relationships)[0] ?? null
        if (spouseId) seenParentIds.add(spouseId)
        seenParentIds.add(parentId)
        units.push({ personId: parentId, spouseId, childId: id })
      }
    }

    if (units.length === 0) break
    rows.push({ depth, units })
    currentIds = units.flatMap((u) => (u.spouseId ? [u.personId, u.spouseId] : [u.personId]))
  }

  return rows
}
```

(`childId: id` — `id` is the loop variable already representing exactly "whose parent we just found for.")

- [ ] **Step 2: Update the four existing `buildAncestorRows` test assertions**

In `client/src/lib/familyGraph.test.ts`, update these four `toEqual` calls to include `childId`:

```typescript
test('buildAncestorRows returns the focal person alone at depth 0', () => {
  const rows = buildAncestorRows('meera', relationships)
  expect(rows[0]).toEqual({ depth: 0, units: [{ personId: 'meera', spouseId: null, childId: null }] })
})

test('buildAncestorRows walks up through recorded parent couples', () => {
  const rows = buildAncestorRows('meera', relationships)
  // depth 1: Meera's parents, Anna & Ravi, as one couple unit
  const depth1 = rows.find((r) => r.depth === 1)!
  expect(depth1.units).toEqual([{ personId: 'anna', spouseId: 'ravi', childId: 'meera' }])
})
```

(the `'buildAncestorRows stops at a generation with no recorded parents'` test is unaffected — it doesn't inspect unit shape.)

```typescript
test('buildAncestorRows handles someone with only one recorded parent', () => {
  const oneParent: Relationship[] = [
    { id: 'x1', type: 'parent-child', from_id: 'solo-parent', to_id: 'solo-child' },
  ]
  const rows = buildAncestorRows('solo-child', oneParent)
  const depth1 = rows.find((r) => r.depth === 1)!
  expect(depth1.units).toEqual([{ personId: 'solo-parent', spouseId: null, childId: 'solo-child' }])
})
```

- [ ] **Step 3: Run the tests**

Run: `cd client && npx vitest run src/lib/familyGraph.test.ts`
Expected: PASS, all tests.

- [ ] **Step 4: Type-check and run the full suite**

Run: `cd client && npx tsc --noEmit` (expect clean — `AncestorUnit` is a named export consumed elsewhere; a missing `childId` anywhere it's constructed would now be a type error, which is exactly the safety net this field addition should provide) and `cd client && npm test` (do NOT append `-- run`).
Expected: clean type-check; full suite passes (nothing outside `familyGraph.ts`/`familyGraph.test.ts` constructs an `AncestorUnit` literal today, so no other file should need changes in this task).

- [ ] **Step 5: Commit**

```bash
git add client/src/lib/familyGraph.ts client/src/lib/familyGraph.test.ts
git commit -m "Track which child each ancestor unit's parent-pair belongs to"
```

---

### Task 2: Pure column-span layout algorithm

**Files:**
- Create: `client/src/lib/ancestorLayout.ts`
- Create: `client/src/lib/ancestorLayout.test.ts`

**Interfaces:**
- Consumes: `AncestorRow`, `AncestorUnit` from `./familyGraph` (Task 1's `childId` field).
- Produces: `export interface ColumnSpan { start: number; end: number }` (half-open) and `export function computeAncestorLayout(rows: AncestorRow[]): Map<string, ColumnSpan>`, keyed by each unit's `personId`. Task 3 calls this directly.

- [ ] **Step 1: Write the failing tests**

```typescript
import { describe, expect, test } from 'vitest'
import type { AncestorRow } from './familyGraph'
import { computeAncestorLayout } from './ancestorLayout'

describe('computeAncestorLayout', () => {
  test('a solo focal person with no recorded spouse gets a single-column span', () => {
    const rows: AncestorRow[] = [{ depth: 0, units: [{ personId: 'meera', spouseId: null, childId: null }] }]
    const spans = computeAncestorLayout(rows)
    expect(spans.get('meera')).toEqual({ start: 0, end: 1 })
  })

  test('a focal couple with no recorded ancestors gets a two-column span', () => {
    const rows: AncestorRow[] = [{ depth: 0, units: [{ personId: 'mangal', spouseId: 'kishan', childId: null }] }]
    const spans = computeAncestorLayout(rows)
    expect(spans.get('mangal')).toEqual({ start: 0, end: 2 })
  })

  test("one side's recorded parents render in that side's own portion, leaving room on the other side", () => {
    const rows: AncestorRow[] = [
      { depth: 0, units: [{ personId: 'mangal', spouseId: 'kishan', childId: null }] },
      { depth: 1, units: [{ personId: 'hanmantrao', spouseId: 'saraswati', childId: 'mangal' }] },
    ]
    const spans = computeAncestorLayout(rows)
    // Mangal's own reserved width grows to 3 (2 for her parents' couple + 1
    // reserved for Kishan's still-unrecorded side) even though the visible
    // couple itself is only 2 people — this is the intended, documented
    // "the focal couple's box centers within whatever width its ancestry
    // needs" behavior, not a bug.
    expect(spans.get('mangal')).toEqual({ start: 0, end: 3 })
    expect(spans.get('hanmantrao')).toEqual({ start: 0, end: 2 })
    // Kishan's own side has no unit at all (no parents recorded), so no
    // span exists for him — nothing to look up.
    expect(spans.has('kishan')).toBe(false)
  })

  test('both sides having recorded parents places them side by side, never overlapping', () => {
    const rows: AncestorRow[] = [
      { depth: 0, units: [{ personId: 'mangal', spouseId: 'kishan', childId: null }] },
      {
        depth: 1,
        units: [
          { personId: 'hanmantrao', spouseId: 'saraswati', childId: 'mangal' },
          { personId: 'kishan_dad', spouseId: 'kishan_mom', childId: 'kishan' },
        ],
      },
    ]
    const spans = computeAncestorLayout(rows)
    expect(spans.get('mangal')).toEqual({ start: 0, end: 4 })
    expect(spans.get('hanmantrao')).toEqual({ start: 0, end: 2 })
    expect(spans.get('kishan_dad')).toEqual({ start: 2, end: 4 })
  })

  test("a deeper ancestor on one side widens every generation below it on that same side", () => {
    const rows: AncestorRow[] = [
      { depth: 0, units: [{ personId: 'mangal', spouseId: 'kishan', childId: null }] },
      { depth: 1, units: [{ personId: 'hanmantrao', spouseId: 'saraswati', childId: 'mangal' }] },
      { depth: 2, units: [{ personId: 'great_grandpa', spouseId: 'great_grandma', childId: 'hanmantrao' }] },
    ]
    const spans = computeAncestorLayout(rows)
    // hanmantrao's own required width becomes 2 (his parents' couple) + 1
    // (saraswati, no recorded parents) = 3, which then makes mangal's own
    // width 3 (hanmantrao's side) + 1 (kishan's still-empty side) = 4.
    expect(spans.get('mangal')).toEqual({ start: 0, end: 4 })
    expect(spans.get('hanmantrao')).toEqual({ start: 0, end: 3 })
    expect(spans.get('great_grandpa')).toEqual({ start: 0, end: 2 })
  })

  test('an empty rows array returns an empty map rather than throwing', () => {
    expect(computeAncestorLayout([]).size).toBe(0)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd client && npx vitest run src/lib/ancestorLayout.test.ts`
Expected: FAIL — `ancestorLayout.ts` does not exist yet.

- [ ] **Step 3: Write the implementation**

```typescript
import type { AncestorRow, AncestorUnit } from './familyGraph'

export interface ColumnSpan {
  start: number
  end: number
}

// Computes each ancestor-row unit's horizontal column span (half-open,
// [start, end)) so a unit renders positioned directly above the specific
// person (its `childId`) it's the parent-pair of, with siblings in the
// same generation never overlapping.
//
// Pass 1 (bottom-up): each unit's required width is 2 if it has a recorded
// spouse, 1 otherwise — UNLESS its own parents are also present in the next
// row, in which case its width becomes the sum of whatever width its own
// personId-side and spouseId-side parent-units need. A lineage's footprint
// never shrinks going further back, only grows or stays flat.
//
// Pass 2 (top-down): depth 0's own span is [0, requiredWidth) — note this
// is NOT hardcoded to exactly 2 (or 1 solo); it's the same required-width
// computation as every other unit, so the focal couple's own reserved
// space widens too when one side's ancestry needs more room than the
// other's. Every other unit's span is the exact sub-range its own personId
// or spouseId occupies within its child's own span — which, by
// construction in Pass 1, is exactly as wide as this unit itself needs. No
// further splitting math is required.
export function computeAncestorLayout(rows: AncestorRow[]): Map<string, ColumnSpan> {
  const rowsByDepth = new Map<number, AncestorRow>()
  let maxDepth = 0
  for (const row of rows) {
    rowsByDepth.set(row.depth, row)
    if (row.depth > maxDepth) maxDepth = row.depth
  }

  // Pass 1: bottom-up required width, keyed by unit.personId.
  const requiredWidth = new Map<string, number>()
  const unitByChildId = new Map<number, Map<string, AncestorUnit>>()

  for (let depth = maxDepth; depth >= 0; depth--) {
    const row = rowsByDepth.get(depth)
    if (!row) continue
    const childMap = new Map<string, AncestorUnit>()
    for (const unit of row.units) {
      if (unit.childId) childMap.set(unit.childId, unit)
    }
    unitByChildId.set(depth, childMap)

    const nextChildMap = unitByChildId.get(depth + 1)
    for (const unit of row.units) {
      const personParent = nextChildMap?.get(unit.personId)
      const personWidth = personParent ? requiredWidth.get(personParent.personId)! : 1
      let spouseWidth = 0
      if (unit.spouseId) {
        const spouseParent = nextChildMap?.get(unit.spouseId)
        spouseWidth = spouseParent ? requiredWidth.get(spouseParent.personId)! : 1
      }
      requiredWidth.set(unit.personId, personWidth + spouseWidth)
    }
  }

  // Pass 2: top-down span assignment.
  const spans = new Map<string, ColumnSpan>()
  const rootRow = rowsByDepth.get(0)
  if (!rootRow || rootRow.units.length === 0) return spans
  const rootUnit = rootRow.units[0]
  spans.set(rootUnit.personId, { start: 0, end: requiredWidth.get(rootUnit.personId) ?? (rootUnit.spouseId ? 2 : 1) })

  for (let depth = 0; depth < maxDepth; depth++) {
    const row = rowsByDepth.get(depth)
    if (!row) continue
    const nextChildMap = unitByChildId.get(depth + 1)
    if (!nextChildMap) continue

    for (const unit of row.units) {
      const parentSpan = spans.get(unit.personId)
      if (!parentSpan) continue

      const personParent = nextChildMap.get(unit.personId)
      const personWidth = personParent ? requiredWidth.get(personParent.personId)! : 1
      const personEnd = parentSpan.start + personWidth
      if (personParent) spans.set(personParent.personId, { start: parentSpan.start, end: personEnd })

      if (unit.spouseId) {
        const spouseParent = nextChildMap.get(unit.spouseId)
        if (spouseParent) spans.set(spouseParent.personId, { start: personEnd, end: parentSpan.end })
      }
    }
  }

  return spans
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd client && npx vitest run src/lib/ancestorLayout.test.ts`
Expected: PASS, all 6 tests.

- [ ] **Step 5: Commit**

```bash
git add client/src/lib/ancestorLayout.ts client/src/lib/ancestorLayout.test.ts
git commit -m "Add pure column-span layout algorithm for precise ancestor positioning"
```

---

### Task 3: Render ancestor rows via the computed grid layout

**Files:**
- Modify: `client/src/components/tree/TreeView.tsx`
- Modify: `client/src/styles/global.css`
- Modify: `client/src/components/tree/TreeView.test.tsx`

**Interfaces:**
- Consumes: `computeAncestorLayout`, `ColumnSpan` from Task 2's `../../lib/ancestorLayout`.

- [ ] **Step 1: Add the import**

In `client/src/components/tree/TreeView.tsx`, add directly after the existing `familyGraph` import:

```typescript
import { computeAncestorLayout } from '../../lib/ancestorLayout'
```

- [ ] **Step 2: Extract the current ancestor-row rendering into its own function, unchanged**

Find the current `{visibleRows.map((row) => ( ... ))}` block in the component's `return` JSX (the whole expression, from `{visibleRows.map((row) => (` through its matching `))}` right before `{hasMoreAncestors && (`). Remove it entirely from the `return` JSX (Step 4 below puts a replacement expression in its place) and move its contents into a new function defined inside the `TreeView` component, right after `renderSiblingColumn`:

```typescript
  // The pre-existing flex-based rendering, used whenever any sibling flap
  // is open anywhere in the tree. See Global Constraints in the precise-
  // ancestor-layout plan for why: grid-based precise positioning (see
  // renderAncestorGrid below) doesn't yet compose with sibling-flap reveal,
  // an explicit scope decision, not an oversight.
  function renderFlexAncestorRows(): ReactNode {
    return visibleRows.map((row) => (
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
    ))
  }
```

(This step is a pure move — the body above is character-for-character the same code currently inline in `visibleRows.map(...)` in `TreeView.tsx` today, just relocated into its own named function. Do not change any logic while moving it.)

- [ ] **Step 3: Write the new grid-based renderer**

Add this function directly after `renderFlexAncestorRows`:

```typescript
  // Renders every currently-visible ancestor row as one shared CSS Grid, so
  // a unit's horizontal position is guaranteed (by the grid itself, not by
  // coincidental flex-centering) to sit above the specific person it's the
  // parent-pair of. Only called when no sibling flap is open anywhere (see
  // the branch in the main render body) — sibling columns aren't part of
  // this grid at all; see Global Constraints.
  function renderAncestorGrid(): ReactNode {
    const spans = computeAncestorLayout(visibleRows)
    const maxVisibleDepth = visibleRows.length > 0 ? Math.max(...visibleRows.map((r) => r.depth)) : 0
    const items: ReactNode[] = []

    for (const row of visibleRows) {
      const contentRow = 2 * (maxVisibleDepth - row.depth) + 1
      const connectorRow = contentRow + 1

      for (const unit of row.units) {
        const person = byId.get(unit.personId)
        if (!person) continue
        const spouse = unit.spouseId ? byId.get(unit.spouseId) : null
        const span = spans.get(unit.personId)
        if (!span) continue

        const personHasParents = getParentIds(unit.personId, relationships).length > 0
        const spouseHasParents = spouse ? getParentIds(spouse.id, relationships).length > 0 : true
        const anyMissingParent = !personHasParents || (spouse ? !spouseHasParents : false)
        const personSiblingIds = siblingsOf(unit.personId)
        const spouseSiblingIds = spouse ? siblingsOf(spouse.id) : []
        const anyHasSiblings = personSiblingIds.length > 0 || spouseSiblingIds.length > 0
        const label = clusterLabel(person, spouse)
        const boxed = row.units.length > 1

        const coupleColumn = (
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
                    <SiblingFlap count={personSiblingIds.length} open={false} onToggle={() => toggleFlap(unit.personId)} />
                  )}
                </div>
                {spouse && (
                  <div className="person-slot">
                    {spouseSiblingIds.length > 0 && (
                      <SiblingFlap count={spouseSiblingIds.length} open={false} onToggle={() => toggleFlap(spouse.id)} />
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )

        items.push(
          <div
            className={boxed ? 'family-cluster ancestor-grid-item' : 'ancestor-grid-item'}
            key={`content-${unit.personId}`}
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
              key={`connector-${unit.personId}`}
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
    const rootRow = visibleRows.find((r) => r.depth === 0)
    if (rootRow && focalChildren.length > 0) {
      const rootSpan = spans.get(rootRow.units[0].personId)
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

    return <div className="ancestor-grid">{items}</div>
  }
```

- [ ] **Step 4: Branch between the two renderers**

Find where `{visibleRows.map((row) => ( ... ))}` used to be (now replaced by the extraction in Step 2 — this JSX call site is what's left after that move). Replace it with:

```typescript
      {openFlaps.size === 0 ? renderAncestorGrid() : renderFlexAncestorRows()}
```

- [ ] **Step 5: Add the grid CSS**

In `client/src/styles/global.css`, add directly after the existing `.family-cluster-spacer` rule:

```css
.ancestor-grid { display: grid; grid-auto-columns: max-content; column-gap: var(--space-xxl); row-gap: 0; justify-content: center; }
.ancestor-grid-item { justify-self: center; }
.ancestor-grid-connector { justify-self: center; align-self: start; }
```

- [ ] **Step 6: Run the full suite and update any pre-existing test whose DOM assumptions no longer hold**

Run: `cd client && npm test` (do NOT append `-- run`). Many existing `TreeView.test.tsx` tests render ancestor rows with no sibling flap open, so they now exercise `renderAncestorGrid` instead of the old flex path for the first time. Expect some of them to need small updates — e.g. a test that previously found an ancestor column via `.closest('.gen')` (the old per-row flex wrapper) needs to instead look for `.closest('.ancestor-grid-item')` or the shared `.ancestor-grid` container, since `.gen` is no longer used for ancestor rows in grid mode (it's still used for `.descendants`, which is unaffected). Update each such test's selector to match the new structure — the test's actual *intent* (what relationship it's verifying) should not change, only the CSS selector it uses to check it. Document every test you touch in your report, with a one-line reason each.

Add these new tests to `TreeView.test.tsx`, verifying the grid path specifically:

```typescript
test('renders ancestor rows via the precise grid layout when no sibling flap is open', () => {
  const { container } = render(<TreeView people={people} relationships={relationships} focalId="meera" onAddParent={() => {}} onOpenProfile={() => {}} onCenterOn={() => {}} />)
  expect(container.querySelector('.ancestor-grid')).toBeInTheDocument()
})

test('opening a sibling flap falls back to the pre-existing flex rendering', () => {
  const { container } = render(<TreeView people={people} relationships={relationships} focalId="meera" onAddParent={() => {}} onOpenProfile={() => {}} onCenterOn={() => {}} />)
  fireEvent.click(screen.getByText('2'))
  expect(container.querySelector('.ancestor-grid')).not.toBeInTheDocument()
  expect(container.querySelector('.gen')).toBeInTheDocument()
})

test("a couple's grid-column matches its computed span", () => {
  const named = (id: string, first: string, last: string) => ({ ...person(id, first), last_name: last })
  const clusteredPeople = [
    person('meera5', 'Meera5'),
    named('mangal5', 'Mangal5', 'Khandgaonkar'), named('kishan5', 'Kishan5', 'Talegave'),
    named('hanmantrao5', 'Hanmantrao5', 'Khandgaonkar'), named('saraswati5', 'Saraswati5', 'Khandgaonkar'),
  ]
  const clusteredRelationships: Relationship[] = [
    { id: 'r1', type: 'spouse', from_id: 'mangal5', to_id: 'kishan5' },
    { id: 'r2', type: 'parent-child', from_id: 'mangal5', to_id: 'meera5' },
    { id: 'r3', type: 'parent-child', from_id: 'kishan5', to_id: 'meera5' },
    { id: 'r4', type: 'spouse', from_id: 'hanmantrao5', to_id: 'saraswati5' },
    { id: 'r5', type: 'parent-child', from_id: 'hanmantrao5', to_id: 'mangal5' },
    { id: 'r6', type: 'parent-child', from_id: 'saraswati5', to_id: 'mangal5' },
  ]
  render(<TreeView people={clusteredPeople} relationships={clusteredRelationships} focalId="meera5" onAddParent={() => {}} onOpenProfile={() => {}} onCenterOn={() => {}} />)
  fireEvent.click(screen.getByText('Show more ancestors'))

  // Mangal5's parents (Hanmantrao5+Saraswati5) span [0,2); Mangal5+Kishan5
  // themselves span [0,3) (2 for her side's ancestry + 1 reserved for
  // Kishan5's still-unrecorded side) — matching computeAncestorLayout's
  // own asymmetric-width test case.
  const hanmantraoItem = screen.getByText('Hanmantrao5 Khandgaonkar', { exact: false }).closest('.ancestor-grid-item') as HTMLElement
  expect(hanmantraoItem.style.gridColumn).toBe('1 / 3')
  const coupleItem = screen.getByText('Mangal5 Khandgaonkar', { exact: false }).closest('.ancestor-grid-item') as HTMLElement
  expect(coupleItem.style.gridColumn).toBe('1 / 4')
})

test('a row with two unrelated lineages boxes both units even with no siblings revealed', () => {
  // Reuses the same fixture shape as the existing multi-lineage
  // family-cluster test, but asserts the grid path (no flap open) also
  // boxes both units — this row.units.length > 1 behavior is unchanged
  // from the pre-existing flex path's own version of this rule.
  const named = (id: string, first: string, last: string) => ({ ...person(id, first), last_name: last })
  const clusteredPeople = [
    named('anna6', 'Anna6', 'Gade'), named('ravi6', 'Ravi6', 'Gade'), person('meera6', 'Meera6'),
    named('anna_dad6', 'AnnaDad6', 'Gade'), named('anna_mom6', 'AnnaMom6', 'Gade'),
    named('ravi_dad6', 'RaviDad6', 'Khandgaonkar'), named('ravi_mom6', 'RaviMom6', 'Khandgaonkar'),
  ]
  const clusteredRelationships: Relationship[] = [
    { id: 'r1', type: 'spouse', from_id: 'anna6', to_id: 'ravi6' },
    { id: 'r2', type: 'parent-child', from_id: 'anna6', to_id: 'meera6' },
    { id: 'r3', type: 'parent-child', from_id: 'ravi6', to_id: 'meera6' },
    { id: 'r4', type: 'spouse', from_id: 'anna_dad6', to_id: 'anna_mom6' },
    { id: 'r5', type: 'parent-child', from_id: 'anna_dad6', to_id: 'anna6' },
    { id: 'r6', type: 'parent-child', from_id: 'anna_mom6', to_id: 'anna6' },
    { id: 'r7', type: 'spouse', from_id: 'ravi_dad6', to_id: 'ravi_mom6' },
    { id: 'r8', type: 'parent-child', from_id: 'ravi_dad6', to_id: 'ravi6' },
    { id: 'r9', type: 'parent-child', from_id: 'ravi_mom6', to_id: 'ravi6' },
  ]
  render(<TreeView people={clusteredPeople} relationships={clusteredRelationships} focalId="meera6" onAddParent={() => {}} onOpenProfile={() => {}} onCenterOn={() => {}} />)
  fireEvent.click(screen.getByText('Show more ancestors'))

  const gadeLabel = screen.getByText('Gade')
  const khandgaonkarLabel = screen.getByText('Khandgaonkar')
  expect(gadeLabel.closest('.family-cluster')).not.toBe(khandgaonkarLabel.closest('.family-cluster'))
})
```

Run the full suite again after adding these: `cd client && npm test`.
Expected: PASS, every pre-existing test (with whatever selector updates Step 6 required) plus the 4 new tests above.

- [ ] **Step 7: Type-check**

Run: `cd client && npx tsc --noEmit`
Expected: clean, no output.

- [ ] **Step 8: Manual browser verification**

Per this project's standing practice for UI changes: start the dev server (`cd client && npm run dev`) and visually confirm, using real or representative data with an asymmetric ancestry (one side of a couple has recorded parents, the other doesn't), that: the recorded side's parents render clearly above and connected to that specific person; the other side has visible free space with an Add Parent slot; no line appears to connect to the wrong person. Note the result in your report — this can't be verified from jsdom alone.

- [ ] **Step 9: Commit**

```bash
git add client/src/components/tree/TreeView.tsx client/src/styles/global.css client/src/components/tree/TreeView.test.tsx
git commit -m "Render ancestor rows via a precise CSS Grid layout"
```
