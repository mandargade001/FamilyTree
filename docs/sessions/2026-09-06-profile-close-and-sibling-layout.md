# 2026-09-06 — Profile close button + sibling layout fix

## Request

Four observations from using the app were reviewed and decomposed into three specs:

1. **Spec 1** (this session, in scope): the person profile panel had no way to close
   it back to the bare tree view, and expanded sibling flaps in the ancestor-row
   tree rendered siblings nested/stacked underneath the owning person instead of
   as flat, adjacent columns in the same generation row (visually implying a
   different generation).
2. **Spec 2**: deferred — not designed or planned this session.
3. **Spec 3**: deferred — not designed or planned this session.

## What was done

Spec 1 was designed (`.superpowers/sdd/2026-09-06-profile-close-and-sibling-layout/`
design doc), planned into three tasks, and implemented in full on branch
`worktree-profile-close-sibling-layout`:

- **Task 1** — Added a close button (`x`) to `PersonProfile`, calling a new
  `onClose` prop.
- **Task 2** — Wired the close button in `App.tsx` so it clears the open profile
  and returns to the bare tree view.
- **Task 3** — Restructured `TreeView.tsx`'s sibling rendering: replaced
  `renderSiblingList` (which returned one `.gen sibling-list` wrapper `div`
  nesting sibling `Couple`s underneath the owner's `.gen-column`) with
  `renderSiblingColumns`, which returns an array of standalone `.gen-column`
  divs — one per sibling — rendered via a `Fragment` as siblings of the owner's
  own `.gen-column` inside the same `.gen` row. Removed the now-unused
  `.sibling-list` CSS rule from `global.css`. Replaced the existing
  `'clicking the sibling flap reveals the siblings'` test in
  `TreeView.test.tsx` with an expanded version
  (`'... reveals the siblings as row-adjacent columns, not nested under the
  owner'`) asserting the sibling's `.gen-column` is a sibling (not a
  descendant) of the owner's `.gen-column`, both share a `.gen` parent, and no
  `.sibling-list` element remains in the DOM.

## Outcome

- Commits: `a86a7cf` (design), `91a5ff9` (plan), `dd60954` (Task 1: close
  button), `d9e1f78` (Task 2: wire close in App.tsx), `4df3645` (Task 3:
  flat sibling-column layout + CSS cleanup + test replacement).
- Tests: `client/src/components/tree/TreeView.test.tsx` — 22/22 passing. Full
  client suite (`npm test` from `client/`) — 13 files / 106 tests passing, no
  regressions.
- Specs 2 and 3 remain deferred — not designed, planned, or implemented this
  session.
