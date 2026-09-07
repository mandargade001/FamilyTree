# Guided relationship-adding flow — design

Spec 2a of the observations logged 2026-09-06/07 (item 2, split from the "fun interactive form" request — see Non-goals). Scope: gender as a dropdown, gender-aware relationship labels, a direct "Sibling" option in the relationship picker, and an immediate nudge to add the second parent after the first is recorded. Spec 2b (a visual/interaction redesign of the form itself) is a separate, later spec. Spec 3 (Google auth/photos) follows after 2b.

## Problem

Today:
- `PersonForm`'s `gender` field is a free-text `<input>` — no structure, easy to typo, and nothing downstream can rely on it meaning anything specific.
- `PersonProfile`'s relationship chips always say "Parent" and "Spouse", regardless of the related person's actual gender.
- `RelationshipPicker` only offers Parent / Child / Spouse as things to add. There's no direct way to add a sibling — you have to go find the shared parent and add another child there, which is impossible if the parent isn't recorded yet.
- `TreeView`'s `AddParentSlot` only appears while a person has *zero* recorded parents. The moment one parent is added, the slot disappears — there's no path (guided or otherwise) to add the second parent afterward.

## Design

### 1. Gender field → dropdown

`client/src/components/form/PersonForm.tsx`: replace the `gender` `<input>` with a `<select className="field" id="gender" value={fields.gender ?? ''} onChange={...}>` offering:
- `""` → "Prefer not to say" (stored as `null`, matching the existing `set()` helper's null-coalescing for non-required fields)
- `"Male"` → "Male"
- `"Female"` → "Female"
- `"Other"` → "Other"

No schema change: `people.gender` stays `string | null` in the DB and in `types.ts` — this is a client-side constraint on which strings the form writes, not a new column type.

### 2. Gender-aware relationship-role labels

New file `client/src/lib/relationshipLabels.ts`:

```ts
export function parentRoleLabel(gender: string | null): string {
  if (gender === 'Male') return 'Father'
  if (gender === 'Female') return 'Mother'
  return 'Parent'
}

export function spouseRoleLabel(gender: string | null): string {
  if (gender === 'Male') return 'Husband'
  if (gender === 'Female') return 'Wife'
  return 'Spouse'
}
```

`client/src/components/profile/PersonProfile.tsx`'s chip-building logic (currently hardcoding `role: 'Parent'` / `role: 'Spouse'`) calls these with the *related* person's own `gender` field — a chip's label always describes what that person is to the anchor, based on their own recorded gender, never the anchor's. Unset or `'Other'` gender falls back to the neutral term (`Parent`/`Spouse`) — no guessing. `Child` and `Sibling` chip labels are unaffected (not gendered per the observation's wording).

### 3. Sibling as a fourth relationship-picker type

`client/src/components/picker/RelationshipPicker.tsx`:
- `PickKind` becomes `'parent' | 'child' | 'spouse' | 'sibling'`; `TYPES` and `LABELS` gain the `'sibling'` → `'Sibling'` entry.
- New required prop `relationships: Relationship[]` (mirroring the `people` prop already passed) so the picker can compute `getParentIds(anchorPerson.id, relationships)`.
- When the anchor has zero recorded parents, the Sibling button renders disabled (non-clickable, dimmed via existing `.rel-type` styling plus a disabled variant) with a caption below the type row: "Add a parent first to add siblings." When the anchor has at least one parent, the button behaves like the other three (search-or-create flow, unchanged UI).

`client/src/App.tsx`'s linking logic (`handleLinkExisting`, and the `onCreateNew` inline handler) gains a `'sibling'` branch:
- Look up the anchor's current parent ids via `getParentIds(anchorId, relationships)`.
- For each parent id, `await addRelationship('parent-child', parentId, otherId)` — the picked/created person becomes a `parent-child` target of every one of the anchor's existing parents (one link per parent: one if the anchor has one recorded parent, two if both are recorded), making them a full or half sibling depending on what's known.
- This branch is only reachable when the anchor has ≥1 parent (enforced by the picker's disabled state above) — no additional defensive check is added, consistent with how the other three kinds already trust the UI gate.

### 4. "Add father → prompt for mother" flow

Two changes:

**a. `refresh()` returns the fetched data.** Currently (`App.tsx:101-104`) `refresh()` only calls `setPeople`/`setRelationships` and returns nothing — callers that `await refresh()` still see stale `people`/`relationships` closures afterward (React state updates aren't synchronous). Change its signature to return the freshly-fetched arrays:

```ts
async function refresh() {
  const [newPeople, newRelationships] = await Promise.all([fetchPeople(), fetchRelationships()])
  setPeople(newPeople)
  setRelationships(newRelationships)
  return { people: newPeople, relationships: newRelationships }
}
```

The three existing call sites that don't need the return value are unaffected (ignoring a return value is not a breaking change).

**b. The nudge itself.** In `handleLinkExisting`, after a successful `kind === 'parent'` link:

```ts
const { people: freshPeople, relationships: freshRelationships } = await refresh()
if (kind === 'parent') {
  const parentIds = getParentIds(anchorId, freshRelationships)
  if (parentIds.length === 1) {
    const addedPerson = freshPeople.find((p) => p.id === otherId)
    const addedRole = parentRoleLabel(addedPerson?.gender ?? null)
    const complementRole = addedPerson?.gender === 'Male' ? 'Mother' : addedPerson?.gender === 'Female' ? 'Father' : 'another parent'
    const anchorName = freshPeople.find((p) => p.id === anchorId)?.first_name ?? ''
    setPanel({
      kind: 'picker',
      anchorId,
      heading: `Add ${complementRole} for ${anchorName}?`,
      subheading: `You just added ${addedPerson?.first_name ?? 'them'} as ${anchorName}'s ${addedRole.toLowerCase()}. Add ${complementRole === 'another parent' ? 'another' : `their ${complementRole.toLowerCase()}`} now, or skip for later.`,
      cancelLabel: 'Skip',
    })
    return
  }
}
setPanel({ kind: 'profile', personId: anchorId })
```

(Exact string wording above is illustrative — the implementer should keep it natural and may adjust phrasing, but the trigger condition — "reopen the picker with a role-specific nudge iff the anchor now has exactly one recorded parent" — and the underlying mechanism are fixed.)

The `Panel` union's `{ kind: 'picker'; anchorId: string }` variant gains optional `heading?: string`, `subheading?: string`, `cancelLabel?: string`. `RelationshipPickerProps` gains the same three as optional props, defaulting to today's hardcoded text ("Add relationship to {name}" / "Choose the relationship type, then find or create the person." / "Cancel") when not supplied — `RelationshipPicker` itself stays presentational; App.tsx computes the nudge wording, not the picker.

The picker's internal `type` state already defaults to `'parent'` (`useState<PickKind>('parent')`), so reopening it naturally lands back on the Parent flow without any additional locking — the user can still freely switch types if they want to do something else instead of skipping.

No loop beyond one nudge: the trigger is `parentIds.length === 1` specifically (not `< 2`), so adding a second parent (bringing the count to 2) never re-triggers the prompt, and a person who already has 2+ parents recorded (e.g. via the generic "Add relationship" flow, not gated by this feature) never sees it either.

### Testing

- `PersonForm.test.tsx`: gender select renders the four options and writes the selected value (or `null` for the blank option) into `fields.gender`.
- New `relationshipLabels.test.ts`: `parentRoleLabel`/`spouseRoleLabel` for `'Male'`, `'Female'`, `'Other'`, `null`.
- `PersonProfile.test.tsx`: chips render `Father`/`Mother`/`Husband`/`Wife` when the related person's gender is set, falling back to `Parent`/`Spouse` otherwise.
- `RelationshipPicker.test.tsx`: Sibling button present; disabled + caption when `relationships` shows the anchor has no parents; enabled and functional otherwise.
- `App.test.tsx`: adding a sibling links the new/existing person as a `parent-child` of the anchor's existing parent(s), not of the anchor. Adding a first parent reopens the picker with the nudge heading; adding a second parent (or a parent when 2 already exist) returns straight to the profile as today.

### Non-goals

- No visual/interaction redesign of the form (step wizard, animations, etc.) — that's Spec 2b, a separate spec.
- No "Son"/"Daughter" gendering for the Child relationship, and no "Brother"/"Sister" gendering for Sibling — the original observation only called out husband/wife (and, via the father/mother prompt flow, parent) as needing gender-based wording.
- No enforcement of a hard cap of 2 parents — the nudge only fires going from 0→1; someone can still add a 3rd/4th parent via the ungated "Add relationship" flow as today, unchanged.
