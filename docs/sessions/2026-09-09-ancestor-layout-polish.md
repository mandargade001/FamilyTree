# Session log: ancestor layout polish

## Brainstorm + design doc

**Asked:** Address three parked findings from the precise-ancestor-layout
final review (2026-09-08): a residual small vertical gap under ancestor-grid
connectors even on the correctly-positioned side; `personId`-keying being
unsafe under a rare pedigree collapse (cousin marriage / a shared ancestor
reachable via two lineages, which silently drops a real ancestor); and
sibling-flap mode not composing with the precise grid-rendering mode
(opening any flap anywhere falls back to the old flex rendering).

**What was done:** Ran the brainstorming skill to scope and bundle the three
findings into one design doc, since they're all localized to the same
ancestor-rendering area (`familyGraph.ts`, `ancestorLayout.ts`,
`TreeView.tsx`, `global.css`). Confirmed with the user that flap/grid
composition would be scoped to depth 0 only (the focal couple's own
siblings), matching the original precise-ancestor-layout design doc's stated
integration point — full composition at every depth deferred as a
non-goal.

**Outcome:** Committed as `7e5f64d` — "Add design doc for ancestor layout
polish (3 bundled fixes)". File added:
`docs/superpowers/specs/2026-09-09-ancestor-layout-polish-design.md`.

## Implementation plan

**Asked:** Turn the design doc into an executable 4-task implementation
plan.

**What was done:** Wrote `docs/superpowers/plans/2026-09-09-ancestor-layout-polish.md`,
a 4-task plan: Task 1 (CSS connector-gap fix), Task 2 (pedigree-collapse
dropped-ancestor bug fix plus a new stable `AncestorUnit.id` field), Task 3
(rekey `ancestorLayout.ts`'s span map and `TreeView.tsx`'s React keys from
`personId` to `id`), Task 4 (depth-0 flap/grid composition). Each task step
specified exact before/after code, RED/GREEN test sequencing, and commit
messages, per this project's standing subagent-driven-development practice.

**Outcome:** Committed as `27acf1f` — "Add implementation plan for ancestor
layout polish".

## Task 1: Fix connector-gap CSS

**Asked:** Fix the residual vertical gap under `.ancestor-grid-item`s'
connectors — `.ancestor-grid-item` had no `align-self` set, so it defaulted
to `stretch`, filling its row track's full height; a shorter column
top-aligned within that stretched track (flex-column default), leaving
empty space at the bottom before its connector.

**What was done:** Changed `.ancestor-grid-item` in `global.css` from
`justify-self: center;` to `justify-self: center; align-self: end;`, so
every column's content bottom-aligns to its row track regardless of
row-height variance from taller neighbors. Verified via a throwaway
Playwright harness (rendered outside the repo, screenshotted, measured the
gap between a column's bottom edge and its connector's top edge for both a
taller and a shorter column, before/after) — confirmed both flush at 0px
after the fix; harness files deleted, nothing committed from that step.

This task went through three additional verification-only rounds after
the initial commit (re-confirming the harness measurements and checking for
any regressions the CSS change might have introduced elsewhere in the
ancestor grid), with no further code changes required.

**Outcome:** Committed as `b19a250` — "Fix residual gap under ancestor-grid
connectors". File changed: `client/src/styles/global.css`.

## Task 2: Fix dropped-ancestor bug and add stable occurrence id

**Asked:** Fix `buildAncestorRows`' `seenParentIds` dedup set being scoped
per depth (shared across every person processed at that depth) instead of
per person — which silently drops a real ancestor when two different people
at the same depth share one ancestor via independent lineages (pedigree
collapse / cousin marriage), and add a stable `id` field to `AncestorUnit`
since the fix legitimately produces two units sharing one `personId`.

