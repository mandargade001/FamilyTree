# Precise ancestor layout — design

This is the "Spec 5" precise-line-routing work explicitly deferred during the tree-legibility-fixes spec (2026-09-08), picked back up after a concrete complaint made it clear the deferral had a real cost: with today's layout, when a couple's parents are added, the two sides' ancestor columns render centered as a group with no positional or connective guarantee they sit above the specific person they belong to. The user's own description of the desired result: "Mangal's parents should be connected to Mangal only end-to-end, no gaps in between, and the parents should be on the left side from the center implying that the parents are of Mangal — and have free space above Kishan for adding his parents."

## Scope

Ancestors only. Descendants (a couple's children fanning out below them) don't have the same ownership ambiguity — a child belongs to *both* people in a couple jointly, so there's nothing to disambiguate by position; only ancestors split into two genuinely distinct lineages sharing one row.

## Problem, precisely

`TreeView.tsx` renders each ancestor row (`buildAncestorRows`'s output) as a plain CSS flex row (`.gen { display: flex; justify-content: center; }`), independently of every other row. Nothing ties a unit's horizontal position to which specific person, one row below, it's the parent-pair of. Two ancestor units in the same row (e.g. Mangal's parents and Kishan's parents) end up centered as a group with no guaranteed relationship to Mangal's and Kishan's own positions in the row below — today's positioning is coincidental (it happens to often look roughly right because of render order), not guaranteed, and there's no visual line connecting a specific parent-pair to a specific child at all (the current `SeamLine` is a single unconditional vertical dash per column, not a real connector).

## Design

### 1. Data model: track which child each unit belongs to

`familyGraph.ts`'s `AncestorUnit` gains a `childId: string` field — the specific person (`personId` or `spouseId` from the row below) whose parents this unit represents. `buildAncestorRows`'s existing loop already has this value locally (it's the `id` it just called `getParentIds(id, relationships)` on) — a one-line addition to the object literal it already constructs, no change to the loop's structure or the rows it already discovers.

### 2. Layout algorithm: a pure, two-pass column-span computation

A new pure function, `computeAncestorLayout(rows: AncestorRow[]): Map<string, ColumnSpan>` (keyed by unit's `personId`, since that's already unique per unit within the tree — `ColumnSpan = { start: number; end: number }`, half-open, in grid-column units):

- **Pass 1 (bottom-up, deepest row to depth 0):** each unit's required width starts at 2 (room for both members of a couple; 1 if no recorded spouse). If a unit's own parents are present in the next-deeper row (found via `childId` matching this unit's `personId` or `spouseId`), its required width becomes the sum of its parents' required widths instead — a lineage's footprint never shrinks going further back, only grows or stays flat.
- **Pass 2 (top-down, depth 0 to deepest row):** depth 0 is fixed at columns `[0, 2)` (or `[0, 1)` solo). For every other unit, its span is centered over the single column its `childId` occupies in the row below, using the width Pass 1 computed for it; siblings in the same row (multiple units whose `childId`s are different but adjacent) get their spans pushed apart left/right so computed spans never overlap.

This function takes only data already available from `buildAncestorRows` — no DOM measurement, no refs, no ResizeObserver. It's independently unit-testable: given a rows structure, assert the exact column spans produced.

### 3. Rendering: one shared CSS Grid across all ancestor rows

Instead of each `.gen` row being its own independent flex container, the whole ancestor section becomes one CSS Grid (rows stacked as grid rows, columns shared across all of them). Each unit's `.gen-column` (and each member of a couple, if columns need to render at single-person granularity — see open question in the plan) gets its `grid-column` set from `computeAncestorLayout`'s output. Because all rows share the same column tracks, alignment between a parent unit and its specific child is guaranteed by the grid itself, not by coincidental centering.

### 4. Connecting lines: reuse the existing dashed-seam visual language, positioned correctly

The current unconditional per-column `SeamLine` is replaced with a connector drawn from a unit's own span down to the single column its `childId` occupies — a continuous line (no gaps), visually distinguishing "these are Mangal's parents" from "this free space is where Kishan's parents would go." Kept in the established Family Quilt dashed-seam style (`DESIGN.md`), not a new visual language — this is a positioning fix, not a redesign.

### 5. Known integration points (left for the implementation plan to resolve concretely, not fully specified here)

- **Revealed sibling columns** (existing feature, toggled via `SiblingFlap`): these occupy additional leaf-width slots at the base (depth 0) row but have no ancestor lineage of their own drawn above them — their parents are already the same ones shown for the focal couple. The layout algorithm's depth-0 base width needs to account for however many sibling columns are currently revealed, without those columns having (or needing) any `childId`-driven span above them.
- **Family-cluster boxes** (shipped 2026-09-08, the cluster-boundary-fix spec): these wrap contiguous same-surname columns in a bordered box. They need to keep working without breaking the shared grid — the likely mechanism is `display: contents` on the cluster wrapper div so its children remain direct grid items individually positioned, with the box itself drawn via an absolutely-positioned decoration spanning the same range, but the exact CSS approach is an implementation detail for the plan, not fixed here.

### Non-goals

- Descendant-row positioning — explicitly out of scope (see Scope section).
- Horizontal scroll, zoom, or pan affordances for a tree that grows wide once real per-branch spacing is enforced (rather than loose flex-centering, which could visually "get away with" overlap-adjacent crowding). This is a real, honestly-flagged consequence worth a follow-up look given PRODUCT.md's older/less-technical-user audience, not solved by this spec.
- Any layout change beyond whatever ancestor depth is currently expanded (`maxAncestorDepth`) — the algorithm recomputes on every expand/collapse, but doesn't pre-compute or cache layout for rows not currently rendered.

### Testing

- `computeAncestorLayout`: pure-function unit tests — a simple one-generation-visible tree (depth 0 + depth 1 only) produces the expected two side-by-side spans; a tree where only one side has recorded parents leaves free space on the other; a three-generation chain (one side's own grandparents also recorded) produces a wider span for that side, pushing the sibling side further from center; overlapping spans never occur regardless of asymmetric depth between the two sides.
- Rendering: asserting the correct `grid-column` (or equivalent) value lands on the correct DOM element, given a known layout-algorithm output.
- Manual browser verification (per this project's standing UI-change practice) before considering this done — pixel-level correctness isn't verifiable from jsdom alone.
