# Tree Legibility Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix a real write-flow gap (spouse not auto-linked as co-parent), let a sibling's own branch be explored by clicking them, bound the tree's default depth so it stays legible as data grows, and add missing visual continuity/separation between generations and lineages.

**Architecture:** Six small, mostly-sequential changes to `App.tsx` and `TreeView.tsx` (plus `SiblingFlap.tsx` and CSS). No database/API changes. Tasks 3–6 all touch `TreeView.tsx`'s ancestor-row rendering and are ordered so each builds on the previous one's committed state rather than conflicting with it: sibling re-centering (3) → depth limiting (4) → cluster wrapping (5, which wraps the now-depth-limited units) → the generic connecting line (6, rendered inside the now-clustered structure).

**Tech Stack:** React 18 + TypeScript, Vitest + React Testing Library, existing `familyGraph.ts` helpers, existing `SeamLine` component (currently built and styled but unused).

## Global Constraints

- No database/RLS/RPC changes.
- No precise per-branch connector-line routing — that's a separate, later spec. The connecting line added here (Task 6) is a generic per-column visual cue, not geometrically routed between specific parent/child pairs.
- Re-centering the tree (via "Center tree here" or the new sibling-click behavior) always resets the ancestor-expansion depth and any open sibling flaps back to the default — every new focal person starts from a clean 3-generation view.
- Match existing code style: no comments except where a non-obvious constraint needs explaining.
- Run `cd client && npm test` after every task (this project's `package.json` test script is already `vitest run` — do NOT append `-- run`).

---

### Task 1: Auto-link spouse as co-parent when adding a child

**Files:**
- Modify: `client/src/App.tsx`
- Test: `client/src/App.test.tsx`

**Interfaces:**
- Consumes: `getSpouseIds(personId, relationships): string[]` from `client/src/lib/familyGraph.ts` (already exists, signature unchanged).
- Produces: no new interface — `handleLinkExisting`'s existing signature and call sites are unchanged.

- [ ] **Step 1: Write the failing test**

Add to `client/src/App.test.tsx`, after the existing `"adding a sibling links them to the anchor's existing parent, not the anchor"` test:

```tsx
test("adding a child to someone with a recorded spouse links both parents", async () => {
  localStorage.setItem('vansh:passphrase', 'test-passphrase')
  ;(fetchPeople as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
    { id: 'meera', first_name: 'Meera', last_name: 'Gade', gender: null, birth_date: '1955', death_date: null, birth_place: null, occupation: null, bio: null, created_at: '', updated_at: '' },
    { id: 'ravi', first_name: 'Ravi', last_name: null, gender: 'Male', birth_date: null, death_date: null, birth_place: null, occupation: null, bio: null, created_at: '', updated_at: '' },
  ])
  ;(fetchRelationships as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
    { id: 'r1', type: 'spouse', from_id: 'meera', to_id: 'ravi' },
  ])
  render(<App />)
  await waitFor(() => expect(screen.getByText('Meera Gade')).toBeInTheDocument())

  fireEvent.click(screen.getByText('Meera Gade'))
  await waitFor(() => expect(screen.getByText('Add relationship')).toBeInTheDocument())
  fireEvent.click(screen.getByText('Add relationship'))
  await waitFor(() => expect(screen.getByText('Add relationship to Meera')).toBeInTheDocument())

  ;(addPerson as ReturnType<typeof vi.fn>).mockResolvedValueOnce('rohan-id')
  fireEvent.click(screen.getByText('Child'))
  fireEvent.change(screen.getByPlaceholderText('Search existing people…'), { target: { value: 'Rohan' } })
  fireEvent.click(screen.getByText('Create new person "Rohan"'))

  await waitFor(() => expect(addRelationship).toHaveBeenCalledWith('parent-child', 'meera', 'rohan-id'))
  await waitFor(() => expect(addRelationship).toHaveBeenCalledWith('parent-child', 'ravi', 'rohan-id'))
})

test("adding a child to someone with no recorded spouse only links that one parent", async () => {
  localStorage.setItem('vansh:passphrase', 'test-passphrase')
  await openMeeraProfile()

  fireEvent.click(screen.getByText('Add relationship'))
  await waitFor(() => expect(screen.getByText('Add relationship to Meera')).toBeInTheDocument())

  ;(addPerson as ReturnType<typeof vi.fn>).mockResolvedValueOnce('rohan-id')
  fireEvent.click(screen.getByText('Child'))
  fireEvent.change(screen.getByPlaceholderText('Search existing people…'), { target: { value: 'Rohan' } })
  fireEvent.click(screen.getByText('Create new person "Rohan"'))

  await waitFor(() => expect(addRelationship).toHaveBeenCalledWith('parent-child', 'meera', 'rohan-id'))
  expect(addRelationship).toHaveBeenCalledTimes(1)
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd client && npx vitest run src/App.test.tsx -t "adding a child"`
Expected: FAIL — the second `addRelationship` call for the spouse never happens in the first test (only one call fires today).

- [ ] **Step 3: Add `getSpouseIds` to the imports and update the `'child'` branch**

In `client/src/App.tsx`, update the import:

```tsx
import { getParentIds, getSpouseIds } from './lib/familyGraph'
```

Replace:

```tsx
    } else if (kind === 'child') {
      // The anchor becomes the parent of the picked/created person.
      await addRelationship('parent-child', anchorId, otherId)
    } else if (kind === 'sibling') {
```

with:

```tsx
    } else if (kind === 'child') {
      // The anchor becomes the parent of the picked/created person — and,
      // if the anchor has a recorded spouse, the spouse becomes a parent
      // too, since a child's other parent is assumed to be whoever the
      // anchor is currently married to.
      await addRelationship('parent-child', anchorId, otherId)
      const spouseId = getSpouseIds(anchorId, relationships)[0]
      if (spouseId) {
        await addRelationship('parent-child', spouseId, otherId)
      }
    } else if (kind === 'sibling') {
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd client && npx vitest run src/App.test.tsx`
Expected: PASS, full file green (existing tests + 2 new ones).

- [ ] **Step 5: Commit**

```bash
git add client/src/App.tsx client/src/App.test.tsx
git commit -m "Auto-link the anchor's spouse as a co-parent when adding a child"
```

---

### Task 2: Sibling count as a small numbered bubble

**Files:**
- Modify: `client/src/components/tree/SiblingFlap.tsx`
- Test: `client/src/components/tree/SiblingFlap.test.tsx` (create — none exists yet)
- Modify: `client/src/styles/global.css`

**Interfaces:**
- Produces: no change to `SiblingFlapProps` or its `open`/`onToggle`/`count` contract — purely a rendering/CSS change. Existing callers (`TreeView.tsx`'s two `<SiblingFlap>` usages) are unaffected.

- [ ] **Step 1: Write the failing test**

Create `client/src/components/tree/SiblingFlap.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { SiblingFlap } from './SiblingFlap'

test('shows the sibling count as a bubble', () => {
  render(<SiblingFlap count={3} open={false} onToggle={() => {}} />)
  expect(screen.getByText('3')).toBeInTheDocument()
})

test('clicking the bubble calls onToggle', () => {
  const onToggle = vi.fn()
  render(<SiblingFlap count={2} open={false} onToggle={onToggle} />)
  fireEvent.click(screen.getByText('2'))
  expect(onToggle).toHaveBeenCalledOnce()
})

test('reflects the open state via a class, for the existing chevron-rotation CSS', () => {
  const { container } = render(<SiblingFlap count={1} open={true} onToggle={() => {}} />)
  expect(container.querySelector('.sibling-bubble.open')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npx vitest run src/components/tree/SiblingFlap.test.tsx`
Expected: FAIL — `screen.getByText('3')` doesn't exist yet (current markup renders `"3 siblings"` as one text node, not the bare count `"3"`).

- [ ] **Step 3: Replace the flap markup with a bubble**

Replace the full contents of `client/src/components/tree/SiblingFlap.tsx`:

```tsx
export function SiblingFlap({ count, open, onToggle }: SiblingFlapProps) {
  return (
    <button
      className={['sibling-bubble', open ? 'open' : ''].filter(Boolean).join(' ')}
      onClick={onToggle}
      aria-label={open ? 'Hide siblings' : `${count} sibling${count === 1 ? '' : 's'}`}
    >
      {count}
    </button>
  )
}

interface SiblingFlapProps {
  count: number
  open: boolean
  onToggle: () => void
}
```

(Interface declaration moved below the function only to keep the diff minimal relative to file conventions elsewhere in this codebase — either order is fine; keep whichever reads cleaner, but the `Icon` import is no longer needed and should be removed since the chevron icon is dropped in favor of the bare count.)

- [ ] **Step 4: Add the bubble CSS**

In `client/src/styles/global.css`, replace the existing `.flap` rule block:

```css
.flap { display: flex; align-items: center; gap: 6px; background: var(--patch); border: 1.5px dashed var(--border-strong); border-radius: var(--radius-pill); height: 28px; padding: 0 12px; font-size: 11px; font-weight: 600; color: var(--thread); cursor: pointer; }
.flap:hover { border-color: var(--thread); }
.flap .icon { transition: transform .3s cubic-bezier(.16,1,.3,1); }
.flap.open .icon { transform: rotate(180deg); }
```

with:

```css
.sibling-bubble { display: flex; align-items: center; justify-content: center; width: 24px; height: 24px; border-radius: 50%; background: var(--patch); border: 1.5px dashed var(--border-strong); font-size: 11px; font-weight: 700; color: var(--thread); cursor: pointer; padding: 0; }
.sibling-bubble:hover { border-color: var(--thread); background: var(--thread-soft); }
.sibling-bubble.open { background: var(--thread-soft); border-style: solid; border-color: var(--thread); color: var(--thread-ink); }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd client && npx vitest run src/components/tree/SiblingFlap.test.tsx`
Expected: PASS, all 3 tests green.

- [ ] **Step 6: Run the full client test suite**

Run: `cd client && npm test`
Expected: PASS. `TreeView.test.tsx`'s existing sibling-flap tests (e.g. `'siblings start collapsed behind a flap showing the correct count'`, which asserts `screen.getByText('2 siblings')`) will now FAIL, since the visible text changed from `"2 siblings"` to just `"2"` — this is expected fallout from this task's own change, not a regression. Update those specific assertions in `client/src/components/tree/TreeView.test.tsx` from `screen.getByText('2 siblings')` / `screen.getByText('1 sibling')` to `screen.getByText('2')` / `screen.getByText('1')` (search the file for every occurrence — there are several across different tests) so the suite reflects the new bubble markup. Do not change anything else in that file as part of this task.

- [ ] **Step 7: Run the full suite again to confirm it's green**

Run: `cd client && npm test`
Expected: PASS, entire suite green.

- [ ] **Step 8: Commit**

```bash
git add client/src/components/tree/SiblingFlap.tsx client/src/components/tree/SiblingFlap.test.tsx client/src/components/tree/TreeView.test.tsx client/src/styles/global.css
git commit -m "Show sibling count as a small numbered bubble instead of a text pill"
```

---

### Task 3: Clicking a sibling re-centers the tree on them

**Files:**
- Modify: `client/src/components/tree/TreeView.tsx`
- Modify: `client/src/components/tree/TreeView.test.tsx`
- Modify: `client/src/App.tsx`

**Interfaces:**
- Produces: `TreeViewProps` gains a required `onCenterOn: (id: string) => void`. Task 4/5/6 (later in this plan) don't depend on this directly, but every existing and new `<TreeView>` render call (in tests and in `App.tsx`) must supply it from here on.

- [ ] **Step 1: Write the failing tests**

Add to `client/src/components/tree/TreeView.test.tsx`, after the existing `'shows a sibling flap for the spouse side of a couple, not just the anchor'` test:

```tsx
test('clicking a sibling in an opened flap calls onCenterOn instead of onOpenProfile', () => {
  const onCenterOn = vi.fn()
  const onOpenProfile = vi.fn()
  render(<TreeView people={people} relationships={relationships} focalId="meera" onAddParent={() => {}} onOpenProfile={onOpenProfile} onCenterOn={onCenterOn} />)
  fireEvent.click(screen.getByText('2'))
  fireEvent.click(screen.getByText('Sanjay').closest('.patch')!)
  expect(onCenterOn).toHaveBeenCalledWith('sanjay')
  expect(onOpenProfile).not.toHaveBeenCalled()
})

test('double-clicking a sibling in an opened flap still focuses them, not recenters', () => {
  const onCenterOn = vi.fn()
  render(<TreeView people={people} relationships={relationships} focalId="meera" onAddParent={() => {}} onOpenProfile={() => {}} onCenterOn={onCenterOn} />)
  fireEvent.click(screen.getByText('2'))
  fireEvent.doubleClick(screen.getByText('Sanjay').closest('.patch')!)
  expect(screen.getByText('Sanjay').closest('.patch')).toHaveClass('in-focus')
  expect(onCenterOn).not.toHaveBeenCalled()
})
```

(These reference `screen.getByText('2')` for the sibling bubble, matching Task 2's new markup — this task runs after Task 2 in the plan, so that markup already exists.)

- [ ] **Step 2: Add `onCenterOn={() => {}}` to every existing `<TreeView>` render call**

`onCenterOn` becomes a required prop in Step 3 below. Every existing `render(<TreeView .../>)` call in `client/src/components/tree/TreeView.test.tsx` (there are many — search the whole file) needs `onCenterOn={() => {}}` added alongside the existing `onOpenProfile` prop, or the file won't compile/type-check. Do this for all of them now, before running the tests, following the same pattern used when `relationships` became a required prop on `RelationshipPicker` in an earlier spec.

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd client && npx vitest run src/components/tree/TreeView.test.tsx -t "onCenterOn"`
Expected: FAIL — `TreeView` doesn't accept an `onCenterOn` prop yet, and sibling-flap patches still call `onOpenProfile`.

- [ ] **Step 4: Add the prop and rewire the sibling-flap click handler**

In `client/src/components/tree/TreeView.tsx`, add `onCenterOn` to the props interface and destructuring:

```tsx
interface TreeViewProps {
  people: Person[]
  relationships: Relationship[]
  focalId: string
  onAddParent: (personId: string) => void
  onOpenProfile: (id: string) => void
  onCenterOn: (id: string) => void
}
```

```tsx
export function TreeView({ people, relationships, focalId, onAddParent, onOpenProfile, onCenterOn }: TreeViewProps) {
```

In `renderSiblingColumns`, change the `Couple`'s `onOpen` prop from `handleOpen` to `onCenterOn` — clicking a sibling-flap patch always re-centers, bypassing the Focus Mode branch `handleOpen` implements for every other patch in the tree:

```tsx
          <Couple
            person={sibling}
            spouse={sibSpouse}
            onOpen={onCenterOn}
            onDoubleOpen={focusOn}
            personState={patchState(sibId)}
            spouseState={sibSpouse ? patchState(sibSpouse.id) : undefined}
          />
```

(Only the `onOpen` line changes — `onDoubleOpen={focusOn}` stays exactly as it is, so double-click still focuses/dims rather than re-centering.)

- [ ] **Step 5: Wire the prop in App.tsx**

In `client/src/App.tsx`, add `onCenterOn` to the existing `<TreeView>` usage:

```tsx
      {focalId && (
        <TreeView
          people={people}
          relationships={relationships}
          focalId={focalId}
          onAddParent={(personId) => requirePassphrase(() => setPanel({ kind: 'picker', anchorId: personId }))}
          onOpenProfile={(id) => setPanel({ kind: 'profile', personId: id })}
          onCenterOn={(id) => setFocalId(id)}
        />
      )}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd client && npx vitest run src/components/tree/TreeView.test.tsx`
Expected: PASS, full file green.

- [ ] **Step 7: Run the full client test suite**

Run: `cd client && npm test`
Expected: PASS, entire suite green.

- [ ] **Step 8: Commit**

```bash
git add client/src/components/tree/TreeView.tsx client/src/components/tree/TreeView.test.tsx client/src/App.tsx
git commit -m "Clicking a sibling re-centers the tree on them instead of opening their profile"
```

---

### Task 4: Default ancestor window of 1 generation, expandable, reset on re-center

**Files:**
- Modify: `client/src/components/tree/TreeView.tsx`
- Modify: `client/src/components/tree/TreeView.test.tsx`
- Modify: `client/src/styles/global.css`

**Interfaces:**
- Produces: no new props — purely internal `TreeView` state and rendering logic.

- [ ] **Step 1: Write the failing tests**

Add to `client/src/components/tree/TreeView.test.tsx`, after the tests added in Task 3:

```tsx
test('ancestor rows deeper than 1 generation stay collapsed by default, with a toggle to reveal more', () => {
  const withGrandparents = [...people, person('anna_dad', 'AnnaDad'), person('anna_mom', 'AnnaMom')]
  const relsWithGrandparents: Relationship[] = [
    ...relationships,
    { id: 'r8', type: 'spouse', from_id: 'anna_dad', to_id: 'anna_mom' },
    { id: 'r9', type: 'parent-child', from_id: 'anna_dad', to_id: 'anna' },
    { id: 'r10', type: 'parent-child', from_id: 'anna_mom', to_id: 'anna' },
  ]
  render(<TreeView people={withGrandparents} relationships={relsWithGrandparents} focalId="meera" onAddParent={() => {}} onOpenProfile={() => {}} onCenterOn={() => {}} />)
  expect(screen.queryByText('AnnaDad')).not.toBeInTheDocument()
  fireEvent.click(screen.getByText('Show more ancestors'))
  expect(screen.getByText('AnnaDad')).toBeInTheDocument()
})

test('re-centering resets the ancestor depth and open sibling flaps back to the default', () => {
  const withGrandparents = [...people, person('anna_dad', 'AnnaDad'), person('anna_mom', 'AnnaMom')]
  const relsWithGrandparents: Relationship[] = [
    ...relationships,
    { id: 'r8', type: 'spouse', from_id: 'anna_dad', to_id: 'anna_mom' },
    { id: 'r9', type: 'parent-child', from_id: 'anna_dad', to_id: 'anna' },
    { id: 'r10', type: 'parent-child', from_id: 'anna_mom', to_id: 'anna' },
  ]
  const { rerender } = render(<TreeView people={withGrandparents} relationships={relsWithGrandparents} focalId="meera" onAddParent={() => {}} onOpenProfile={() => {}} onCenterOn={() => {}} />)
  fireEvent.click(screen.getByText('Show more ancestors'))
  expect(screen.getByText('AnnaDad')).toBeInTheDocument()
  fireEvent.click(screen.getByText('2'))
  expect(screen.getByText('Sanjay')).toBeInTheDocument()

  rerender(<TreeView people={withGrandparents} relationships={relsWithGrandparents} focalId="sanjay" onAddParent={() => {}} onOpenProfile={() => {}} onCenterOn={() => {}} />)

  expect(screen.queryByText('AnnaDad')).not.toBeInTheDocument()
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd client && npx vitest run src/components/tree/TreeView.test.tsx -t "ancestor"`
Expected: FAIL — `AnnaDad` renders unconditionally today (no depth limit exists), so the first test's initial `not.toBeInTheDocument()` assertion fails, and no `"Show more ancestors"` text exists.

- [ ] **Step 3: Add the depth-limiting state, effect, and rendering**

In `client/src/components/tree/TreeView.tsx`, add new state alongside the existing `openFlaps`/`focusedId`/`focusModeEnabled`:

```tsx
  const [maxAncestorDepth, setMaxAncestorDepth] = useState(1)
```

Add a new `useEffect` (separate from the existing Escape-key one, which stays keyed on `focusedId` and unchanged) resetting the depth and open flaps whenever the focal person changes:

```tsx
  useEffect(() => {
    setMaxAncestorDepth(1)
    setOpenFlaps(new Set())
  }, [focalId])
```

Compute the visible rows and whether more exist, right after `const rows = buildAncestorRows(focalId, relationships)`:

```tsx
  const visibleRows = rows.filter((row) => row.depth <= maxAncestorDepth)
  const hasMoreAncestors = rows.some((row) => row.depth > maxAncestorDepth)
```

Change the ancestor-rows render from `rows.map(...)` to `visibleRows.map(...)`:

```tsx
      {visibleRows.map((row) => (
```

Immediately after the closing of that `visibleRows.map(...)` block (i.e. right after its containing `))}`, still inside the outer `<div className="tree" ...>`), add the expand toggle:

```tsx
      {hasMoreAncestors && (
        <button className="show-more-ancestors" onClick={() => setMaxAncestorDepth((d) => d + 1)}>
          Show more ancestors
        </button>
      )}
```

(This must be placed *after* the ancestor-rows block in JSX/DOM order, not before — `.tree` is `flex-direction: column-reverse`, so later DOM children render higher on screen. Placing it after the rows block puts it above the deepest currently-visible ancestor row, which is where "reveal one more generation up" belongs visually.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd client && npx vitest run src/components/tree/TreeView.test.tsx`
Expected: PASS, full file green.

- [ ] **Step 5: Add minimal styling for the toggle**

In `client/src/styles/global.css`, add directly after the `.focus-mode-toggle` rules:

```css
.show-more-ancestors { display: block; margin: 6px auto; background: none; border: none; color: var(--thread); font-size: 11px; font-weight: 600; cursor: pointer; }
.show-more-ancestors:hover { text-decoration: underline; }
```

- [ ] **Step 6: Run the full client test suite**

Run: `cd client && npm test`
Expected: PASS, entire suite green — confirms no other existing test (e.g. ones relying on grandparent-depth ancestors being visible without an explicit expand click) broke. If any pre-existing test in `TreeView.test.tsx` asserted a person at ancestor depth 2+ being visible without first clicking "Show more ancestors," update that specific test to click the toggle first — this is expected fallout from the new default-collapsed behavior, not a sign the depth-limiting logic is wrong.

- [ ] **Step 7: Commit**

```bash
git add client/src/components/tree/TreeView.tsx client/src/components/tree/TreeView.test.tsx client/src/styles/global.css
git commit -m "Cap ancestor rows to 1 generation by default, expandable, reset on re-center"
```

---

### Task 5: Family-cluster visual grouping for rows with multiple lineages

**Files:**
- Modify: `client/src/components/tree/TreeView.tsx`
- Modify: `client/src/components/tree/TreeView.test.tsx`
- Modify: `client/src/styles/global.css`

**Interfaces:**
- Produces: no new props — purely internal `TreeView` rendering.

- [ ] **Step 1: Write the failing test**

Add to `client/src/components/tree/TreeView.test.tsx`, after the tests added in Task 4:

```tsx
test('wraps a row unit with multiple lineages in labeled family clusters', () => {
  const named = (id: string, first: string, last: string) => ({ ...person(id, first), last_name: last })
  const clusteredPeople = [
    named('anna2', 'Anna', 'Gade'), named('ravi2', 'Ravi', 'Gade'), person('meera2', 'Meera'),
    named('anna_dad', 'AnnaDad', 'Gade'), named('anna_mom', 'AnnaMom', 'Gade'),
    named('ravi_dad', 'RaviDad', 'Khandgaonkar'), named('ravi_mom', 'RaviMom', 'Khandgaonkar'),
  ]
  const clusteredRelationships: Relationship[] = [
    { id: 'r1', type: 'spouse', from_id: 'anna2', to_id: 'ravi2' },
    { id: 'r2', type: 'parent-child', from_id: 'anna2', to_id: 'meera2' },
    { id: 'r3', type: 'parent-child', from_id: 'ravi2', to_id: 'meera2' },
    { id: 'r4', type: 'spouse', from_id: 'anna_dad', to_id: 'anna_mom' },
    { id: 'r5', type: 'parent-child', from_id: 'anna_dad', to_id: 'anna2' },
    { id: 'r6', type: 'parent-child', from_id: 'anna_mom', to_id: 'anna2' },
    { id: 'r7', type: 'spouse', from_id: 'ravi_dad', to_id: 'ravi_mom' },
    { id: 'r8', type: 'parent-child', from_id: 'ravi_dad', to_id: 'ravi2' },
    { id: 'r9', type: 'parent-child', from_id: 'ravi_mom', to_id: 'ravi2' },
  ]
  render(<TreeView people={clusteredPeople} relationships={clusteredRelationships} focalId="meera2" onAddParent={() => {}} onOpenProfile={() => {}} onCenterOn={() => {}} />)
  fireEvent.click(screen.getByText('Show more ancestors'))

  const gadeLabel = screen.getByText('Gade')
  const khandgaonkarLabel = screen.getByText('Khandgaonkar')
  expect(gadeLabel.closest('.family-cluster')).not.toBe(khandgaonkarLabel.closest('.family-cluster'))
  expect(gadeLabel.closest('.family-cluster')).not.toBeNull()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npx vitest run src/components/tree/TreeView.test.tsx -t "family clusters"`
Expected: FAIL — no `.family-cluster` elements or `"Gade"`/`"Khandgaonkar"` label text exist yet.

- [ ] **Step 3: Add the `clusterLabel` helper**

In `client/src/components/tree/TreeView.tsx`, add this function near the other module-level helpers (e.g. after `focusSetFor`):

```tsx
function clusterLabel(person: Person, spouse: Person | null): string | null {
  if (!person.last_name) return null
  if (!spouse) return person.last_name
  return spouse.last_name === person.last_name ? person.last_name : null
}
```

- [ ] **Step 4: Wrap each unit's rendered content in a labeled cluster when warranted**

In the `rows.map` → `row.units.map` block, after the existing `const anyHasSiblings = ...` line, add:

```tsx
            const label = clusterLabel(person, spouse)
            const showCluster = row.units.length > 1 || anyHasSiblings
```

Replace the `Fragment`'s return (currently a `.gen-column` div followed by the two `renderSiblingColumns` calls, all as direct `Fragment` children) with a version that conditionally wraps all of that in a `.family-cluster` div:

```tsx
            const unitContent = (
              <>
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
                </div>
                {personSiblingIds.length > 0 && openFlaps.has(unit.personId) && renderSiblingColumns(personSiblingIds, anyMissingParent)}
                {spouse && spouseSiblingIds.length > 0 && openFlaps.has(spouse.id) && renderSiblingColumns(spouseSiblingIds, anyMissingParent)}
              </>
            )

            return (
              <Fragment key={unit.personId}>
                {showCluster ? (
                  <div className="family-cluster">
                    {label && <div className="family-cluster-label">{label}</div>}
                    {unitContent}
                  </div>
                ) : unitContent}
              </Fragment>
            )
```

(This replaces the entire `return (<Fragment key={unit.personId}>...)` block that currently exists at the end of the `row.units.map((unit) => {...})` callback — everything from `if (!person) return null` down through the existing four `const` declarations stays exactly as it is; only the final `return` changes as shown.)

- [ ] **Step 5: Add cluster CSS**

In `client/src/styles/global.css`, add directly after the `.gen-column` rule:

```css
.family-cluster { display: flex; align-items: flex-start; gap: var(--space-xxl); border: 1.5px dashed var(--border-strong); border-radius: var(--radius-md); padding: var(--space-md); position: relative; }
.family-cluster-label { position: absolute; top: -9px; left: var(--space-md); background: var(--canvas); padding: 0 6px; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: var(--muted); }
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd client && npx vitest run src/components/tree/TreeView.test.tsx`
Expected: PASS, full file green.

- [ ] **Step 7: Run the full client test suite**

Run: `cd client && npm test`
Expected: PASS, entire suite green.

- [ ] **Step 8: Commit**

```bash
git add client/src/components/tree/TreeView.tsx client/src/components/tree/TreeView.test.tsx client/src/styles/global.css
git commit -m "Group multi-lineage row units into labeled family clusters"
```

---

### Task 6: Generic parent-child connecting line

**Files:**
- Modify: `client/src/components/tree/TreeView.tsx`
- Modify: `client/src/components/tree/TreeView.test.tsx`

**Interfaces:**
- Consumes: existing `SeamLine` component (`client/src/components/tree/SeamLine.tsx`, already implemented and styled, currently unused for `kind="parent-child"`).
- Produces: no new props — purely internal `TreeView` rendering.

- [ ] **Step 1: Write the failing test**

Add to `client/src/components/tree/TreeView.test.tsx`, after the test added in Task 5:

```tsx
test('renders a parent-child connecting seam below each ancestor-row Couple', () => {
  const { container } = render(<TreeView people={people} relationships={relationships} focalId="meera" onAddParent={() => {}} onOpenProfile={() => {}} onCenterOn={() => {}} />)
  const annaColumn = screen.getByText('Anna').closest('.gen-column')!
  expect(annaColumn.querySelector('.seam-parent-child')).not.toBeNull()
})

test("renders a parent-child connecting seam below a descendant's Couple when they have children", () => {
  const withChild = [...people, person('rohan', 'Rohan')]
  const relsWithChild: Relationship[] = [...relationships, { id: 'r8', type: 'parent-child', from_id: 'meera', to_id: 'rohan' }]
  render(<TreeView people={withChild} relationships={relsWithChild} focalId="meera" onAddParent={() => {}} onOpenProfile={() => {}} onCenterOn={() => {}} />)
  fireEvent.doubleClick(screen.getByText('Rohan').closest('.patch')!)
  fireEvent.click(screen.getByText('Exit focus'))
  const rohanColumn = screen.getByText('Rohan').closest('.gen-column')!
  expect(rohanColumn.querySelector('.seam-parent-child')).toBeNull()
})
```

(The second test's fixture gives Rohan no children of his own, so his column should have no connecting seam below it — proving the seam is conditional on actually having a next generation, not rendered unconditionally everywhere.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd client && npx vitest run src/components/tree/TreeView.test.tsx -t "connecting seam"`
Expected: FAIL — no `.seam-parent-child` elements render anywhere yet (first test fails; second test's assertion of `toBeNull()` would trivially pass today since nothing renders it at all, but is included for completeness once the first assertion establishes the feature exists elsewhere).

- [ ] **Step 3: Import `SeamLine` and render it in ancestor rows**

In `client/src/components/tree/TreeView.tsx`, add the import:

```tsx
import { SeamLine } from './SeamLine'
```

In the `unitContent` JSX built in Task 5 (inside the `.gen-column` div, directly after the `<Couple .../>` element and before the `{anyHasSiblings && (...)}` block), add:

```tsx
                  <SeamLine kind="parent-child" />
```

So every ancestor-row unit's `Couple` always has a connecting seam below it — every ancestor unit is, by construction, someone's recorded parent-or-parents, so this is unconditional here (unlike the descendant case below, where whether a person has children at all is a real fact to check).

- [ ] **Step 4: Render it in descendant branches when the person has children**

In `client/src/components/tree/TreeView.tsx`'s `DescendantBranch` function, add the same import usage — directly after the `<Couple ...>` element's children (i.e. inside the `<Couple>` tag, alongside the existing `{childIds.length > 0 && <CollapseToggle .../>}` line) add:

```tsx
        {childIds.length > 0 && <SeamLine kind="parent-child" />}
        {childIds.length > 0 && (
          <CollapseToggle
            expanded={expanded}
            label={expanded ? `Hide ${person.first_name}’s children` : `Show ${person.first_name}’s children`}
            onToggle={() => setExpanded((v) => !v)}
          />
        )}
```

(Both are children of `<Couple>` here, matching how `Couple` already accepts a `children` prop for exactly this kind of below-the-couple content — see the existing `CollapseToggle` usage.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd client && npx vitest run src/components/tree/TreeView.test.tsx`
Expected: PASS, full file green.

- [ ] **Step 6: Run the full client test suite**

Run: `cd client && npm test`
Expected: PASS, entire suite green.

- [ ] **Step 7: Commit**

```bash
git add client/src/components/tree/TreeView.tsx client/src/components/tree/TreeView.test.tsx
git commit -m "Render the existing (previously unused) SeamLine between generations"
```

---

## Post-plan: session log

Per this repo's `CLAUDE.md` session-logging convention, append an entry to the active `docs/sessions/YYYY-MM-DD-*.md` file for today recording: the request (Spec 4: tree legibility fixes, following the screenshot-driven bug report and the 3D-vs-2D discussion that led to this scoped 2D plan), what was done (auto-link co-parent, sibling numbered bubble, sibling-click re-centering, bounded ancestor depth with reset-on-recenter, family-cluster grouping, generic connecting-line rendering — Tasks 1-6), and the outcome (commit SHAs, tests passing, and that precise per-branch line routing remains a separate, not-yet-started Spec 5).