**What was done:** Wrote failing regression tests first (a shared-grandparent-
reachable-via-two-lineages case, and a same-person's-own-two-parents-still-
merge-into-one-unit regression guard) in `familyGraph.test.ts`, confirmed
RED, then moved `const seenParentIds = new Set<string>()` inside the
`for (const id of currentIds)` loop in `buildAncestorRows` (`familyGraph.ts`)
so it resets per person instead of per depth. Confirmed GREEN. Added
`id: string` to the `AncestorUnit` interface, computed as
`` `${depth}:${childId ?? 'root'}:${personId}` `` (unique per occurrence by
construction), updated the depth-0 seed and the loop's `units.push(...)` to
set it, and updated the file's 3 pre-existing `toEqual` assertions that
compare whole unit objects to include the new field.

**Outcome:** Committed as `432f626` — "Fix pedigree-collapse bug that
silently dropped a shared ancestor". Files changed: `client/src/lib/familyGraph.ts`,
`client/src/lib/familyGraph.test.ts`.

## Task 3: Rekey layout map and React keys from `personId` to `id`

**Asked:** Rekey `ancestorLayout.ts`'s `requiredWidth`/`spans` maps and
`TreeView.tsx`'s three ancestor-row React keys from `unit.personId` to
`unit.id`, since Task 2 now legitimately produces two `AncestorUnit`s
sharing a `personId` — under the old keying, a second unit with the same
`personId` silently overwrote the first's map entry / collided in React's
reconciler.

**What was done:** Added `id: '<personId>'` fixtures to `ancestorLayout.test.ts`'s
7 pre-existing hand-built unit literals to keep the file compiling under the
new required field, confirmed all still passed (pure compile-fix, no
behavior change). Wrote a failing test asserting two units sharing a
`personId` get distinct, non-overlapping spans; confirmed RED; rekeyed every
`requiredWidth`/`spans` get/set call in `ancestorLayout.ts` from
`unit.personId`/`u.personId` to `unit.id`/`u.id` (leaving `unitByChildId` and
`sumWidth`'s per-side lookups alone, since those intentionally key by
`childId`, which is supposed to allow duplicates); confirmed GREEN. Wrote a
failing `TreeView.test.tsx` test for the same collision on the rendering
side (a "pedigree collapse" cousin fixture where a shared grandparent should
render twice); confirmed RED; rekeyed the three `key={...}` props in
`TreeView.tsx`'s ancestor-grid rendering from `unit.personId` to `unit.id`;
confirmed GREEN. While doing this, discovered and fixed a fourth call site
not listed in the brief — `renderAncestorGrid`'s `spans.get(unit.personId)`
lookup for the focal-children connector — required for ANY ancestor
rendering to work once the span map is keyed by `id` (verified: 37/41
TreeView tests failed without this fix).

A follow-up round strengthened the pedigree-collapse regression test:
`getAllByText('Grandma').length === 2` passed both before and after the
rekey, because React doesn't drop DOM elements for a colliding key on a
fresh mount, only warns via `console.error`. Added a `console.error` spy
assertion, verified empirically (by reverting the React keys back to
`personId` while keeping the span-lookup fix) that the spy assertion alone
catches the reintroduced collision ("Encountered two children with the same
key...") where the text-count assertion would not.

**Outcome:** Committed as `fc33e63` — "Rekey ancestor layout spans and React
keys from personId to id" and `9e93116` — "Assert on console.error, not just
text count, in pedigree-collapse test". Files changed:
`client/src/lib/ancestorLayout.ts`, `client/src/lib/ancestorLayout.test.ts`,
`client/src/components/tree/TreeView.tsx`, `client/src/components/tree/TreeView.test.tsx`.

## Task 4: Compose depth-0 sibling flap with grid rendering

**Asked:** Make opening the focal couple's own (depth-0) sibling flap stay
on the precise grid rendering instead of falling back to the old flex
rendering — grid mode should append trailing columns for the revealed
depth-0 siblings, positioned after the couple's own columns. A flap opened
at any deeper generation should still fall back to flex, unchanged.

**What was done:** Wrote failing tests (depth-0 flap stays on grid with
sibling columns present; a deeper-generation flap still falls back to flex)
in `TreeView.test.tsx`; confirmed the first RED (the old branch condition,
`openFlaps.size === 0`, treated any open flap as a reason to fall back).
Computed the depth-0 root unit and a `hasDeepFlapOpen` check (true only if
some open flap belongs to a unit other than the root/its spouse) in the main
component body, and changed the render branch to
`hasDeepFlapOpen ? renderFlexAncestorRows() : renderAncestorGrid()`.
Extended `renderAncestorGrid` to append trailing grid columns, positioned
after the highest column index already in use, for any revealed depth-0
sibling (person-side siblings first, then spouse-side) via the existing
`renderSiblingColumn` helper — with no connector row, matching the
established rule that revealed siblings have no ancestor lineage of their
own drawn above them. Confirmed GREEN. Fixed the `renderAncestorGrid`
trailing block's own `spans.get(rootRow.units[0].personId)` lookup (a fifth
call site the Task 3 diff list had missed) to `.id`. Updated two
pre-existing tests whose assertions encoded the old "any open flap forces
flex" behavior against Meera's own depth-0 flap.

