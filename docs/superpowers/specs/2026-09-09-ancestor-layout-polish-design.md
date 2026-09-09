# Ancestor layout polish — design

Three parked findings from the precise-ancestor-layout final review (2026-09-08), bundled into one spec since they're all localized to the same ancestor-rendering area (`client/src/lib/familyGraph.ts`, `client/src/lib/ancestorLayout.ts`, `client/src/components/tree/TreeView.tsx`, `client/src/styles/global.css`).

## Scope

1. Residual small vertical gap under connectors, even on the correctly-positioned side.
2. `personId`-keying unsafe under rare pedigree collapse (cousin marriage / a shared ancestor reachable via two lineages).
3. Sibling-flap mode not composed with grid-precision mode — opening any flap anywhere falls back to the old flex rendering, losing precise layout.

## Fix 1 — connector gap

`.ancestor-grid-item` (`global.css`) has no `align-self` set, so it defaults to `stretch`: it fills the full height of its grid row track. Row track height is set by the tallest column occupying that row (e.g. a sibling column whose couple has a visible Add-Parent slot row makes the whole row taller). A shorter column's content top-aligns within its stretched track (flex-column default `flex-start` inside `.gen-column`), leaving empty space at the *bottom* of that column before its connector row begins.

**Fix:** add `align-self: end` to `.ancestor-grid-item`, so every column's content bottom-aligns to its row track regardless of row-height variance introduced by taller neighbors. The connector then attaches flush with no gap.

## Fix 2 — pedigree collapse

### Root cause

`buildAncestorRows` (`familyGraph.ts`) declares `seenParentIds` once per depth, shared across every `id` processed at that depth:

```ts
while (currentIds.length > 0) {
  depth += 1
  const seenParentIds = new Set<string>()   // <-- scoped per depth, not per id
  const units: AncestorUnit[] = []

  for (const id of currentIds) {
    for (const parentId of getParentIds(id, relationships)) {
      if (seenParentIds.has(parentId)) continue
      ...
```

The set's real purpose is to merge one person's *own* two parent relationships (father, mother) into a single couple-unit instead of two units — it needs to dedup only within one `id`'s own parent list. Because it's shared across the whole depth's loop instead, if two *different* people at the same depth (e.g. cousins personA and personB) share one ancestor X — a pedigree collapse — X gets recorded as personA's parent, then the check silently **drops** X entirely when personB's parent search reaches it. personB's branch renders with a missing parent, not merely a misrendered one: real data goes missing from the view.

**Fix:** move `const seenParentIds = new Set<string>()` inside the `for (const id of currentIds)` loop, so it resets per `id`. This still merges one person's two parents into one unit (the original intent), but no longer suppresses a shared ancestor across two different people's independent lineages.

### Consequence: same personId, two units

After the fix, a pedigree-collapse case legitimately produces two `AncestorUnit`s with the same `personId` (personA's unit for X, and personB's unit for X), at the same or different depths, distinguished only by `childId`. This is the same shape of case the 2026-09-08 final review already fixed on the *lookup* side (`computeAncestorLayout`'s `sumWidth`, `unitByChildId`) for the "two co-parents without a spouse edge" bug — but the *keying* side was never made safe for it:

- `ancestorLayout.ts`: `requiredWidth` and `spans` are `Map<string, ...>` keyed by `unit.personId`. A second unit with the same `personId` silently overwrites the first's entry.
- `TreeView.tsx`: React `key={unit.personId}` (and `key={\`content-${unit.personId}\`}`, `key={\`connector-${unit.personId}\`}`) collide the same way, and React would only render one of the two.

**Fix:** add a stable, unique-per-occurrence `id: string` field to `AncestorUnit`, computed in `buildAncestorRows` as `` `${depth}:${childId ?? 'root'}:${personId}` `` — unique by construction, since within one depth a given `(childId, personId)` pair can occur at most once. Re-key `requiredWidth`, `spans` (in `ancestorLayout.ts`), and every React `key` currently using `unit.personId` (in `TreeView.tsx`) to use `unit.id` instead. Lookups that intentionally match *by* `personId` (e.g. `unitByChildId`'s childId-based grouping, `sumWidth`'s per-side lookup) are unaffected — they already key by `childId`/match by the field that's supposed to allow duplicates.

## Fix 3 — flap composes with grid (depth 0 only)

Scope decision (confirmed): `SiblingFlap` can open at any ancestor depth today (`renderCoupleColumn` wires it per-unit, not depth-gated), but full composition at every depth is out of scope for this spec — matches the original precise-ancestor-layout design doc's stated integration point, which only described depth-0 (the focal couple's own siblings). Opening a flap at depth > 0 keeps falling back to `renderFlexAncestorRows`.

**Branch condition change** (`TreeView.tsx`, main render body): replace `openFlaps.size === 0 ? renderAncestorGrid() : renderFlexAncestorRows()` with a check that only falls back to flex if some *open* flap belongs to a depth > 0 unit. A depth-0-only set of open flaps (or none) stays on `renderAncestorGrid`.

**`renderAncestorGrid` changes:** when the depth-0 row's unit has one or more revealed siblings (via `openFlaps`), append trailing grid columns for those sibling columns, positioned after the depth-0 unit's own person/spouse columns (same left-to-right order `renderFlexAncestorRows`'s `addSiblingSegments` already uses: person's siblings, then spouse's siblings). These sibling columns:
- Get no connector row (matches the established rule: revealed siblings have no ancestor lineage of their own drawn above them).
- Don't affect any span computed by `computeAncestorLayout` — ancestor spans above the depth-0 row are derived from the root's own `[0, requiredWidth)` span, computed independently of trailing sibling columns appended after it, so ancestors already positioned above the focal person/spouse stay correctly aligned.
- Render via the existing `renderSiblingColumn` helper (already used by the flex path), unchanged.

## Testing

- `ancestorLayout.test.ts`: a two-units-same-`personId` case (cousin marriage via two lineages at the same depth) asserts both units get distinct, non-overlapping spans.
- `familyGraph.test.ts`: a shared-grandparent-reachable-via-two-different-children case asserts neither lineage drops the shared parent (regression test for the dropped-ancestor bug, not just a duplicate-key case).
- `TreeView.test.tsx`:
  - depth-0 flap open renders `renderAncestorGrid` (not flex fallback), sibling columns present.
  - depth > 0 flap open still falls back to `renderFlexAncestorRows`, unchanged.
  - connector gap fix isn't meaningfully assertable from jsdom (a CSS geometry issue) — verified manually in-browser instead, per this project's standing UI-change practice.

## Non-goals

- Full flap/grid composition at depth > 0 — explicitly deferred, not solved here.
- Any change to `renderFlexAncestorRows` itself — it's the existing, correct fallback and stays untouched.
- Any new visual language for connectors or sibling columns — reuses what's already shipped.
