# Tree legibility fixes — design

Spec 4 of the observations raised after using the app with real data (screenshot review, 2026-09-08). Scope: fix a real write-flow gap (spouse not auto-linked as co-parent), give siblings a proper way to explore their own branch, bound the tree's default depth so it stays legible as data grows, and add missing visual continuity between generations. Explicitly does **not** include precise per-branch connector-line routing — that's Spec 5, a separate, much larger piece of work (a real tree-layout algorithm + SVG rendering), sequenced after this one. It also does not include the earlier-discussed 3D model, which was explored and set aside in favor of fixing these concrete 2D problems first.

## Problems (each independently confirmed against the current code before designing a fix)

1. **Adding a child to one parent doesn't link the other parent.** `App.tsx`'s `handleLinkExisting`, `'child'` branch, only links the new child to the anchor person — never to the anchor's recorded spouse. Reported directly: children added under Mangal didn't automatically become Kishan's children too.
2. **A sibling's own children are invisible without knowing to re-center.** `TreeView.tsx`'s `renderSiblingColumns` renders only a sibling's own patch (deliberately, from an earlier spec) — their descendants never appear in that view. The only path to see them is opening the sibling's profile and clicking "Center tree here," which isn't discoverable and takes an extra step.
3. **Ancestors render with no depth limit; descendants already do.** `buildAncestorRows` returns every recorded generation up from the focal person, and `TreeView` renders all of them unconditionally — there's no collapse/expand for ancestors at all today, unlike descendants (which already correctly cap at the focal person's own children by default, with a per-branch toggle to reveal grandchildren). This asymmetry is why a grandparent generation with two unrelated lineages (paternal and maternal) both render fully expanded with no way to simplify the view.
4. **No visual distinction between two lineages sharing a row.** When an ancestor row contains multiple units (e.g. Mallikarjun's parents and Sarika's parents, at the same depth but unrelated to each other), they render identically styled, side by side, with nothing marking where one lineage ends and the other begins.
5. **No connecting line between generations at all.** `SeamLine` (`kind="parent-child"`) exists, is fully styled in `DESIGN.md`/`global.css`, and is documented as part of the design system — but is never actually rendered anywhere in `TreeView.tsx`. Only the horizontal spouse-line (`kind="spouse"`, used in `Couple.tsx`) is wired up. Generations currently sit in plain flex gaps with no visual link at all.

## Design

### 1. Auto-link spouse as co-parent