**Outcome:** Committed as `0115aa1` — "Compose depth-0 sibling flap with
grid-precision rendering". Files changed:
`client/src/components/tree/TreeView.tsx`, `client/src/components/tree/TreeView.test.tsx`.

## Task 4 review follow-up: fix stale flap-open state in grid mode

**Asked:** Task-4 review (on the precise-ancestor-layout / ancestor-layout-
polish work) found one Important finding: after making depth-0 sibling flaps
reachable in grid mode, `renderAncestorGrid` still hardcoded
`flapsInteractive: false` for every unit, so the flap the user just opened
never showed the `open` class or "Hide siblings" aria-label (functionally
still worked, toggling included). Also flagged two stale comments describing
the old "grid only renders when openFlaps is empty" invariant. Asked to fix,
add a covering test with RED/GREEN evidence, and append a fix report to the
task-4 report file.

**What was done:**
- `client/src/components/tree/TreeView.tsx`: in `renderAncestorGrid`'s
  per-unit loop, changed `renderCoupleColumn(unit, person, spouse, { seam:
  false, flapsInteractive: false })` to pass `flapsInteractive: unit.id ===
  rootUnit?.id` — only the depth-0/root unit can have an open flap while
  still in grid mode (an open flap on any other unit forces the flex
  fallback), so it's the only one that needs its `SiblingFlap` to reflect
  real `openFlaps` state.
- Updated the two stale comments (above `renderCoupleColumn` and above
  `renderAncestorGrid`) to describe the actual current behavior: grid mode
  renders whenever no *deep* (above-depth-0) flap is open, and a depth-0
  flap stays on grid with siblings appended as trailing columns.
- Added a test in `TreeView.test.tsx` (`opening the focal couples own
  sibling flap in grid mode shows the flap itself as open`) asserting the
  clicked flap button gets the `open` class and `"Hide siblings"` aria-label.
  Confirmed RED by temporarily reverting the fix line (assertion failed:
  `Received: sibling-bubble`), then GREEN after restoring it.
- Full suite verified: 19 test files, 189 tests passing; `npx tsc --noEmit`
  clean.
- Appended a fix report section to
  `.superpowers/sdd/2026-09-09-ancestor-layout-polish/task-4-report.md`
  (gitignored, not committed).

**Outcome:** Committed as `ba01513` — "Fix stale sibling-flap open state in
grid mode" (2 files changed: `TreeView.tsx`, `TreeView.test.tsx`). Nothing
left open from this finding.

## Final whole-branch review: fix all findings (3 Important, 5 Minor)

