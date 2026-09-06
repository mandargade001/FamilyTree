# Profile close button + sibling layout fix — design

Spec 1 of 3 covering the observations logged 2026-09-06. Scope: two small, independent bug fixes to the tree UI. Form UX overhaul and Google auth/photos are separate specs (2 and 3), sequenced after this one.

## Problem

1. **No way to close an opened profile.** `PersonProfile` (`client/src/components/profile/PersonProfile.tsx`) has no `onClose` prop or dismiss control. The only way back to the bare tree is clicking the tree background, which isn't discoverable from inside the profile panel.
2. **Siblings render stacked vertically instead of at the same generation level.** In `TreeView.tsx`, `renderSiblingList` outputs a `.gen sibling-list` div nested inside the owning person's `.gen-column`, directly below their `Couple`. Combined with `.gen-column { flex-direction: column }` and `.sibling-list { margin-top: ... }`, expanded siblings appear underneath their sibling instead of beside them — misrepresenting them as a different generation.

## Design

### 1. Close button

- Add `onClose: () => void` to `PersonProfileProps`.
- Render a close (`×`) icon button in the profile panel header, using the existing `Icon`/`Button` components for visual consistency with the rest of the panel.
- In `App.tsx`, wire `onClose={() => setPanel({ kind: 'none' })}` on the `PersonProfile` usage — the same target state as clicking the tree background. No navigation history/back-stack; closing always returns to the bare tree, regardless of how the profile was reached (direct open vs. via a relationship chip).

### 2. Sibling layout

Ancestor rows (`rows.map` in `TreeView.tsx`) currently render one `.gen-column` per row unit, and — when that unit's flap is open — nest a sibling list *inside* that same column, below the couple. To make siblings appear at the same generation level as their sibling:

- Restructure the row-unit rendering so that, for each `row`, the list of rendered columns is built as a flat array: the owner's own column, followed by a column per open sibling (person-side and/or spouse-side), inserted immediately after the owner's column — all as **siblings within the same `.gen` flex row**, not nested inside the owner's column.
- Each sibling's rendered column is just its `Couple` (no `AddParentSlot` / no further sibling flap for that sibling in this pass — clicking into that sibling's own profile and using "Center tree here" is the existing path to explore *their* ancestry/siblings further).
- `.gen` is already `display: flex; align-items: flex-start`, so laying siblings out as adjacent columns in the same row naturally puts them at the same height as the person they belong to — no new CSS needed beyond removing the old `.sibling-list` vertical nesting.
- The flap toggle itself (`SiblingFlap`, its position under the `Couple`, independent person-side/spouse-side state via `openFlaps`) is unchanged — only where the expanded content renders changes: sideways in the row, not downward in the column.
- **Scope:** `SiblingFlap` is only used in ancestor rows today (not in `DescendantBranch`, which has no sibling UI). This fix stays scoped to ancestor rows — no new sibling UI is added to descendant rows.

### Testing

- `PersonProfile.test.tsx`: add a test asserting the close button calls `onClose`.
- `TreeView.test.tsx`: update/add a test asserting an expanded sibling renders as a row-adjacent column (e.g. assert it and the owner share a common `.gen` parent rather than the sibling being nested under the owner's `.gen-column`).

### Non-goals

- No changes to which people count as "siblings" (`getSiblingIds` / `familyGraph.ts` logic is untouched).
- No changes to focus mode, collapse toggles, or descendant-branch rendering.
