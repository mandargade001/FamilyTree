# 2026-09-09 — Ancestor layout polish: review follow-up fix

## Request

Task-4 review (on the precise-ancestor-layout / ancestor-layout-polish work) found one Important finding: after making depth-0 sibling flaps reachable in grid mode, `renderAncestorGrid` still hardcoded `flapsInteractive: false` for every unit, so the flap the user just opened never showed the `open` class or "Hide siblings" aria-label (functionally still worked, toggling included). Also flagged two stale comments describing the old "grid only renders when openFlaps is empty" invariant. Asked to fix, add a covering test with RED/GREEN evidence, and append a fix report to the task-4 report file.

## What was done

- `client/src/components/tree/TreeView.tsx`: in `renderAncestorGrid`'s per-unit loop, changed `renderCoupleColumn(unit, person, spouse, { seam: false, flapsInteractive: false })` to pass `flapsInteractive: unit.id === rootUnit?.id` — only the depth-0/root unit can have an open flap while still in grid mode (an open flap on any other unit forces the flex fallback), so it's the only one that needs its `SiblingFlap` to reflect real `openFlaps` state.
- Updated the two stale comments (above `renderCoupleColumn` and above `renderAncestorGrid`) to describe the actual current behavior: grid mode renders whenever no *deep* (above-depth-0) flap is open, and a depth-0 flap stays on grid with siblings appended as trailing columns.
- Added a test in `TreeView.test.tsx` (`opening the focal couples own sibling flap in grid mode shows the flap itself as open`) asserting the clicked flap button gets the `open` class and `"Hide siblings"` aria-label. Confirmed RED by temporarily reverting the fix line (assertion failed: `Received: sibling-bubble`), then GREEN after restoring it.
- Full suite verified: 19 test files, 189 tests passing; `npx tsc --noEmit` clean.
- Appended a fix report section to `.superpowers/sdd/2026-09-09-ancestor-layout-polish/task-4-report.md` (gitignored, not committed).

## Outcome

Committed as `ba01513` — "Fix stale sibling-flap open state in grid mode" (2 files changed: `TreeView.tsx`, `TreeView.test.tsx`). Nothing left open from this finding.
