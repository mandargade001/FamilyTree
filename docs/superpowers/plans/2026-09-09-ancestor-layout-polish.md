# Ancestor Layout Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix three parked findings from the precise-ancestor-layout final review: a residual CSS gap under connectors, a data bug where pedigree collapse silently drops a real ancestor (plus the unsafe `personId`-only keying that follows from it), and compose the sibling-flap reveal with the precise grid layout for the focal couple's own siblings (depth 0).

**Architecture:** No new files. Four surgical changes across the existing ancestor-rendering stack: one CSS rule (`global.css`), one bug fix + one new field in the pure graph-walk function (`familyGraph.ts`), a rekey of two lookup maps and three React keys from `personId` to a new stable occurrence id (`ancestorLayout.ts`, `TreeView.tsx`), and an extension to the grid renderer plus its branch condition (`TreeView.tsx`).

**Tech Stack:** React + TypeScript, Vitest + Testing Library for `TreeView.test.tsx`, plain Vitest for the pure-function tests, Playwright (throwaway harness, not committed) for CSS geometry verification.

**Spec:** `docs/superpowers/specs/2026-09-09-ancestor-layout-polish-design.md`

## Global Constraints

- Depth 0 only for flap/grid composition — a flap open at depth > 0 keeps falling back to `renderFlexAncestorRows` (explicit scope decision, confirmed with the user).
- `renderFlexAncestorRows` itself must not change.
- No new visual language — reuse existing CSS classes and the existing `renderSiblingColumn` helper.
- `AncestorUnit.id` format is exactly `` `${depth}:${childId ?? 'root'}:${personId}` `` — every task that touches it must produce/consume this exact format.

---

### Task 1: Fix connector-gap CSS

**Files:**
- Modify: `client/src/styles/global.css` (the `.ancestor-grid-item` rule, currently `.ancestor-grid-item { justify-self: center; }`)

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing consumed by later tasks — this is a standalone CSS fix.

- [ ] **Step 1: Make the CSS change**

In `client/src/styles/global.css`, find:

```css
.ancestor-grid-item { justify-self: center; }
```

Change to:

```css
.ancestor-grid-item { justify-self: center; align-self: end; }
```

- [ ] **Step 2: Verify via a throwaway Playwright harness**