`App.tsx`'s `handleLinkExisting`, `'child'` branch: after linking the new child to the anchor (`addRelationship('parent-child', anchorId, otherId)`), look up the anchor's current spouse via `getSpouseIds(anchorId, relationships)` (already imported/used elsewhere in this codebase's `familyGraph.ts`) and, if one exists, also link the child to them (`addRelationship('parent-child', spouseId, otherId)`). No change when the anchor has no recorded spouse — single-parent-link behavior stays as-is. Applies uniformly to both "link an existing person as a child" and "create a new person as a child," since both already funnel through this one function.

**Known limitation, accepted as a non-goal:** this assumes the current spouse is the child's other parent, which won't always be true (remarriage, a child from a prior relationship). There's no "remove a specific relationship" UI yet to correct a wrong auto-link if that happens — a family member would need to ask for direct correction. This matches the app's existing simple monogamous-couple data model and is accepted as a tradeoff, not solved here.

### 2. Clicking a sibling re-centers the tree on them

`TreeViewProps` gains `onCenterOn: (id: string) => void`, wired from `App.tsx` to the same `setFocalId` call "Center tree here" already uses (`onCenterHere={() => setFocalId(panel.personId)}` in the `PersonProfile` usage — the tree-level version does the identical thing directly from a patch click). Inside `renderSiblingColumns`, the rendered `Couple`'s `onOpen` prop changes from `handleOpen` to `onCenterOn` — clicking either person in an opened sibling-flap row re-centers the whole tree on them in one click, instead of opening their profile. This is a deliberate, scoped exception: **only** sibling-flap patches behave this way. Everywhere else in the tree (the main ancestor line, descendant branches), a single click still opens the profile, unchanged. Double-click on a sibling-flap patch still triggers the existing `focusOn` (dim-others peek) behavior, unaffected by this change — re-centering is specifically a single-click behavior, replacing "open profile" only.

Re-centering resets the view to a fresh default (see part 3) — any previously-expanded ancestor depth or open sibling flaps from the prior focal person's view do not carry over, matching "look at the tree from Mangal's point of view" as a clean new view, not an accumulation of prior state.

### 3. Default window: exactly 3 generations, expandable

New `TreeView` state: `const [maxAncestorDepth, setMaxAncestorDepth] = useState(1)`. Ancestor rows render only `rows.filter((row) => row.depth <= maxAncestorDepth)` — depth 1 (immediate parents) by default, matching the existing default depth for descendants (the focal person's own children, always shown; grandchildren collapsed). When `rows` contains a depth beyond what's currently shown, render a single "Show grandparents" (generation-name generic, e.g. "Show more ancestors") toggle beneath the deepest visible row, incrementing `maxAncestorDepth` by 1 per click — symmetric with how `DescendantBranch`'s per-person `CollapseToggle` already works, except this one toggle reveals a whole additional row (which may itself contain multiple further-split lineages) rather than being per-person, since ancestor rows are computed generation-wide rather than per-branch.

A `useEffect` resets `maxAncestorDepth` back to `1` whenever `focalId` changes (covers both re-centering via a sibling click and the existing "Center tree here" path) — every new focal person starts from the same clean 3-generation default, not carrying over how far a previous view had been expanded. The same effect also clears `openFlaps` (open sibling flaps) on a `focalId` change, for the same "fresh view" reason.

This is purely a rendering-layer change — `buildAncestorRows` in `familyGraph.ts` is untouched (it still computes every generation; `TreeView` just chooses how many of the computed rows to actually render).

### 4. Sibling count as a small numbered bubble

`SiblingFlap`'s current wide pill ("N siblings ⌄") becomes a small circular badge showing just the count, positioned beside the person's patch rather than as a separate full-width row element below it. Behavior (click to toggle, `open`/`onToggle` props) is unchanged — this is a presentational change to `SiblingFlap.tsx` and its CSS, not an interaction change. Scoped as a small, contained visual tweak here rather than deferred to the larger Spec 5b amplification pass, since it's tightly coupled to "siblings are collapsed by default with a clear expand affordance" — the same behavioral concept part 3 formalizes for ancestors.

### 5. Visual grouping between lineages sharing a row

New helper (in `TreeView.tsx` or a small shared util): `clusterLabel(person: Person, spouse: Person | null): string | null` — returns the shared last name when both people in a unit have one and they match; `null` when missing or mixed (no label rendered, not blocked — matches PRODUCT.md's "incomplete profiles are expected and fine"). Each ancestor-row unit's rendered column(s) (the owner's own `.gen-column` plus any of its own expanded sibling columns, i.e. the existing `Fragment` grouping from `TreeView.tsx`'s `rows.map`) get wrapped in a `.family-cluster` container: a dashed-bordered group (consistent with DESIGN.md's Dashed Seam Rule — this groups "fabric") with the label rendered as a small caption above it when determinable. Extra horizontal gap separates different units' clusters from each other; spacing within one cluster stays tight. This directly targets the screenshot's grandparent row (Gade vs. Khandgaonkar sitting undifferentiated) and applies the same treatment to any other row with multiple units.

### 6. Generic parent-child connecting line (interim, ahead of Spec 5's precise routing)

Render `SeamLine kind="parent-child"` (already implemented, already styled, currently unused) as a short vertical segment below each ancestor-row unit's `Couple` and above each `DescendantBranch`'s `Couple` — a generic "this connects to the generation above/below" visual cue per column. **Explicitly not** a geometrically precise line from one specific parent to their specific children when a row branches into multiple lineages (e.g., it won't visually distinguish "this line belongs to the Gade branch, that one to the Khandgaonkar branch" — the cluster grouping in part 5 is what carries that distinction). Real per-branch line routing is Spec 5.

### Testing

- `App.test.tsx`: adding a child to a person with a recorded spouse links both; adding a child to a person with no spouse links only them (unchanged).
- `TreeView.test.tsx`: clicking a sibling-flap patch calls the new `onCenterOn` (not `onOpenProfile`); double-click still focuses. Ancestor rows beyond depth 1 are hidden by default; the "show more" toggle reveals the next row; `focalId` changing resets `maxAncestorDepth` and open flaps. Cluster labels render for matching-last-name units and are absent for mixed/missing ones. The new `SeamLine` elements render in the expected positions.
- `SiblingFlap.test.tsx` (if one doesn't exist yet, add it): the bubble shows the correct count and still toggles correctly with the new markup.

### Non-goals

- Precise per-branch connector-line routing (exact line from one specific parent to their specific children when multiple lineages share a row) — Spec 5.
- The 3D ego-centric model — explored and set aside; the concrete problems it was meant to solve (per-family clarity, no overlap) are addressed here in 2D via bounded depth + re-centering + cluster grouping.
- Any "remove a specific relationship" UI to correct an auto-link mistake (part 1's known limitation) — not solved here.
- The broader UI visual amplification (color, texture, motion — "looks boring, do the opposite") — that's a separate spec (5b or later), layered on top of whatever structure this spec produces, not mixed into it.
