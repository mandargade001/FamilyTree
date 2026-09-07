# 2026-09-07 — Guided relationship flow (sibling picker)

## Task 3: Sibling as a fourth relationship-picker type

**Asked:** Implement Task 3 of the guided-relationship-flow plan — add a fourth "Sibling" `PickKind` button to `RelationshipPicker`, disabled with a caption when the anchor person has no recorded parents, per `.superpowers/sdd/2026-09-07-guided-relationship-flow/task-3-brief.md`.

**Done:**
- Widened `PickKind` to include `'sibling'`; added required `relationships: Relationship[]` prop to `RelationshipPickerProps`; used `getParentIds` from `familyGraph.ts` to compute `anchorHasParents` and gate the Sibling option.
- Updated all 7 existing `render()` calls in `RelationshipPicker.test.tsx` with `relationships={[]}`; added the 2 new tests from the brief.
- Added `.rel-type.disabled` CSS rule.
- **Deviation 1:** the brief's own Step 4 sample code (gating `setType` on `disabled`) is inconsistent with its own Step 2 test (expects zero `onLinkExisting` calls when Sibling is disabled and a result is clicked) — traced this empirically, then moved the gate to the action handlers (`onLinkExisting`/`onCreateNew`) instead of `setType`, so selecting "Sibling" while disabled is allowed visually but no action fires.
- **Deviation 2:** had to add `relationships={relationships}` to the `<RelationshipPicker>` call site in `App.tsx`, even though the task brief said Task 3 shouldn't touch `App.tsx` (deferred to Task 5). Reason: making `relationships` required broke the existing untouched call site at runtime (`getParentIds` called `.filter` on `undefined`), crashing 7 tests in `App.test.tsx`. Confirmed via `git stash` that the base commit's suite was clean before this change. Fix was a single line, pure prop pass-through — no sibling-specific logic added to `App.tsx`, leaving Task 5's actual work untouched.
- Both deviations were checked with the advisor before applying.

**Outcome:** Full suite green: 14 files / 112 tests (110 pre-existing + 2 new). `npx tsc --noEmit` clean. Files touched: `client/src/components/picker/RelationshipPicker.tsx`, `client/src/components/picker/RelationshipPicker.test.tsx`, `client/src/styles/global.css`, `client/src/App.tsx`. Full report at `.superpowers/sdd/2026-09-07-guided-relationship-flow/task-3-report.md`. Committed.