There's no configured Supabase project in this environment, so the real app can't run. Follow the same throwaway-harness technique used in the precise-ancestor-layout fix wave: create a standalone harness file (e.g. `/tmp/ancestor-gap-harness.tsx` or similar scratch location outside the repo) that renders `<TreeView>` with fixture people/relationships data producing at least two ancestor-row columns of different heights (e.g. one column whose person has no recorded parents, so it shows an `AddParentSlot` row, next to one that doesn't) — the exact scenario that produces the gap. Use Playwright to screenshot and measure the gap between a `.ancestor-grid-item`'s bottom edge and its `.ancestor-grid-connector`'s top edge, for both the taller and shorter columns, before and after the CSS change. Confirm both are now flush (0px, or the same value for both columns). Delete the harness files when done — nothing from this step gets committed.

- [ ] **Step 3: Commit**

```bash
git add client/src/styles/global.css
git commit -m "Fix residual gap under ancestor-grid connectors

.ancestor-grid-item defaulted to align-self: stretch, so a shorter
column top-aligned within its row's stretched track (sized by the
tallest column in that row), leaving empty space before its connector.
align-self: end bottom-aligns every column's content to its row track
regardless of neighboring row-height variance."
```

---

### Task 2: Fix dropped-ancestor bug and add stable occurrence id

**Files:**
- Modify: `client/src/lib/familyGraph.ts` (the `AncestorUnit` interface at line 54, and `buildAncestorRows` at lines 65-92)
- Test: `client/src/lib/familyGraph.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `AncestorUnit` gains `id: string`. `buildAncestorRows` no longer silently drops a shared ancestor reached via two different lineages at the same depth. Later tasks (3, 4) rely on `unit.id` being present and unique per occurrence.

- [ ] **Step 1: Write the failing regression test for the dropped-ancestor bug**

Add to `client/src/lib/familyGraph.test.ts` (append after the existing `buildAncestorRows` tests, before the `getDescendantIds` tests):

```ts
test('buildAncestorRows keeps a shared ancestor reachable via two different lineages at the same depth', () => {
  // Priya and a second person, Kunal, are first cousins: both are children
  // of siblings Ila and Om, who share a parent, Grandma. Priya's parent is
  // Ila; Kunal's parent is Om; Ila and Om's shared parent is Grandma —
  // a pedigree collapse one generation further up from Priya and Kunal.
  const cousinRelationships: Relationship[] = [
    { id: 'c1', type: 'parent-child', from_id: 'grandma', to_id: 'ila' },
    { id: 'c2', type: 'parent-child', from_id: 'grandma', to_id: 'om' },
    { id: 'c3', type: 'parent-child', from_id: 'ila', to_id: 'priya' },
    { id: 'c4', type: 'parent-child', from_id: 'om', to_id: 'kunal' },
    { id: 'c5', type: 'parent-child', from_id: 'ila', to_id: 'kunal' },
  ]
  // Kunal's recorded parents are Om and Ila (both), so at depth 1 from
  // Kunal's own focal view the currentIds become [ila, om] (via the
  // depth-1 units' personId/spouseId). At depth 2, both ila's and om's
  // searches reach 'grandma' — the pedigree collapse this test targets.
  const rows = buildAncestorRows('kunal', cousinRelationships)
  const depth2 = rows.find((r) => r.depth === 2)!
  // grandma must appear as a depth-2 parent for BOTH ila and om, not be
  // dropped for the second one processed.
  const grandmaUnits = depth2.units.filter((u) => u.personId === 'grandma')
  expect(grandmaUnits.length).toBe(2)
  expect(grandmaUnits.map((u) => u.childId).sort()).toEqual(['ila', 'om'])
})

test('buildAncestorRows still merges one persons own two parents into a single unit', () => {
  // Regression guard: the seenParentIds fix must not reintroduce two
  // separate units for one recorded couple.
  const rows = buildAncestorRows('meera', relationships)
  const depth1 = rows.find((r) => r.depth === 1)!
  expect(depth1.units.length).toBe(1)
  expect(depth1.units[0]).toMatchObject({ personId: 'anna', spouseId: 'ravi', childId: 'meera' })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd client && npx vitest run src/lib/familyGraph.test.ts`
Expected: the new "keeps a shared ancestor" test FAILS (`grandmaUnits.length` is `1`, not `2`) — `seenParentIds` currently drops the second occurrence. The "still merges" test passes already (no regression yet).

- [ ] **Step 3: Rescope `seenParentIds` per id, not per depth**

In `client/src/lib/familyGraph.ts`, `buildAncestorRows` currently reads:

```ts
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
```

Change to (move the `Set` declaration inside the `for (const id of currentIds)` loop so it resets per id):

```ts
  while (currentIds.length > 0) {
    depth += 1
    const units: AncestorUnit[] = []

    for (const id of currentIds) {
      const seenParentIds = new Set<string>()
      for (const parentId of getParentIds(id, relationships)) {
        if (seenParentIds.has(parentId)) continue
        const spouseId = getSpouseIds(parentId, relationships)[0] ?? null
        if (spouseId) seenParentIds.add(spouseId)
        seenParentIds.add(parentId)
        units.push({ personId: parentId, spouseId, childId: id })
      }
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd client && npx vitest run src/lib/familyGraph.test.ts`
Expected: both new tests PASS. All pre-existing tests in this file still PASS (run the full file, not just the new tests, to confirm no regression).

- [ ] **Step 5: Write the failing test for the new `id` field**

Add to `client/src/lib/familyGraph.test.ts`:

```ts
test('buildAncestorRows assigns each unit a stable id unique per occurrence', () => {
  const rows = buildAncestorRows('meera', relationships)
  expect(rows[0].units[0].id).toBe('0:root:meera')
  const depth1 = rows.find((r) => r.depth === 1)!
  expect(depth1.units[0].id).toBe('1:meera:anna')
})

test('buildAncestorRows gives two units sharing a personId distinct ids', () => {
  const cousinRelationships: Relationship[] = [
    { id: 'c1', type: 'parent-child', from_id: 'grandma', to_id: 'ila' },
    { id: 'c2', type: 'parent-child', from_id: 'grandma', to_id: 'om' },
    { id: 'c3', type: 'parent-child', from_id: 'ila', to_id: 'priya' },
    { id: 'c4', type: 'parent-child', from_id: 'om', to_id: 'kunal' },
    { id: 'c5', type: 'parent-child', from_id: 'ila', to_id: 'kunal' },
  ]
  const rows = buildAncestorRows('kunal', cousinRelationships)
  const depth2 = rows.find((r) => r.depth === 2)!
  const grandmaUnits = depth2.units.filter((u) => u.personId === 'grandma')
  const ids = grandmaUnits.map((u) => u.id)
  expect(new Set(ids).size).toBe(2)
  expect(ids.sort()).toEqual(['2:ila:grandma', '2:om:grandma'])
})
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `cd client && npx vitest run src/lib/familyGraph.test.ts`
Expected: both new tests FAIL (`id` is `undefined` — the field doesn't exist yet).

- [ ] **Step 7: Add the `id` field**

In `client/src/lib/familyGraph.ts`, change the `AncestorUnit` interface:

```ts
export interface AncestorUnit {
  id: string
  personId: string
  spouseId: string | null
  childId: string | null
}
```

Update the two places `buildAncestorRows` constructs an `AncestorUnit`. The seed row:

```ts
  const rows: AncestorRow[] = [{ depth: 0, units: [{ personId: focalId, spouseId: getSpouseIds(focalId, relationships)[0] ?? null, childId: null }] }]
```

becomes:

```ts
  const rows: AncestorRow[] = [{ depth: 0, units: [{ id: '0:root:' + focalId, personId: focalId, spouseId: getSpouseIds(focalId, relationships)[0] ?? null, childId: null }] }]
```

And inside the loop:

```ts
        units.push({ personId: parentId, spouseId, childId: id })
```

becomes:

```ts
        units.push({ id: `${depth}:${id}:${parentId}`, personId: parentId, spouseId, childId: id })
```

(`id` here is the loop variable — the child's id — which is exactly `childId`; `childId ?? 'root'` from the spec's format only applies to the depth-0 seed row, where `childId` is `null` and `'root'` is used explicitly above.)

- [ ] **Step 8: Update the 3 pre-existing `toEqual` assertions that now fail on the new field**

Adding a required `id` field means `buildAncestorRows`'s output objects now carry an extra property; the file's pre-existing tests that compare a whole unit object with `toEqual` will fail (deep equality) unless the expected object also includes `id`. In `client/src/lib/familyGraph.test.ts`, update:

```ts
test('buildAncestorRows returns the focal person alone at depth 0', () => {
  const rows = buildAncestorRows('meera', relationships)
  expect(rows[0]).toEqual({ depth: 0, units: [{ personId: 'meera', spouseId: null, childId: null }] })
})
```

to:

```ts
test('buildAncestorRows returns the focal person alone at depth 0', () => {
  const rows = buildAncestorRows('meera', relationships)
  expect(rows[0]).toEqual({ depth: 0, units: [{ id: '0:root:meera', personId: 'meera', spouseId: null, childId: null }] })
})
```

```ts
test('buildAncestorRows walks up through recorded parent couples', () => {
  const rows = buildAncestorRows('meera', relationships)
  // depth 1: Meera's parents, Anna & Ravi, as one couple unit
  const depth1 = rows.find((r) => r.depth === 1)!
  expect(depth1.units).toEqual([{ personId: 'anna', spouseId: 'ravi', childId: 'meera' }])
})
```

to:

```ts
test('buildAncestorRows walks up through recorded parent couples', () => {
  const rows = buildAncestorRows('meera', relationships)
  // depth 1: Meera's parents, Anna & Ravi, as one couple unit
  const depth1 = rows.find((r) => r.depth === 1)!
  expect(depth1.units).toEqual([{ id: '1:meera:anna', personId: 'anna', spouseId: 'ravi', childId: 'meera' }])
})
```

```ts
test('buildAncestorRows handles someone with only one recorded parent', () => {
  const oneParent: Relationship[] = [
    { id: 'x1', type: 'parent-child', from_id: 'solo-parent', to_id: 'solo-child' },
  ]
  const rows = buildAncestorRows('solo-child', oneParent)
  const depth1 = rows.find((r) => r.depth === 1)!
  expect(depth1.units).toEqual([{ personId: 'solo-parent', spouseId: null, childId: 'solo-child' }])
})
```

to:

```ts
test('buildAncestorRows handles someone with only one recorded parent', () => {
  const oneParent: Relationship[] = [
    { id: 'x1', type: 'parent-child', from_id: 'solo-parent', to_id: 'solo-child' },
  ]
  const rows = buildAncestorRows('solo-child', oneParent)
  const depth1 = rows.find((r) => r.depth === 1)!
  expect(depth1.units).toEqual([{ id: '1:solo-child:solo-parent', personId: 'solo-parent', spouseId: null, childId: 'solo-child' }])
})
```

- [ ] **Step 9: Run tests to verify they pass**

Run: `cd client && npx vitest run src/lib/familyGraph.test.ts`
Expected: all tests in the file PASS.

- [ ] **Step 10: Fix the TypeScript build**

`AncestorUnit` is a shared interface; adding a required field breaks any other object literal typed as `AncestorUnit` that doesn't yet set `id`. Run: `cd client && npx tsc --noEmit` and fix any resulting errors by adding the missing `id` field at each call site the compiler flags. `ancestorLayout.ts` and `TreeView.tsx` only *read* `AncestorUnit` fields at this point (they don't construct new ones), so expect no errors there — but `ancestorLayout.test.ts` hand-constructs `AncestorUnit` fixtures directly and WILL fail to compile until Task 3 updates it; that's expected and handled in Task 3, not here.

- [ ] **Step 11: Commit**

```bash
git add client/src/lib/familyGraph.ts client/src/lib/familyGraph.test.ts
git commit -m "Fix pedigree-collapse bug that silently dropped a shared ancestor

seenParentIds was scoped per depth, shared across every currentId
processed at that depth. Two different people at the same depth
sharing one ancestor (cousin marriage / pedigree collapse) meant the
second person's search silently dropped that ancestor once the first
person's search had already recorded it — real data went missing
from the view, not just misrendered.

Rescoped the Set to reset per id, so it still merges one person's own
two parents into a single couple-unit (the original intent) without
suppressing a shared ancestor across independent lineages.

Also adds a stable id field to AncestorUnit
(\`\${depth}:\${childId ?? 'root'}:\${personId}\`), unique per occurrence,
needed because the fix above now legitimately produces two units with
the same personId — a following task rekeys ancestorLayout.ts and
TreeView.tsx's lookups/React keys from personId to id."
```

---

### Task 3: Rekey layout map and React keys from `personId` to `id`

**Files:**
- Modify: `client/src/lib/ancestorLayout.ts` (the `requiredWidth`/`spans` maps, currently keyed by `unit.personId`)
- Modify: `client/src/components/tree/TreeView.tsx` (three React `key`s: line ~455 `key={unit.personId}`, line ~499 `` key={`content-${unit.personId}`} ``, line ~511 `` key={`connector-${unit.personId}`} ``)
- Test: `client/src/lib/ancestorLayout.test.ts`, `client/src/components/tree/TreeView.test.tsx`

**Interfaces:**
- Consumes: `AncestorUnit.id` from Task 2.
- Produces: `computeAncestorLayout`'s returned `Map<string, ColumnSpan>` is now keyed by `unit.id`, not `unit.personId` — Task 4 must look up spans by `unit.id` too.

- [ ] **Step 1: Add the `id` field to every pre-existing fixture in `ancestorLayout.test.ts`**

`AncestorUnit` now requires `id` (Task 2), so this file's 7 existing tests won't compile until their hand-built fixtures set it. Since none of these fixtures have a personId collision, give each unit an `id` equal to its own `personId` — this keeps every existing `spans.get('someId')` assertion working unchanged after Step 3 rekeys the implementation, since `id === personId` for all of them. Add `id: '<same value as personId>'` as the first property of every unit object literal in the file. For example:

```ts
const rows: AncestorRow[] = [{ depth: 0, units: [{ personId: 'meera', spouseId: null, childId: null }] }]
```

becomes:

```ts
const rows: AncestorRow[] = [{ depth: 0, units: [{ id: 'meera', personId: 'meera', spouseId: null, childId: null }] }]
```

Apply the same `id: '<personId>'` addition to every unit literal in every test in the file (all 7 tests: solo focal, focal couple, one-side-recorded, both-sides-recorded, deeper-ancestor, empty-array — no units to touch — and the two-co-parents test, which has two units, `father` and `mother`, each getting its own matching `id`).

- [ ] **Step 2: Run the file to confirm it now compiles and still passes**

Run: `cd client && npx vitest run src/lib/ancestorLayout.test.ts`
Expected: all 7 pre-existing tests PASS (this step is a pure compile-fix, no behavior change yet — `ancestorLayout.ts` itself hasn't been touched).

- [ ] **Step 3: Write the failing test for duplicate-personId spans**

Add to `client/src/lib/ancestorLayout.test.ts` (check the existing file's imports and fixture style first, then follow the same pattern):

```ts
test('computeAncestorLayout gives two units sharing a personId distinct, non-overlapping spans', () => {
  // Kunal's two depth-1 parents (ila, om) both trace back to the same
  // depth-2 ancestor, grandma — a pedigree collapse producing two
  // AncestorUnits with personId 'grandma' but different ids.
  const rows: AncestorRow[] = [
    { depth: 0, units: [{ id: '0:root:kunal', personId: 'kunal', spouseId: null, childId: null }] },
    {
      depth: 1,
      units: [
        { id: '1:kunal:ila', personId: 'ila', spouseId: null, childId: 'kunal' },
        { id: '1:kunal:om', personId: 'om', spouseId: null, childId: 'kunal' },
      ],
    },
    {
      depth: 2,
      units: [
        { id: '2:ila:grandma', personId: 'grandma', spouseId: null, childId: 'ila' },
        { id: '2:om:grandma', personId: 'grandma', spouseId: null, childId: 'om' },
      ],
    },
  ]
  const spans = computeAncestorLayout(rows)
  const span1 = spans.get('2:ila:grandma')
  const span2 = spans.get('2:om:grandma')
  expect(span1).toBeDefined()
  expect(span2).toBeDefined()
  // Non-overlapping: one entirely before the other.
  expect(span1!.end <= span2!.start || span2!.end <= span1!.start).toBe(true)
})
```

- [ ] **Step 4: Run test to verify it fails**

Run: `cd client && npx vitest run src/lib/ancestorLayout.test.ts`
Expected: FAIL. With `personId`-keying, `spans.get('2:ila:grandma')` returns `undefined` (that's not a valid map key today — the current code keys by `unit.personId`, i.e. the map has one entry under `'grandma'`, not two entries under the two `id`s).

- [ ] **Step 5: Rekey `ancestorLayout.ts`**

In `client/src/lib/ancestorLayout.ts`, every place that keys or looks up `requiredWidth`/`spans` by `unit.personId` (or `u.personId`) changes to `unit.id` (or `u.id`). Specifically:

```ts
  const sumWidth = (units: AncestorUnit[] | undefined): number => {
    if (!units || units.length === 0) return 1
    return units.reduce((sum, u) => sum + requiredWidth.get(u.personId)!, 0)
  }
```

becomes:

```ts
  const sumWidth = (units: AncestorUnit[] | undefined): number => {
    if (!units || units.length === 0) return 1
    return units.reduce((sum, u) => sum + requiredWidth.get(u.id)!, 0)
  }
```

```ts
    for (const unit of row.units) {
      const personWidth = sumWidth(nextChildMap?.get(unit.personId))
      const spouseWidth = unit.spouseId ? sumWidth(nextChildMap?.get(unit.spouseId)) : 0
      requiredWidth.set(unit.personId, personWidth + spouseWidth)
    }
```

becomes (only the `.set(...)` key changes — the `nextChildMap.get(unit.personId)`/`.get(unit.spouseId)` calls stay as-is, since `unitByChildId` is keyed by `childId`, not by this unit's own id):

```ts
    for (const unit of row.units) {
      const personWidth = sumWidth(nextChildMap?.get(unit.personId))
      const spouseWidth = unit.spouseId ? sumWidth(nextChildMap?.get(unit.spouseId)) : 0
      requiredWidth.set(unit.id, personWidth + spouseWidth)
    }
```

```ts
  const rootUnit = rootRow.units[0]
  spans.set(rootUnit.personId, { start: 0, end: requiredWidth.get(rootUnit.personId) ?? (rootUnit.spouseId ? 2 : 1) })
```

becomes:

```ts
  const rootUnit = rootRow.units[0]
  spans.set(rootUnit.id, { start: 0, end: requiredWidth.get(rootUnit.id) ?? (rootUnit.spouseId ? 2 : 1) })
```

```ts
  const layoutSide = (units: AncestorUnit[] | undefined, start: number): void => {
    if (!units) return
    let cursor = start
    for (const unit of units) {
      const width = requiredWidth.get(unit.personId)!
      spans.set(unit.personId, { start: cursor, end: cursor + width })
      cursor += width
    }
  }
```

becomes:

```ts
  const layoutSide = (units: AncestorUnit[] | undefined, start: number): void => {
    if (!units) return
    let cursor = start
    for (const unit of units) {
      const width = requiredWidth.get(unit.id)!
      spans.set(unit.id, { start: cursor, end: cursor + width })
      cursor += width
    }
  }
```

```ts
    for (const unit of row.units) {
      const parentSpan = spans.get(unit.personId)
      if (!parentSpan) continue
```

becomes:

```ts
    for (const unit of row.units) {
      const parentSpan = spans.get(unit.id)
      if (!parentSpan) continue
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd client && npx vitest run src/lib/ancestorLayout.test.ts`
Expected: all tests in the file PASS, including the new one.

- [ ] **Step 7: Write the failing TreeView test for duplicate-personId rendering**

This file already has a `person(id, first, updatedAt = '')` fixture helper and a top-level `people`/`relationships` array (see the top of the file) — build a local fixture instead of reusing those, since this scenario's shape (cousin pedigree collapse, 2 generations) doesn't fit the existing shared fixture. `maxAncestorDepth` starts at `1` (component default), and depth-2 rows are revealed by clicking the `"Show more ancestors"` control, exactly as the file's other multi-depth tests already do (e.g. line 107). Add:

```tsx
test('grid mode renders both ancestor units when two share a personId (pedigree collapse)', () => {
  // Kunal's two parents (ila, om, no recorded spouse edge between them)
  // share one grandparent, grandma, reachable via both of them at depth 2.
  const cousinPeople = [person('kunal', 'Kunal'), person('ila', 'Ila'), person('om', 'Om'), person('grandma', 'Grandma')]
  const cousinRelationships: Relationship[] = [
    { id: 'r1', type: 'parent-child', from_id: 'ila', to_id: 'kunal' },
    { id: 'r2', type: 'parent-child', from_id: 'om', to_id: 'kunal' },
    { id: 'r3', type: 'parent-child', from_id: 'grandma', to_id: 'ila' },
    { id: 'r4', type: 'parent-child', from_id: 'grandma', to_id: 'om' },
  ]
  render(
    <TreeView
      people={cousinPeople}
      relationships={cousinRelationships}
      focalId="kunal"
      onAddParent={() => {}}
      onOpenProfile={() => {}}
      onCenterOn={() => {}}
    />,
  )
  fireEvent.click(screen.getByText('Show more ancestors'))
  expect(screen.getAllByText('Grandma').length).toBe(2)
})
```

- [ ] **Step 8: Run test to verify it fails**

Run: `cd client && npx vitest run src/components/tree/TreeView.test.tsx -t "pedigree collapse"`
Expected: FAIL. With `key={\`content-${unit.personId}\`}`, React only renders one of the two "Grandma" units (the second overwrites the first in the reconciler, or — depending on the exact collision — only one `.ancestor-grid-item` div for `'grandma'` exists at all since `computeAncestorLayout` itself only had one span for it before Step 3... note Step 3 already fixes the layout side; this test targets the *rendering* key collision specifically, so run it before Step 7 to confirm it still fails on the TreeView side even with Step 3 done).

- [ ] **Step 9: Rekey the three React keys in `TreeView.tsx`**

```tsx
            <Fragment key={unit.personId}>
```

becomes:

```tsx
            <Fragment key={unit.id}>
```

```tsx
            key={`content-${unit.personId}`}
```

becomes:

```tsx
            key={`content-${unit.id}`}
```

```tsx
              key={`connector-${unit.personId}`}
```

becomes:

```tsx
              key={`connector-${unit.id}`}
```

- [ ] **Step 10: Run test to verify it passes**

Run: `cd client && npx vitest run src/components/tree/TreeView.test.tsx -t "pedigree collapse"`
Expected: PASS.

- [ ] **Step 11: Run the full TreeView test suite**

Run: `cd client && npx vitest run src/components/tree/TreeView.test.tsx`
Expected: all tests PASS — this rekey must not change any existing rendering behavior for the non-collision case (a single unit's `id` is still unique, so its rendered output is unchanged).

- [ ] **Step 12: Commit**

```bash
git add client/src/lib/ancestorLayout.ts client/src/lib/ancestorLayout.test.ts client/src/components/tree/TreeView.tsx client/src/components/tree/TreeView.test.tsx
git commit -m "Rekey ancestor layout spans and React keys from personId to id

requiredWidth/spans in computeAncestorLayout, and three React keys in
TreeView.tsx, were keyed by unit.personId — a second AncestorUnit
sharing that personId (now possible after the pedigree-collapse fix)
silently overwrote the first entry / collided in React's reconciler.
Rekeyed to unit.id, the stable per-occurrence id added in the
previous commit."
```

---

### Task 4: Compose depth-0 sibling flap with grid rendering

**Files:**
- Modify: `client/src/components/tree/TreeView.tsx` (the branch condition around line 569, and `renderAncestorGrid` at lines 472-538)
- Test: `client/src/components/tree/TreeView.test.tsx`

**Interfaces:**
- Consumes: `unit.id`-keyed `spans` map from Task 3; existing `siblingsOf`, `renderSiblingColumn`, `toggleFlap`, `openFlaps` state.
- Produces: nothing consumed by later tasks — this is the last task.

- [ ] **Step 1: Write the failing test for depth-0 flap staying on grid**

Uses the file's existing `person()` helper and top-level `people`/`relationships` fixture (Anna+Ravi are Meera's parents; Sanjay and Deepak are Meera's siblings — the shared fixture already has exactly what's needed for the depth-0 case). For the deep-flap case, build a local fixture with a grandparent generation so a depth-1 unit (not the focal person) has a sibling to reveal. Add:

```tsx
test('opening the focal couples own sibling flap stays on grid rendering, with sibling columns', () => {
  render(<TreeView people={people} relationships={relationships} focalId="meera" onAddParent={() => {}} onOpenProfile={() => {}} onCenterOn={() => {}} />)
  fireEvent.click(screen.getByText('2')) // Meera's sibling-flap bubble, count 2 (Sanjay, Deepak)
  // Still grid mode: the ancestor-grid container is present, not the flex .gen rows.
  expect(document.querySelector('.ancestor-grid')).not.toBeNull()
  expect(screen.getByText('Sanjay')).toBeInTheDocument()
  expect(screen.getByText('Deepak')).toBeInTheDocument()
})

test('opening a deeper-generation sibling flap still falls back to flex rendering', () => {
  const deepPeople = [
    person('focal', 'Focal'), person('parent1', 'Parent'), person('parentSib', 'ParentSibling'), person('grandparent', 'Grand'),
  ]
  const deepRelationships: Relationship[] = [
    { id: 'r1', type: 'parent-child', from_id: 'parent1', to_id: 'focal' },
    { id: 'r2', type: 'parent-child', from_id: 'grandparent', to_id: 'parent1' },
    { id: 'r3', type: 'parent-child', from_id: 'grandparent', to_id: 'parentSib' },
  ]
  render(<TreeView people={deepPeople} relationships={deepRelationships} focalId="focal" onAddParent={() => {}} onOpenProfile={() => {}} onCenterOn={() => {}} />)
  // maxAncestorDepth defaults to 1, so parent1's row (depth 1) is already
  // visible with no expansion click needed — grandparent has no recorded
  // parents of their own, so "Show more ancestors" wouldn't even render.
  fireEvent.click(screen.getByText('1')) // parent1's sibling-flap bubble, count 1 (parentSib)
  expect(document.querySelector('.ancestor-grid')).toBeNull()
})
```

- [ ] **Step 2: Run tests to verify the first one fails**

Run: `cd client && npx vitest run src/components/tree/TreeView.test.tsx -t "focal couples own sibling flap"`
Expected: FAIL — today, `openFlaps.size === 0` is the only grid condition, so opening ANY flap (including this depth-0 one) currently falls back to flex, meaning `.ancestor-grid` is `null` when the test expects it non-null.

The second test (deeper-generation fallback) should already PASS with no code changes — it's a regression guard, confirm it passes before touching any code.

- [ ] **Step 3: Change the branch condition**

In `client/src/components/tree/TreeView.tsx`, find the main render body:

```tsx
      {openFlaps.size === 0 ? renderAncestorGrid() : renderFlexAncestorRows()}
```

Replace with a check computed just above it. First, find the root row/unit (needed by the new branch check and reused in Step 4), just before the `return` in the component body — add near where `visibleRows`/`focalChildren` are already computed (around line 185):

```tsx
  const rootUnit = visibleRows.find((row) => row.depth === 0)?.units[0] ?? null
  const rootDepth0Ids = rootUnit ? [rootUnit.personId, rootUnit.spouseId].filter((id): id is string => id !== null) : []
  const hasDeepFlapOpen = [...openFlaps].some((id) => !rootDepth0Ids.includes(id))
```

Then change the render line to:

```tsx
      {hasDeepFlapOpen ? renderFlexAncestorRows() : renderAncestorGrid()}
```

- [ ] **Step 4: Extend `renderAncestorGrid` to append depth-0 sibling columns**

In `client/src/components/tree/TreeView.tsx`, `renderAncestorGrid` currently ends with:

```tsx
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

First fix the `spans.get(rootRow.units[0].personId)` call in that existing block — it's still keyed by `personId` from before Task 3 touched other call sites but missed this one (it wasn't in the original diff list because it's part of the trailing block, not the main loop) — change to:

```tsx
        const rootSpan = spans.get(rootRow.units[0].id)
```

Then, immediately before the final `return <div className="ancestor-grid">{items}</div>` line, insert the depth-0 sibling-column logic. This needs the current maximum grid column index used so far, to append trailing columns after it — compute it from every span already assigned:

```tsx
    // Depth-0 sibling-flap composition: the focal couple's own revealed
    // siblings render as trailing grid columns, positioned after the
    // depth-0 unit's own person/spouse columns. They get no connector row
    // (no ancestor lineage of their own is drawn above them, matching the
    // established rule for revealed siblings) and don't affect any span
    // computed above, since they're appended strictly after the highest
    // column index already in use.
    if (rootRow) {
      const rootUnitForSiblings = rootRow.units[0]
      const rootPerson = byId.get(rootUnitForSiblings.personId)
      const rootSpouse = rootUnitForSiblings.spouseId ? byId.get(rootUnitForSiblings.spouseId) : null
      const rootAnyMissingParent =
        rootPerson != null &&
        (getParentIds(rootUnitForSiblings.personId, relationships).length === 0 ||
          (rootSpouse != null && getParentIds(rootSpouse.id, relationships).length === 0))

      let nextColumn = 0
      for (const span of spans.values()) {
        if (span.end > nextColumn) nextColumn = span.end
      }

      const appendSiblingColumns = (siblingIds: string[]) => {
        for (const sibId of siblingIds) {
          if (!openFlaps.has(rootUnitForSiblings.personId) && !(rootUnitForSiblings.spouseId && openFlaps.has(rootUnitForSiblings.spouseId))) continue
          const sibling = byId.get(sibId)
          if (!sibling) continue
          const sibSpouseId = getSpouseIds(sibId, relationships)[0]
          const sibSpouse = sibSpouseId ? byId.get(sibSpouseId) ?? null : null
          items.push(
            <div
              className="ancestor-grid-item"
              key={`sibling-${sibId}`}
              style={{ gridColumn: `${nextColumn + 1} / ${nextColumn + 2}`, gridRow: 2 * maxVisibleDepth + 1 }}
            >
              {renderSiblingColumn(sibId, sibling, sibSpouse, rootAnyMissingParent)}
            </div>,
          )
          nextColumn += 1
        }
      }

      if (openFlaps.has(rootUnitForSiblings.personId)) {
        appendSiblingColumns(siblingsOf(rootUnitForSiblings.personId))
      }
      if (rootUnitForSiblings.spouseId && openFlaps.has(rootUnitForSiblings.spouseId)) {
        appendSiblingColumns(siblingsOf(rootUnitForSiblings.spouseId))
      }
    }

    return <div className="ancestor-grid">{items}</div>
  }
```

(The `appendSiblingColumns` function's own internal `openFlaps.has(...)` guard is redundant with the two `if` calls around it — this is intentional defensive duplication matching the plan's exact code; an implementer may simplify by removing the internal guard as a cleanup, but functionally it's a no-op since both call sites already check before calling.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd client && npx vitest run src/components/tree/TreeView.test.tsx`
Expected: all tests PASS, including both new ones from Step 1.

- [ ] **Step 6: Manual browser verification**

Same throwaway-Playwright-harness technique as Task 1 — render `<TreeView>` with a focal person who has both recorded parents and at least one sibling, open the sibling flap, and visually confirm: the grid stays precise (ancestor connectors still land correctly above the focal person/spouse columns, unaffected by the appended sibling column), the sibling column renders after the couple, and a deeper-generation flap open still shows the flex fallback layout as before. Delete harness files when done.

- [ ] **Step 7: Commit**

```bash
git add client/src/components/tree/TreeView.tsx client/src/components/tree/TreeView.test.tsx
git commit -m "Compose depth-0 sibling flap with grid-precision rendering

Opening the focal couple's own sibling flap no longer forces a
fallback to the old flex rendering — grid mode now appends trailing
columns for revealed depth-0 siblings, positioned after the couple's
own columns, with no connector row (matching the existing rule that
revealed siblings have no ancestor lineage of their own drawn above
them). A flap opened at any deeper generation still falls back to
renderFlexAncestorRows, unchanged — full composition at every depth
is explicitly out of scope for this spec."
```

---

## Post-plan

After Task 4's commit, the SDD final-whole-branch review runs per this project's standing practice (`superpowers:subagent-driven-development`), followed by the branch/PR workflow in `CLAUDE.md`: push and open a PR, wait for explicit user approval before merging.
