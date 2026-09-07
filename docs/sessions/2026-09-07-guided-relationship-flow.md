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

## Final review fix wave: retry-safe sibling linking, honest nudge test

**Asked:** Apply the two Important findings from the final whole-branch code review before merge: (1) `App.test.tsx`'s second-parent-nudge test mocked a gender for a newly-created person, a state `addPerson` (which always sends `gender: null`) can never actually produce; (2) the sibling-linking loop in `handleLinkExisting` had no failure tolerance, so a retry after a partial failure would hit the now-duplicate first edge and throw before reaching the remaining parent(s), leaving the sibling permanently half-linked.

**Done:**
- **Finding 1 (test only, no App.tsx logic change needed):** split the single fictional test into two, each reflecting a real, reachable code path:
  - `'linking an existing gendered person as a parent reopens the picker with a role-specific nudge'` — seeds `fetchPeople` with a second person (`anna`, `gender: 'Female'`) already in the system, links her via the picker's "Search existing people…" result row (not "Create new"), and asserts the role-specific `'Add Father for Meera?'` heading.
  - `'adding a first parent via "Create new person" reopens the picker with the generic nudge (their gender is unknown); adding a second returns to the profile'` — keeps the original "Create new person" flow but now mocks the created person with `gender: null` (matching what `addPerson` actually sends), and asserts the **generic** `'Add another parent for Meera?'` heading instead of a role-specific one. Also retained the second-parent-add-returns-to-profile assertion from the original test in this one, since that behavior is real regardless of which path added the first parent.
- **Finding 2 (`client/src/App.tsx`, sibling branch of `handleLinkExisting`, ~line 168):** wrapped each `addRelationship('parent-child', parentId, otherId)` call in the sibling-linking loop in try/catch, swallowing only errors whose message includes `relationships_unique_edge` (the duplicate-edge conflict) and rethrowing everything else. This lets a retry of "Add sibling" skip over an already-linked parent and reach the next one, instead of aborting on the first duplicate-key error.
- Added a new test, `'retrying a sibling add after a partial failure completes the remaining parent link instead of getting stuck'`: anchor has two recorded parents; `addRelationship` is mocked to reject once (duplicate-edge error) on the first call then resolve normally; asserts both parent links are ultimately attempted and no error banner is shown.
- No design decisions deviated from the review's spec — both fixes and the test split match what was requested.

**Outcome:** `npx vitest run src/App.test.tsx`: 22/22 passed. Full suite (`npm test`): 118/118 passed (up from 116 pre-fix: +2 net from the 1→2 test split plus 1 new sibling-retry test). `npx tsc --noEmit`: clean, no errors. Files touched: `client/src/App.tsx`, `client/src/App.test.tsx`. Committed as `3cd765c` — "Fix code review findings: retry-safe sibling linking, honest nudge test". Full report at `.superpowers/sdd/2026-09-07-guided-relationship-flow/final-fix-report.md`.
