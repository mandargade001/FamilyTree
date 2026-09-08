# Family-cluster boundary fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop a revealed sibling column from a different lineage than their married-in relative rendering inside that relative's cluster box.

**Architecture:** Replace the current single per-row-unit boolean (`showCluster = row.units.length > 1 || anySiblingsOpen`) with per-column grouping: build an ordered list of "segments" (the couple column, then each revealed sibling column on either side), each carrying its own resolved `clusterLabel`. Group adjacent segments sharing a non-null label into one boxed, captioned cluster; a segment with no determinable label always stands alone. Boxing only happens at all when there's something to distinguish — either the row itself has multiple unrelated lineages (`row.units.length > 1`, unchanged from today), or this unit's own segments carry two or more distinct labels.

**Tech Stack:** React + TypeScript client, Vitest + Testing Library.

## Global Constraints

- No change to `familyGraph.ts`, the relationship data model, or the last-name resolution logic — this fix only changes how already-resolved `last_name` values are grouped visually in `TreeView.tsx`.
- No change to the `row.units.length > 1` behavior (two unrelated lineages sharing one ancestor row) — it must keep forcing each unit's couple segment into its own labeled box, exactly as today, verified by the existing `'wraps a row unit with multiple lineages in labeled family clusters'` test passing unmodified.
- `.family-cluster` / `.family-cluster-label` CSS (`global.css`) is unchanged — this is a rendering-logic change only, reusing the existing classes.
- The `SeamLine`, `AddParentSlot`, `SiblingFlap`, `Couple` markup and props inside the couple column are unchanged from the current implementation — only how columns are grouped into (or kept out of) `.family-cluster` wrappers changes.

---

### Task 1: Per-column cluster grouping in TreeView.tsx

**Files:**
- Modify: `client/src/components/tree/TreeView.tsx`
- Modify: `client/src/components/tree/TreeView.test.tsx`

**Interfaces:**
- Consumes: `clusterLabel(person, spouse)` (already exists at the top of `TreeView.tsx`, unchanged).
- Produces: nothing consumed outside this file — this is a self-contained rendering change.

- [ ] **Step 1: Add the `ReactNode` type import**

In `client/src/components/tree/TreeView.tsx`, change the top import line from:

```typescript
import { Fragment, useEffect, useLayoutEffect, useState, type MouseEvent } from 'react'
```

to:

```typescript
import { Fragment, useEffect, useLayoutEffect, useState, type MouseEvent, type ReactNode } from 'react'
```

- [ ] **Step 2: Add the `ColumnSegment` type and `groupSegmentsIntoClusters` helper**

Add this directly after the existing `clusterLabel` function (after its closing `}`, before `focusSetFor`):

```typescript
interface ColumnSegment {
  id: string
  label: string | null
  node: ReactNode
}

// Groups adjacent same-label segments into one boxed, captioned
// .family-cluster; a null-label segment (no determinable surname) always
// stands alone, unboxed, next to whatever's on either side of it. Callers
// only invoke this when boxing has already been decided as warranted (see
// `shouldGroup` at the call site) — this function doesn't itself decide
// whether to box anything, only how to partition segments once boxing is
// happening.
function groupSegmentsIntoClusters(segments: ColumnSegment[]): ReactNode {
  const output: ReactNode[] = []
  let i = 0
  while (i < segments.length) {
    const { label } = segments[i]
    if (label === null) {
      output.push(<Fragment key={segments[i].id}>{segments[i].node}</Fragment>)
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
```

- [ ] **Step 3: Replace `renderSiblingColumns` (plural, id-list based) with `renderSiblingColumn` (singular, one column)**

Find this existing function (currently around line 255-275):

```typescript
  function renderSiblingColumns(ids: string[], reserveTopSlot: boolean) {
    return ids.map((sibId) => {
      const sibling = byId.get(sibId)
      if (!sibling) return null
      const sibSpouseId = getSpouseIds(sibId, relationships)[0]
      const sibSpouse = sibSpouseId ? byId.get(sibSpouseId) : null
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
    })
  }
```

Replace it entirely with (same behavior, but renders one column instead of mapping over a whole id list, since each sibling is now its own independently-labeled segment):

```typescript
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
```

- [ ] **Step 4: Replace the row/unit render block**

Find the `visibleRows.map(...)` block (currently around lines 306-398, from `{visibleRows.map((row) => (` through its matching `))}` right before `{hasMoreAncestors && (`). Replace the entire `row.units.map((unit) => { ... })` callback body with:

```typescript
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
                  ? groupSegmentsIntoClusters(segments)
                  : segments.map((s) => <Fragment key={s.id}>{s.node}</Fragment>)}
              </Fragment>
            )
          })}
```

(The surrounding `{visibleRows.map((row) => ( <div className="gen" key={row.depth}> ... </div> ))}` wrapper is unchanged — only the inner `row.units.map` callback is replaced.)

- [ ] **Step 5: Update the pre-existing test whose fixture has no last names**

In `client/src/components/tree/TreeView.test.tsx`, the test `'clicking the sibling flap reveals the siblings as row-adjacent columns, not nested under the owner'` (around line 39) uses a fixture where every person's `last_name` is `null` (the shared `person()` helper never sets it). Under the new behavior, revealing siblings with no determinable label at all produces no `.family-cluster` box (nothing to distinguish) — this is a deliberate, expected change from today's behavior of always boxing whenever a flap opens, regardless of labels. Update the test's cluster assertion:

Find:
```typescript
  expect(meeraColumn.parentElement).toHaveClass('family-cluster')
```

