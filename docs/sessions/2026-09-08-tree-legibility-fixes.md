# 2026-09-08 — Tree legibility fixes: family-cluster review finding

## Task 5 review fix: `showCluster` false-positive on collapsed siblings

**Asked:** Fix a review finding on Task 5 (family-cluster visual grouping,
`client/src/components/tree/TreeView.tsx`, commit `0d600af`): `showCluster`
was computed as `row.units.length > 1 || anyHasSiblings`, where
`anyHasSiblings` is true whenever siblings exist in the data at all — not
only when the sibling flap is open. This wrapped solo row units with
recorded-but-collapsed siblings in an unwanted dashed `.family-cluster` box.
This was a plan-authoring bug, not an implementer error.

**Done:** Replaced the `anyHasSiblings` term in `showCluster` with a new
`anySiblingsOpen = openFlaps.has(unit.personId) || (spouse ?
openFlaps.has(spouse.id) : false)`, so the cluster box now only appears when
there's actually something to group: multiple row units, or the unit's
siblings are currently expanded. `anyHasSiblings` itself was left in place —
it still correctly gates whether the `SiblingFlap` toggle controls render.

Checked `TreeView.test.tsx` for tests implicitly depending on the old buggy
behavior (cluster box appearing with siblings merely present in data, flap
collapsed). Found none — the existing test that opens the flap before
asserting `.family-cluster` presence continues to pass because siblings are
actually expanded at that point; the multiple-lineages cluster test is
unaffected (doesn't depend on sibling state). No test edits were needed.

**Outcome:** `client/src/components/tree/TreeView.tsx` changed (2 lines
added/changed). `npx vitest run src/components/tree/TreeView.test.tsx` — 27
passed. `npm test` — 140 passed across 17 files. `npx tsc --noEmit` — clean.
Fix report written to
`.superpowers/sdd/2026-09-08-tree-legibility-fixes/task-5-fix-report.md`.
Committed on branch `worktree-tree-legibility-fixes`.

## Final whole-branch review: 7 numbered fixes + cheap wins + test additions

**Asked:** Apply 7 independently-verified fixes from a final whole-branch
code review (not speculative), plus 3 small cheap wins and 2 test-coverage
gaps flagged by the review's triage. In priority order:
1. (Critical) `PersonPatch.tsx`'s bare `onClick`/`onDoubleClick` — a real
   double-click always fires `click` before `dblclick`, and a sibling
   patch's single-click now re-centers the whole tree, so an accidental
   double-click (common for this app's audience) blows away the current view
   before the intended "peek" (focus) ever happens.
2. `TreeView.tsx`'s reset-on-`focalId`-change effect didn't clear
   `focusedId`, leaving stale dimming/an "Exit focus" button after
   re-centering away from a focused state.
3. That same reset effect ran via `useEffect` (after paint), causing a
   visible flash of the old ancestor-depth/flap state before snapping to the
   reset state.
4. `DescendantBranch`'s parent-child `SeamLine` was a child of `<Couple>`
   (laid out sideways inside `.couple`'s horizontal flex row) and gated on
   having own children, when it should always render as a sibling of
   `<Couple>`.
5. The ancestor-row `SeamLine` rendered unconditionally (dangling below a
   childless focal person) and was positioned before the sibling-flap row
   instead of after it.
6. `App.tsx`'s new spouse co-parent link (`handleLinkExisting`, `'child'`
   branch) had no duplicate-edge try/catch guard, unlike the sibling branch's
   established pattern.
7. Sibling-column patches' `onOpen` called `onCenterOn` directly, bypassing
   `handleOpen`'s Focus Mode check — toggling Focus Mode did nothing on
   sibling patches.

Plus: remove a dead `.flap` selector term, tighten `.family-cluster`'s
`gap`, correct DESIGN.md's pill/circle description of the sibling-count
indicator, and extend/add tests for the reset effect and descendant seam
placement.

**Done:** Read all six named files fully before editing, per the task's
instructions, rather than trusting the review summary's prop-name
assumptions.

- Fix 1: added a `clickTimer` ref in `PersonPatch.tsx`; `handleClick` arms a
  250ms timer before calling `onOpen`, clearing any *existing* timer first;
  `handleDoubleClick` clears the timer and calls `onDoubleOpen` immediately.
  Caught a bug in the review's own suggested snippet: a real double-click
  fires `click` twice (not once) before `dblclick`, so without clearing the
  previous timer on each new click, the first click's timer survives the
  second click's overwrite and fires `onOpen` late even after a successful
  double-click — fixed by making it a proper single-timer debounce.
- Fix 2+3: added `setFocusedId(null)` to the reset effect and changed it
  from `useEffect` to `useLayoutEffect` (only that effect — the Escape-key
  listener effect was left untouched, per the task).
- Fix 4: moved the descendant `SeamLine` to be a sibling of `<Couple>`
  inside `DescendantBranch`'s own `.gen-column`, removed the
  `childIds.length > 0` gate (renders unconditionally).
- Fix 5: moved the ancestor-row `SeamLine` to render after `.couple-slots`
  (the sibling-flap row) instead of before it, and gated it with
  `(row.depth > 0 || focalChildren.length > 0)`. Verified the gate's
  assumption (depth-0 always has exactly one unit) against
  `familyGraph.ts`'s `buildAncestorRows` rather than just inferring it.
- Fix 6: wrapped the spouse co-parent `addRelationship` call in the same
  try/catch pattern (swallow only `relationships_unique_edge` duplicate-key
  errors) already used by the sibling branch a few lines below.
- Fix 7: added `handleSiblingOpen` (mirrors `handleOpen`'s Focus
  Mode/`focusOn` vs. normal-action shape, substituting `onCenterOn` for
  `onOpenProfile`) and wired the sibling column's `Couple` `onOpen` to it.
- Cheap wins: removed `.flap` from `handleBackgroundClick`'s exclusion
  selector (dead — replaced by `.sibling-bubble`, a `<button>`, already
  covered); changed `.family-cluster`'s `gap` from `var(--space-xxl)` (26px)
  to `var(--space-lg)` (16px); updated DESIGN.md to list the sibling-count
  bubble under Circles instead of Pills, matching the shipped `.sibling-bubble`
  (`border-radius: 50%`).
- Test updates: `PersonPatch.test.tsx` and `TreeView.test.tsx` — every test
  that fired a single `fireEvent.click` on a `.patch` and asserted
  synchronously needed `vi.useFakeTimers()` +
  `vi.advanceTimersByTimeAsync(250)` (wrapped in `act()` to silence act()
  warnings from the timer-driven state update) to account for the new
  debounce. Added a real `click, click, dblclick` sequence test (both files)
  proving the debounce survives a real double-click's two leading `click`
  events — the old `fireEvent.doubleClick`-only tests were false positives
  that never exercised this. Extended the reset-effect test to also assert
  `openFlaps` and `focusedId` are cleared. Rewrote the descendant-seam tests
  to assert DOM placement (seam is a parent-shared sibling of `.couple`, not
  nested inside it), not just presence, and renamed a test whose name and
  assertion contradicted each other. Added a new ancestor-seam test for the
  depth-0-childless-focal-person gating.

**Outcome:** `client/src/components/tree/PersonPatch.tsx`,
`client/src/components/tree/TreeView.tsx`, `client/src/App.tsx`,
`client/src/styles/global.css`, `DESIGN.md`,
`client/src/components/tree/PersonPatch.test.tsx`, and
`client/src/components/tree/TreeView.test.tsx` all changed.
`npx vitest run src/components/tree/TreeView.test.tsx` — 31 passed.
`npm test` — 145/145 passed across 17 files (up from 142). `npx tsc --noEmit`
— clean. Full fix report with per-fix detail and flagged concerns (the
timer-clearing subtlety in Fix 1; `useLayoutEffect` in Fix 3 is not
empirically distinguished from `useEffect` by any test since jsdom has no
paint step; Fixes 4/5 verified via CSS rules + DOM-structure tests, not an
actual rendered screenshot; Fix 6 has no dedicated new test, matching the
sibling branch's pre-existing test gap) written to
`.superpowers/sdd/2026-09-08-tree-legibility-fixes/final-fix-report.md`.
Committed on branch `worktree-tree-legibility-fixes`.
