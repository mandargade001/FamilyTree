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