Replace with:
```typescript
  // This fixture's people have no last names, so there's nothing to
  // distinguish — no cluster box is drawn (see the cluster-boundary-fix
  // spec). The row-adjacency assertions above are what this test verifies.
  expect(meeraColumn.closest('.family-cluster')).toBeNull()
```

Leave every other assertion in that test unchanged.

- [ ] **Step 6: Add the new regression tests**

Add these two tests to `client/src/components/tree/TreeView.test.tsx`, after the existing `'wraps a row unit with multiple lineages in labeled family clusters'` test:

```typescript
test("a revealed sibling from a different lineage than their married-in relative gets its own separate cluster, not their partner's", () => {
  const named = (id: string, first: string, last: string) => ({ ...person(id, first), last_name: last })
  const clusteredPeople = [
    person('meera3', 'Meera3'),
    named('sarika', 'Sarika', 'Gade'), named('mallikarjun', 'Mallikarjun', 'Gade'),
    named('hanmantrao', 'Hanmantrao', 'Khandgaonkar'), named('saraswati', 'Saraswati', 'Khandgaonkar'),
    named('santosh', 'Santosh', 'Khandgaonkar'),
  ]
  const clusteredRelationships: Relationship[] = [
    { id: 'r1', type: 'spouse', from_id: 'sarika', to_id: 'mallikarjun' },
    { id: 'r2', type: 'parent-child', from_id: 'sarika', to_id: 'meera3' },
    { id: 'r3', type: 'parent-child', from_id: 'mallikarjun', to_id: 'meera3' },
    { id: 'r4', type: 'spouse', from_id: 'hanmantrao', to_id: 'saraswati' },
    { id: 'r5', type: 'parent-child', from_id: 'hanmantrao', to_id: 'sarika' },
    { id: 'r6', type: 'parent-child', from_id: 'saraswati', to_id: 'sarika' },
    { id: 'r7', type: 'parent-child', from_id: 'hanmantrao', to_id: 'santosh' },
    { id: 'r8', type: 'parent-child', from_id: 'saraswati', to_id: 'santosh' },
  ]
  render(<TreeView people={clusteredPeople} relationships={clusteredRelationships} focalId="meera3" onAddParent={() => {}} onOpenProfile={() => {}} onCenterOn={() => {}} />)

  fireEvent.click(screen.getByText('1'))
  expect(screen.getByText('Santosh')).toBeInTheDocument()

  const gadeLabel = screen.getByText('Gade')
  const khandgaonkarLabel = screen.getByText('Khandgaonkar')
  const santoshColumn = screen.getByText('Santosh').closest('.gen-column')!

  expect(gadeLabel.closest('.family-cluster')).not.toBe(khandgaonkarLabel.closest('.family-cluster'))
  expect(khandgaonkarLabel.closest('.family-cluster')).toContainElement(santoshColumn)
  expect(gadeLabel.closest('.family-cluster')).not.toContainElement(santoshColumn)
})

test('a revealed sibling who shares their partner\'s surname does not get an unnecessary cluster box', () => {
  const named = (id: string, first: string, last: string) => ({ ...person(id, first), last_name: last })
  const clusteredPeople = [
    person('meera4', 'Meera4'),
    named('sarika4', 'Sarika4', 'Gade'), named('mallikarjun4', 'Mallikarjun4', 'Gade'),
    named('madhappa4', 'Madhappa4', 'Gade'), named('nagabai4', 'Nagabai4', 'Gade'),
    named('shobha4', 'Shobha4', 'Gade'),
  ]
  const clusteredRelationships: Relationship[] = [
    { id: 'r1', type: 'spouse', from_id: 'sarika4', to_id: 'mallikarjun4' },
    { id: 'r2', type: 'parent-child', from_id: 'sarika4', to_id: 'meera4' },
    { id: 'r3', type: 'parent-child', from_id: 'mallikarjun4', to_id: 'meera4' },
    { id: 'r4', type: 'spouse', from_id: 'madhappa4', to_id: 'nagabai4' },
    { id: 'r5', type: 'parent-child', from_id: 'madhappa4', to_id: 'mallikarjun4' },
    { id: 'r6', type: 'parent-child', from_id: 'nagabai4', to_id: 'mallikarjun4' },
    { id: 'r7', type: 'parent-child', from_id: 'madhappa4', to_id: 'shobha4' },
    { id: 'r8', type: 'parent-child', from_id: 'nagabai4', to_id: 'shobha4' },
  ]
  render(<TreeView people={clusteredPeople} relationships={clusteredRelationships} focalId="meera4" onAddParent={() => {}} onOpenProfile={() => {}} onCenterOn={() => {}} />)

  fireEvent.click(screen.getByText('1'))
  expect(screen.getByText('Shobha4')).toBeInTheDocument()

  const shobhaColumn = screen.getByText('Shobha4').closest('.gen-column')!
  expect(shobhaColumn.closest('.family-cluster')).toBeNull()
})
```

- [ ] **Step 7: Run the full test suite**

Run: `cd client && npm test` (do NOT append `-- run` — `package.json`'s `test` script is already `vitest run`).
Expected: PASS, all prior tests (with Step 5's one amended assertion) plus the 2 new tests.

- [ ] **Step 8: Type-check**

Run: `cd client && npx tsc --noEmit`
Expected: clean, no output.

- [ ] **Step 9: Commit**

```bash
git add client/src/components/tree/TreeView.tsx client/src/components/tree/TreeView.test.tsx
git commit -m "Group family-cluster boxes by actual resolved surname, not by row-unit"
```
