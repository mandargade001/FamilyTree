# Profile Close Button + Sibling Layout Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a close button to the person profile panel, and fix sibling rendering in the ancestor tree so expanded siblings appear beside their sibling at the same generation row instead of stacked underneath.

**Architecture:** Two independent, small changes to existing React components in `client/src`. No new files, no schema/API changes. Change 1 adds an `onClose` callback prop threaded from `App.tsx` into `PersonProfile`. Change 2 restructures how `TreeView.tsx` renders an ancestor row's sibling flap contents — from a nested list inside the owner's `.gen-column` to flat sibling `.gen-column` elements inside the shared `.gen` row, via a `Fragment`.

**Tech Stack:** React 18 + TypeScript, Vitest + React Testing Library, existing `Icon`/`Button` shared components.

## Global Constraints

- Follow the spec exactly: close always returns to the bare tree (`panel: { kind: 'none' }`), no navigation history stack.
- Sibling layout fix is scoped to ancestor rows only (`TreeView.tsx`'s `rows.map`) — no changes to `DescendantBranch` or `familyGraph.ts` sibling-computation logic.
- Match existing code style: no comments except where a non-obvious constraint needs explaining (this codebase's existing comments explain *why*, not *what* — follow that pattern if a comment is genuinely needed, otherwise omit it).
- Run `cd client && npm test -- run` (or the project's configured test command) after every task to confirm the full suite is green before committing.

---

### Task 1: Add close button to `PersonProfile`

**Files:**
- Modify: `client/src/components/profile/PersonProfile.tsx`
- Test: `client/src/components/profile/PersonProfile.test.tsx`

**Interfaces:**
- Consumes: existing `Icon` component (`../shared/Icon`, already imported) — `<Icon name="close" size={16} />` (the `'close'` icon path already exists in `Icon.tsx`'s `PATHS` map).
- Produces: `PersonProfileProps` gains `onClose: () => void`. Task 2 (App.tsx wiring) depends on this exact prop name and signature.

- [ ] **Step 1: Write the failing test**

Add to `client/src/components/profile/PersonProfile.test.tsx`, after the existing `'Center tree here calls onCenterHere'` test:

```tsx
test('clicking the close button calls onClose', () => {
  const onClose = vi.fn()
  render(<PersonProfile {...baseProps({ onClose })} />)
  fireEvent.click(screen.getByLabelText('Close profile'))
  expect(onClose).toHaveBeenCalledOnce()
})
```

Also update `baseProps` in the same file to include a default `onClose: noop`, so every other existing test (which doesn't pass `onClose` explicitly) keeps compiling and passing:

```tsx
function baseProps(overrides: Partial<Parameters<typeof PersonProfile>[0]> = {}) {
  return {
    person: meera,
    people,
    relationships,
    onEdit: noop,
    onAddRelationship: noop,
    onOpenPerson: noop,
    onCenterHere: noop,
    onDelete: noop,
    onClose: noop,
    onUploadPhoto: async () => ({ ok: true as const }),
    ...overrides,
  }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npx vitest run src/components/profile/PersonProfile.test.tsx`
Expected: FAIL — `onClose` doesn't exist on `PersonProfileProps` (TypeScript error) and/or `getByLabelText('Close profile')` finds nothing.

- [ ] **Step 3: Implement the close button**

In `client/src/components/profile/PersonProfile.tsx`:

Add `onClose: () => void` to `PersonProfileProps`:

```tsx
interface PersonProfileProps {
  person: Person
  people: Person[]
  relationships: Relationship[]
  onEdit: () => void
  onAddRelationship: () => void
  onOpenPerson: (id: string) => void
  onCenterHere: () => void
  onDelete: () => void
  onClose: () => void
  onUploadPhoto: (file: File) => Promise<UploadResult>
}
```

Add `onClose` to the destructured props:

```tsx
export function PersonProfile({
  person,
  people,
  relationships,
  onEdit,
  onAddRelationship,
  onOpenPerson,
  onCenterHere,
  onDelete,
  onClose,
  onUploadPhoto,
}: PersonProfileProps) {
```

Add the close button as the first child of the `profile-layout` div, before the photo column:

```tsx
return (
  <div className="profile-layout">
    <button className="profile-close" onClick={onClose} aria-label="Close profile">
      <Icon name="close" size={16} />
    </button>
    <div>
      <div className="profile-photo">
```

(The rest of the two grid columns — photo column, then name/actions column — stay exactly as they are today; only the new `<button>` is inserted as an additional child before them.)

- [ ] **Step 4: Add the CSS**

In `client/src/styles/global.css`, make `.profile-layout` a positioning context and add `.profile-close` styled like the existing `.error-banner-dismiss` pattern. Change:

```css
.profile-layout { display: grid; grid-template-columns: 200px 1fr; gap: 26px; }
```

to:

```css
.profile-layout { position: relative; display: grid; grid-template-columns: 200px 1fr; gap: 26px; }
```

and add a new rule directly after it:

```css
.profile-close { position: absolute; top: 0; right: 0; background: none; border: none; color: var(--muted); cursor: pointer; display: flex; align-items: center; padding: 4px; }
.profile-close:hover { color: var(--thread); }
```

(`position: absolute` takes the button out of the grid's normal flow, so it doesn't disturb the existing two-column layout or the `@media (max-width: 680px)` single-column collapse below it.)

- [ ] **Step 5: Run test to verify it passes**

Run: `cd client && npx vitest run src/components/profile/PersonProfile.test.tsx`
Expected: PASS, all tests in the file (existing + new) green.

- [ ] **Step 6: Commit**

```bash
git add client/src/components/profile/PersonProfile.tsx client/src/components/profile/PersonProfile.test.tsx client/src/styles/global.css
git commit -m "Add close button to person profile panel"
```

---

### Task 2: Wire close button in `App.tsx`

**Files:**
- Modify: `client/src/App.tsx:285-296` (the `<PersonProfile>` usage)
- Test: `client/src/App.test.tsx`

**Interfaces:**
- Consumes: `PersonProfileProps.onClose` from Task 1, and the existing `Panel` state setter `setPanel({ kind: 'none' })` already used elsewhere in this file (e.g. line 68, 246, 248).
- Produces: nothing new consumed by later tasks.

- [ ] **Step 1: Write the failing test**

Add to `client/src/App.test.tsx`, after the `openMeeraProfile` helper and before the first test that uses it:

```tsx
test('the close button on a profile returns to the bare tree', async () => {
  await openMeeraProfile()

  fireEvent.click(screen.getByLabelText('Close profile'))

  expect(screen.queryByText('Edit Profile')).not.toBeInTheDocument()
  expect(screen.getByText('Meera Gade')).toBeInTheDocument()
})
```

(`openMeeraProfile` is defined at the top of `App.test.tsx` and already renders `<App />`, waits for the tree, and clicks into Meera's profile. After closing, the tree itself still shows "Meera Gade" as a patch label — only the profile panel's "Edit Profile" action should be gone.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npx vitest run src/App.test.tsx -t "close button on a profile"`
Expected: FAIL — no element with label "Close profile" exists yet (App.tsx hasn't passed `onClose` down, and even if it had, Task 1 must land first for the button to exist).

- [ ] **Step 3: Wire the prop**

In `client/src/App.tsx`, find the `<PersonProfile>` usage (around line 286) and add `onClose`:

```tsx
{panel.kind === 'profile' && profilePerson && (
  <PersonProfile
    person={profilePerson}
    people={people}
    relationships={relationships}
    onEdit={() => requirePassphrase(() => setPanel({ kind: 'form', editingId: panel.personId }))}
    onAddRelationship={() => requirePassphrase(() => setPanel({ kind: 'picker', anchorId: panel.personId }))}
    onOpenPerson={(id) => setPanel({ kind: 'profile', personId: id })}
    onCenterHere={() => setFocalId(panel.personId)}
    onDelete={() => requirePassphrase(() => { void handleDeletePerson(panel.personId) })}
    onClose={() => setPanel({ kind: 'none' })}
    onUploadPhoto={(file) => requestUploadPhoto(panel.personId, file)}
  />
)}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd client && npx vitest run src/App.test.tsx`
Expected: PASS, full `App.test.tsx` suite green (this confirms the new test passes and nothing else in the file broke).

- [ ] **Step 5: Commit**

```bash
git add client/src/App.tsx client/src/App.test.tsx
git commit -m "Wire profile close button to return to the bare tree"
```

---

### Task 3: Fix sibling layout to render at the same generation row

**Files:**
- Modify: `client/src/components/tree/TreeView.tsx`
- Modify: `client/src/styles/global.css`
- Test: `client/src/components/tree/TreeView.test.tsx`

**Interfaces:**
- Consumes: existing `Couple` component and its props (`person`, `spouse`, `onOpen`, `onDoubleOpen`, `personState`, `spouseState`) — same signature already used by the current `renderSiblingList` and the main row-unit `Couple` call. Existing `siblingsOf`, `patchState`, `handleOpen`, `focusOn`, `openFlaps` — all unchanged.
- Produces: nothing new consumed by later tasks (this plan's last task).

- [ ] **Step 1: Write the failing test**

Replace the existing `'clicking the sibling flap reveals the siblings'` test in `client/src/components/tree/TreeView.test.tsx` with a version that also asserts the new flat layout (keep the original assertions, add the layout ones):

```tsx
test('clicking the sibling flap reveals the siblings as row-adjacent columns, not nested under the owner', () => {
  const { container } = render(<TreeView people={people} relationships={relationships} focalId="meera" onAddParent={() => {}} onOpenProfile={() => {}} />)
  fireEvent.click(screen.getByText('2 siblings'))
  expect(screen.getByText('Sanjay')).toBeInTheDocument()
  expect(screen.getByText('Deepak')).toBeInTheDocument()

  const meeraColumn = screen.getByText('Meera').closest('.gen-column')!
  const sanjayColumn = screen.getByText('Sanjay').closest('.gen-column')!
  expect(sanjayColumn).not.toBe(meeraColumn)
  expect(sanjayColumn.parentElement).toBe(meeraColumn.parentElement)
  expect(meeraColumn.parentElement).toHaveClass('gen')
  expect(container.querySelector('.sibling-list')).not.toBeInTheDocument()
})
```

This replaces (doesn't duplicate) the earlier, less specific test of the same name — delete the old `'clicking the sibling flap reveals the siblings'` test block when adding this one.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npx vitest run src/components/tree/TreeView.test.tsx -t "row-adjacent columns"`
Expected: FAIL — currently `sanjayColumn.parentElement` is `meeraColumn` itself (nested), not `meeraColumn.parentElement`, and `.sibling-list` is still present in the DOM.

- [ ] **Step 3: Restructure sibling rendering**

In `client/src/components/tree/TreeView.tsx`:

Add `Fragment` to the React import:

```tsx
import { Fragment, useEffect, useState, type MouseEvent } from 'react'
```

Replace the `renderSiblingList` function (currently returns one `.gen sibling-list` wrapper div) with a function that returns an array of flat sibling columns instead:

```tsx
function renderSiblingColumns(ids: string[]) {
  return ids.map((sibId) => {
    const sibling = byId.get(sibId)
    if (!sibling) return null
    const sibSpouseId = getSpouseIds(sibId, relationships)[0]
    const sibSpouse = sibSpouseId ? byId.get(sibSpouseId) : null
    return (
      <div className="gen-column" key={sibId}>
        <Couple
          person={sibling}
          spouse={sibSpouse}
          onOpen={handleOpen}
          onDoubleOpen={focusOn}
          personState={patchState(sibId)}
          spouseState={sibSpouse ? patchState(sibSpouse.id) : undefined}
        />
      </div>
    )
  })
}
```

Then replace the `rows.map` block's return (currently a single `<div className="gen-column" key={unit.personId}>...</div>` per unit, with the old `renderSiblingList` calls at the end of that same div) with a `Fragment` that keeps the owner's column separate from newly flat sibling columns:

```tsx
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
        <Fragment key={unit.personId}>
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
          {personSiblingIds.length > 0 && openFlaps.has(unit.personId) && renderSiblingColumns(personSiblingIds)}
          {spouse && spouseSiblingIds.length > 0 && openFlaps.has(spouse.id) && renderSiblingColumns(spouseSiblingIds)}
        </Fragment>
      )
    })}
  </div>
))}
```

- [ ] **Step 4: Remove the now-unused `.sibling-list` CSS rule**

In `client/src/styles/global.css`, delete this line (no longer referenced anywhere after Step 3):

```css
.sibling-list { margin-top: var(--space-sm); }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd client && npx vitest run src/components/tree/TreeView.test.tsx`
Expected: PASS, full `TreeView.test.tsx` suite green — including the other sibling-related tests (`'focus mode auto-expands a collapsed sibling flap...'`, `'shows a sibling flap for the spouse side...'`, `'focusing a sibling dims an unrelated person...'`, `'focus mode auto-expands a collapsed flap that lives on the spouse side...'`), which exercise the same rendering path and must keep passing unchanged.

- [ ] **Step 6: Run the full client test suite**

Run: `cd client && npm test -- run`
Expected: PASS, entire suite green (confirms no regression in `familyGraph.test.ts`, `PersonPatch.test.tsx`, `App.test.tsx`, etc. from the `TreeView.tsx` restructuring).

- [ ] **Step 7: Commit**

```bash
git add client/src/components/tree/TreeView.tsx client/src/components/tree/TreeView.test.tsx client/src/styles/global.css
git commit -m "Render expanded siblings at the same generation row instead of stacked below"
```

---

## Post-plan: session log

Per this repo's `CLAUDE.md` session-logging convention, append an entry to the active `docs/sessions/YYYY-MM-DD-*.md` file for today (2026-09-06) recording: the request (the four observations, decomposed into Spec 1/2/3), what was done (Spec 1 designed, planned, and implemented — close button + sibling layout), and the outcome (commit SHAs from Tasks 1–3, tests passing, Specs 2 and 3 deferred).
