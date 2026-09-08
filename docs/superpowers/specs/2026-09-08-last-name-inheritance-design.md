# Last-name inheritance — design

Spec 5 (out of sequence with the earlier-numbered but not-yet-scoped precise-line-routing spec, which stays deferred and unnamed for now). Triggered by a data-quality review after the relationship-graph fix on 2026-09-08: several people were missing `last_name`, and the family-cluster grouping added in the tree-legibility-fixes spec depends on that field being correct to visually separate lineages sharing a row.

## Problem

`last_name` is a free-text field, manually typed per person in the add/edit form. Nothing keeps it consistent with the family's actual naming convention: a son doesn't automatically get his father's surname, a daughter doesn't automatically pick up her husband's surname on marriage, and there's no mechanism to propagate a name down a lineage once it's known. In the current data this left several people (Kishan, Priya, Kedar, Rudrani, Hrishikesh, Preeti, Dipti, and others) with a blank `last_name`, which in turn means they render outside any `.family-cluster` grouping — undermining the very feature that grouping was built to provide.

The user's stated rule (patriarchal naming convention used by this family):
- Sons inherit the family (last) name automatically, permanently.
- Daughters inherit the family name until marriage; upon marriage they inherit the spouse's family name.

## Design

### 1. The resolution rule

A pure function of the relationship graph — no new database columns. For any person with a known `gender` and a blank `last_name`:

- **Male**: take the `last_name` of their recorded father — the parent found via a `parent-child` relationship where the parent's `gender` is `'Male'` — if he has a non-blank `last_name`.
- **Female**: if she has a recorded `spouse` relationship and that spouse has a non-blank `last_name`, take his. Otherwise, fall back to the same rule as a son (her father's `last_name`) — this covers the common pre-marriage state.
- **Unknown gender**: never resolved. Stays blank until gender is set. Guessing would actively mislead the family-cluster grouping, which is exactly what this feature exists to make trustworthy.
- **No resolvable source** (father unknown, or father's own `last_name` is still blank, and — for a married woman — her spouse's `last_name` is also blank): stays blank, same as today. Not an error state; just insufficient data so far.

This rule only ever fills a **blank** field. It is not consulted at all for anyone who already has any `last_name` value, whether that value was set by a person or by a previous run of this same rule.

### 2. Trigger and propagation

Implemented client-side, in `App.tsx`, alongside the existing relationship-mutation handlers (the same place Spec 4's spouse-co-parent auto-link lives). After any edit that could change an answer — adding or removing a `parent-child` or `spouse` relationship, or changing a person's `gender` — run a recompute pass over the full in-memory people+relationship graph (already loaded for rendering; at the current and expected scale of a few dozen to a few hundred people this is cheap).

The pass is a fixed-point iteration: apply the rule to every person with a currently-blank `last_name`, repeat while any person's name newly became resolvable as a result of the same pass, stop when a full sweep makes no further changes. This is what gives "instant regrouping" its meaning in practice: setting a root ancestor's `last_name` for the first time (or linking a previously-disconnected branch) cascades through every currently-blank descendant down the male line, and every married-in daughter, in one pass — not one edit at a time. Each newly-resolved name is persisted via the existing `updatePerson` write path; the existing post-write refetch/re-render already picks up the change, so no new rendering logic is needed. The family-cluster grouping (`clusterLabel` in `TreeView.tsx`) already reads `last_name` directly and needs no changes to benefit from this.

### 3. Manual field stays as-is

The `last_name` input in the add/edit person form is unchanged — still a free-text field, always editable, never disabled or replaced with a computed/read-only display. The rule is consulted only as a fallback for a blank value, never to override an existing one. To have a name re-derived later (e.g., after fixing an upstream data error), a person clears the field back to blank; the next relevant edit anywhere in the graph will pick it up on the next recompute pass.

### 4. One-time backfill

Ships together with an immediate one-time run of the same pass against the current production data, applied the same way an edit-triggered pass would be (recompute, persist any newly-resolved names). This is not a special migration path — it's the ordinary recompute function invoked once at deploy time — and it will resolve everyone whose gender and father/spouse chain already supports the rule. Anyone still missing `gender` remains blank until that's set.

### Testing

- Unit tests for the pure resolution function: son inherits father's name; daughter inherits father's name pre-marriage; daughter inherits spouse's name once married; unknown gender never resolves; no source (blank father/spouse chain) stays blank; an existing non-blank name is never overwritten regardless of what the graph implies.
- Fixed-point propagation test: a chain of three generations with only the root's `last_name` set resolves all descendants (through sons) and a married-in daughter's spouse in a single recompute call.
- Integration test in `App.tsx`'s test suite: adding a `parent-child` or `spouse` relationship, or editing gender, triggers a recompute and persists newly-resolved names via the existing update path.
- One-time backfill: covered by the same unit/fixed-point tests: the backfill is only the module-level recompute function invoked once, not a separate implementation to test.

### Non-goals

- The seam-line ambiguity raised alongside this request (a generic connector visually implying a married-in spouse shares the same parents as their partner) — that belongs to the still-deferred precise-line-routing spec, not this one.
- A "manually overridden" lock/flag distinguishing hand-typed names from auto-resolved ones — clearing the field to blank is the only re-derive mechanism; no new column or UI affordance for this.
- Inferring `gender` from any other signal. It remains a manually-set field.
- Any change to how `last_name` is displayed, validated, or required at person-creation time.