**Asked:** Fix every finding from the final whole-branch review of the
completed 4-task plan, in one pass (no second fix wave): (Important 1)
grid-mode revealed siblings (Task 4) lost the family-cluster
grouping/labeling that the flex path already has; (Important 2) the
Task-1 `align-self: end` fix and Task-4 sibling columns misalign
vertically — the sibling-flap-reserve spacer logic was backwards for the
grid path's bottom-alignment; (Important 3) the session log was missing
entries for everything except the Task-4 review-fix commit; plus 5 Minor
findings (a dead OR-across-both-owners guard in `appendSiblingColumns`, a
stale comment in `ancestorLayout.ts`, a stale comment above
`renderFlexAncestorRows`, a `console.warn` still logging `personId` instead
of `id`, and inconsistent `'0:root:' + focalId` string-concat vs. the
loop's template-literal id format).

**What was done:**
- **Important 1** — in `renderAncestorGrid` (`TreeView.tsx`), gathered
  revealed depth-0 siblings up front (via a `collect(ownerId)` helper,
  replacing the old dead per-sibling `openFlaps.has(...)` guard) so each
  sibling's `clusterLabel(sibling, sibSpouse)` is known before rendering.
  Each sibling with a non-null label now renders boxed (`family-cluster
  ancestor-grid-item` + `.family-cluster-label`) — individually, not merged
  with adjacent same-label siblings (a deliberately simpler scope than the
  flex path's `groupSegmentsIntoClusters` merge, since siblings already
  render as separate trailing columns). The depth-0 couple's own column now
  also gets boxed, but only when warranted — mirroring
  `renderFlexAncestorRows`' `shouldGroup` rule (2+ distinct surnames among
  the couple and its revealed siblings); a lone couple with no siblings
  revealed, or siblings all sharing the couple's own surname, stays unboxed,
  matching the flex path. Added two tests: one asserting a revealed sibling
  with a determinable surname renders inside a labeled `.family-cluster`,
  another asserting the couple's own column also gets boxed once a sibling
  has a *different* surname.
- **Important 2** — added a `bottomReserve` parameter to
  `renderSiblingColumn` (default `false`, only passed `true` from the grid
  path), rendering a new `.sibling-flap-reserve` (`min-height: 32px`,
  matching a `.sibling-bubble`'s 24px plus `.gen-column`'s `--space-sm`
  8px gap) spacer after the sibling's `Couple`. Left `reserveTopSlot`
  untouched for the flex path (still a no-op if ever passed under
  bottom-alignment, since the grid call site never sets it). Documented the
  reasoning in comments on both `renderSiblingColumn` and the new CSS rule.
  Real in-browser Playwright measurement wasn't performed in this pass (no
  live Supabase-backed app in this environment, matching prior sessions'
  documented limitation); the 32px value is the finding's own suggested
  estimate, derived directly from the `.sibling-bubble`/`--space-sm` tokens
  rather than guessed — flagged as a judgment call in the fix report.
- **Important 3** — this file: renamed/rewrote
  `2026-09-09-ancestor-layout-polish-review-fix.md` into this consolidated
  `2026-09-09-ancestor-layout-polish.md`, prepending entries for the
  brainstorm/spec, plan, Tasks 1–4, and the Task-4 review-fix (all
  reconstructed from commit messages and file diffs, since no session log
  existed for them at the time).
- **Minor findings** — removed the dead `appendSiblingColumns` internal
  guard (superseded by the `collect(ownerId)` restructuring above, which
  gates on each owner's own flap individually rather than an OR across
  both); fixed the stale `ancestorLayout.ts` Pass-1 comment ("keyed by
  unit.personId" → "keyed by unit.id"); updated the stale
  `renderFlexAncestorRows` comment to describe the actual current
  depth-gated condition; changed `console.warn('ancestor unit missing
  computed span, skipping render', unit.personId)` to log `unit.id`;
  changed `familyGraph.ts`'s depth-0 seed from `'0:root:' + focalId` to the
  template literal `` `0:root:${focalId}` ``, matching the loop's format.
- Ran the full test suite (`npx vitest run`) and `npx tsc --noEmit` after
  all changes: 19 files, 193 tests passing, `tsc` clean.

**Outcome:** Files changed: `client/src/components/tree/TreeView.tsx`,
`client/src/components/tree/TreeView.test.tsx`,
`client/src/styles/global.css`, `client/src/lib/familyGraph.ts`,
`client/src/lib/ancestorLayout.ts`, plus this session-log file (renamed from
`2026-09-09-ancestor-layout-polish-review-fix.md`). Full detail in
`.superpowers/sdd/2026-09-09-ancestor-layout-polish/final-review-fix-report.md`.
Commit SHA(s): recorded once this fix wave is committed.
