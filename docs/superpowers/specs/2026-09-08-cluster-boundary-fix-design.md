# Family-cluster boundary fix — design

First of several independent pieces of feedback raised together on 2026-09-08 (the others — parent-linking clarity when one side's parents are absent, a passphrase model change from per-write gating to a one-time login check, and a profile-as-sidebar UI revamp — are separate, larger specs sequenced after this one). This one is scoped to a single concrete visual bug in the family-cluster grouping added by the tree-legibility-fixes spec.

## Problem

`TreeView.tsx` currently wraps an entire ancestor-row unit — the couple's own column, plus *both* sides' revealed sibling columns — in one `.family-cluster` box, labeled by the couple's own shared surname (`clusterLabel(person, spouse)`). This is correct only when a revealed sibling actually shares that surname. It doesn't when they don't: a married-in spouse's own birth-family siblings, revealed via their sibling flap, get boxed under their *married* surname instead of their own.

Concretely: Sarika Gade (married into the Gade family; her own birth family is Khandgaonkar) sits in a couple column with Mallikarjun Gade, boxed and labeled "Gade." Opening Sarika's own sibling flap reveals her Khandgaonkar-born siblings (Mangal, Sangita, Santosh) — and they render *inside that same "Gade" box*, visually implying they're part of the Gade lineage, which they aren't.

## Design

Replace the current single per-unit boolean (`showCluster = row.units.length > 1 || anySiblingsOpen`) with per-column grouping.

**The columns in play**, in their existing render order within one row-unit: the couple column, then each of the person's revealed sibling columns (if their flap is open), then each of the spouse's revealed sibling columns (if theirs is open). Each column already corresponds to one person plus their own spouse (a sibling's own spouse, for a sibling column) — the exact same shape `clusterLabel` already takes for the main couple column, so it's reused unchanged, just applied per-column instead of once per unit.

**Grouping rule:** walk the columns in render order and merge adjacent columns that share the same non-null label into one `.family-cluster` box, captioned with that label. A column whose label differs from its immediate neighbor starts a new box. A column with no determinable label (unknown gender, missing data on either person) is never merged with anything, including another unlabeled neighbor — it renders on its own, unboxed, exactly like today's "no label — not blocked" behavior for a solo unit.

**When nothing gets boxed at all:** if every rendered column in the unit resolves to the same label (or there's only one column, i.e. no sibling flap is open), no box is drawn — matching today's no-clutter behavior when there's nothing to visually distinguish.

**What doesn't change:** the `row.units.length > 1` case — two unrelated lineages sharing one ancestor row, e.g. Mallikarjun's parents next to Sarika's parents — is a separate, already-independent code path (each unit is already rendered as its own `Fragment` with its own cluster treatment) and is untouched by this fix.

This is purely a rendering-layer regrouping inside `TreeView.tsx`. No changes to `familyGraph.ts`, the relationship data model, or the last-name resolution logic from the prior spec — this fix consumes `last_name` values, it doesn't compute them.

**A known consequence, accepted as a non-goal:** because grouping only merges *adjacent* columns (no reordering), a case where the couple's own siblings don't match but the spouse's do (with the non-matching group in between) will render as three separate boxes instead of two tidily-merged ones. Still fully correct — nothing mislabeled or wrongly merged — just not maximally compact. Reordering columns so same-label groups always end up adjacent is a possible future refinement, not part of this fix.

### Testing

- `TreeView.test.tsx`: a revealed sibling column whose resolved last name differs from the couple's renders in its own separate `.family-cluster` (or unboxed, if it's the only column with that label and there's nothing to distinguish it from — cover both the boxed-with-differing-neighbor and lone-unboxed cases). A revealed sibling column that *does* share the couple's surname still merges into the same box as before. The existing "row with multiple unrelated lineages" tests continue to pass unmodified, confirming that path is untouched.

### Non-goals

- Reordering columns so non-adjacent same-label groups merge into one box.
- Any change to how `last_name` is computed (last-name-inheritance spec, already shipped).
- The other three pieces of feedback from the same conversation (parent-linking clarity, passphrase model, profile-as-sidebar) — separate specs.
