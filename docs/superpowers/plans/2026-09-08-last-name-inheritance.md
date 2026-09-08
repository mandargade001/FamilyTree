# Last-name inheritance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-resolve a blank `last_name` from the family-relationship graph, following this family's patriarchal naming convention, whenever an edit could newly make it resolvable — and backfill the same rule against existing data on load.

**Architecture:** A pure function (`resolveLastNames`) computes which currently-blank `last_name` fields the graph now resolves, iterating to a fixed point so a single edit can cascade through an entire currently-blank lineage. `App.tsx` calls it — and persists any results via the existing `updatePerson` write path — after every edit that could change an answer (adding a `parent-child` or `spouse` relationship, editing a person's `gender`), and once after the initial data load (which doubles as the one-time backfill, since the function is a no-op once nothing is blank).

**Tech Stack:** React + TypeScript client, Vitest + Testing Library for tests, Supabase Postgres via existing `updatePerson`/RPC.

## Global Constraints

- The rule only ever fills a **blank** `last_name` (`null` or an all-whitespace string). It must never overwrite a `last_name` that already holds any value, whether that value was set by a person or by a previous run of this same rule.
- Gender values in this codebase are exactly `'Male'`, `'Female'`, `'Other'`, or `null` (see `PersonForm.tsx`'s `<select id="gender">`). Only `'Male'` and `'Female'` are resolved by this rule — `'Other'` and `null` are both treated as unknown gender and never resolved, matching the design's explicit non-goal of inferring gender.
- "Father" means the parent found via a `parent-child` relationship (`getParentIds`) whose `gender` is exactly `'Male'`. A person with two recorded male parents (bad data) resolves against whichever is found first — not a case this plan needs to handle specially.
- Do not add a "manually overridden" flag/column. Clearing the field back to blank is the only way to make a name eligible for re-resolution.
- Do not change the `last_name` input in `PersonForm.tsx` — it stays a plain, always-editable text field.

---

### Task 1: The pure resolution function

**Files:**
- Create: `client/src/lib/lastNameInheritance.ts`
- Test: `client/src/lib/lastNameInheritance.test.ts`

**Interfaces:**
- Consumes: `Person`, `Relationship` from `../types`; `getParentIds`, `getSpouseIds` from `./familyGraph` (both already exist, unchanged).
- Produces: `export interface LastNameUpdate { id: string; last_name: string }` and `export function resolveLastNames(people: Person[], relationships: Relationship[]): LastNameUpdate[]` — Task 2 calls this directly.

- [ ] **Step 1: Write the failing tests**

```typescript
import { describe, expect, test } from 'vitest'
import type { Person, Relationship } from '../types'
import { resolveLastNames } from './lastNameInheritance'

function person(overrides: Partial<Person> & { id: string }): Person {
  return {
    first_name: overrides.id,
    last_name: null,
    gender: null,
    birth_date: null,
    death_date: null,
    birth_place: null,
    occupation: null,
    bio: null,
    created_at: '',
    updated_at: '',
    ...overrides,
  }
}

function parentChild(from_id: string, to_id: string): Relationship {
  return { id: `${from_id}-${to_id}`, type: 'parent-child', from_id, to_id }
}

function spouse(from_id: string, to_id: string): Relationship {
  return { id: `${from_id}-${to_id}-spouse`, type: 'spouse', from_id, to_id }
}

describe('resolveLastNames', () => {
  test('a son inherits his father\'s last name', () => {
    const father = person({ id: 'father', last_name: 'Gade', gender: 'Male' })
    const son = person({ id: 'son', last_name: null, gender: 'Male' })
    const updates = resolveLastNames([father, son], [parentChild('father', 'son')])
    expect(updates).toEqual([{ id: 'son', last_name: 'Gade' }])
  })

  test('an unmarried daughter inherits her father\'s last name', () => {
    const father = person({ id: 'father', last_name: 'Gade', gender: 'Male' })
    const daughter = person({ id: 'daughter', last_name: null, gender: 'Female' })
    const updates = resolveLastNames([father, daughter], [parentChild('father', 'daughter')])
    expect(updates).toEqual([{ id: 'daughter', last_name: 'Gade' }])
  })

  test('a married daughter inherits her spouse\'s last name, not her father\'s', () => {
    const father = person({ id: 'father', last_name: 'Gade', gender: 'Male' })
    const husband = person({ id: 'husband', last_name: 'Khandgaonkar', gender: 'Male' })
    const daughter = person({ id: 'daughter', last_name: null, gender: 'Female' })
    const updates = resolveLastNames(
      [father, husband, daughter],
      [parentChild('father', 'daughter'), spouse('daughter', 'husband')],
    )
    expect(updates).toEqual([{ id: 'daughter', last_name: 'Khandgaonkar' }])
  })

  test('unknown gender is never resolved', () => {
    const father = person({ id: 'father', last_name: 'Gade', gender: 'Male' })
    const child = person({ id: 'child', last_name: null, gender: null })
    const updates = resolveLastNames([father, child], [parentChild('father', 'child')])
    expect(updates).toEqual([])
  })

  test('"Other" gender is never resolved', () => {
    const father = person({ id: 'father', last_name: 'Gade', gender: 'Male' })
    const child = person({ id: 'child', last_name: null, gender: 'Other' })
    const updates = resolveLastNames([father, child], [parentChild('father', 'child')])
    expect(updates).toEqual([])
  })

  test('no resolvable source leaves the name blank', () => {
    const father = person({ id: 'father', last_name: null, gender: 'Male' })
    const son = person({ id: 'son', last_name: null, gender: 'Male' })
    const updates = resolveLastNames([father, son], [parentChild('father', 'son')])
    expect(updates).toEqual([])
  })

  test('an existing last name is never overwritten, even if the graph implies a different one', () => {
    const father = person({ id: 'father', last_name: 'Gade', gender: 'Male' })
    const son = person({ id: 'son', last_name: 'Deshmukh', gender: 'Male' })
    const updates = resolveLastNames([father, son], [parentChild('father', 'son')])
    expect(updates).toEqual([])
  })

  test('a three-generation chain resolves fully in one call from only the root\'s name', () => {
    const grandfather = person({ id: 'grandfather', last_name: 'Gade', gender: 'Male' })
    const father = person({ id: 'father', last_name: null, gender: 'Male' })
    const son = person({ id: 'son', last_name: null, gender: 'Male' })
    const updates = resolveLastNames(
      [grandfather, father, son],
      [parentChild('grandfather', 'father'), parentChild('father', 'son')],
    )
    expect(updates).toEqual(
      expect.arrayContaining([
        { id: 'father', last_name: 'Gade' },
        { id: 'son', last_name: 'Gade' },
      ]),
    )
    expect(updates).toHaveLength(2)
  })

  test('a married-in daughter-in-law resolves in the same pass as her husband, when he only resolves via this call', () => {
    const grandfather = person({ id: 'grandfather', last_name: 'Gade', gender: 'Male' })
    const father = person({ id: 'father', last_name: null, gender: 'Male' })
    const wife = person({ id: 'wife', last_name: null, gender: 'Female' })
    const updates = resolveLastNames(
      [grandfather, father, wife],
      [parentChild('grandfather', 'father'), spouse('father', 'wife')],
    )
    expect(updates).toEqual(
      expect.arrayContaining([
        { id: 'father', last_name: 'Gade' },
        { id: 'wife', last_name: 'Gade' },
      ]),
    )
    expect(updates).toHaveLength(2)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd client && npx vitest run src/lib/lastNameInheritance.test.ts`
Expected: FAIL — `lastNameInheritance.ts` does not exist yet.

- [ ] **Step 3: Write the implementation**

```typescript
import type { Person, Relationship } from '../types'
import { getParentIds, getSpouseIds } from './familyGraph'

function isBlank(value: string | null): boolean {
  return value === null || value.trim().length === 0
}

function findFather(personId: string, peopleById: Map<string, Person>, relationships: Relationship[]): Person | null {
  for (const parentId of getParentIds(personId, relationships)) {
    const parent = peopleById.get(parentId)
    if (parent?.gender === 'Male') return parent
  }
  return null
}

export interface LastNameUpdate {
  id: string
  last_name: string
}

// Fills in a blank last_name for anyone whose gender and relationships make
// it unambiguous, per this family's patriarchal naming convention: sons
// inherit their father's last name permanently; daughters inherit their
// father's last name until marriage, then their spouse's. Never touches a
// person who already has any last_name value — that's a load-bearing
// invariant, not an optimization, since the caller treats "already has a
// value" as "a person set this on purpose." Iterates to a fixed point so
// that resolving one person's name in this pass can immediately resolve
// their own children or spouse too (e.g. filling in a root ancestor's name
// for the first time cascades through the whole currently-blank lineage in
// one call).
export function resolveLastNames(people: Person[], relationships: Relationship[]): LastNameUpdate[] {
  const peopleById = new Map(people.map((p) => [p.id, p]))
  const resolved = new Map<string, string | null>(people.map((p) => [p.id, p.last_name]))

  let changed = true
  while (changed) {
    changed = false
    for (const p of people) {
      if (!isBlank(resolved.get(p.id) ?? null)) continue

      if (p.gender === 'Female') {
        const spouseId = getSpouseIds(p.id, relationships)[0]
        const spouseLastName = spouseId ? resolved.get(spouseId) ?? null : null
        if (!isBlank(spouseLastName)) {
          resolved.set(p.id, spouseLastName)
          changed = true
          continue
        }
      }

      if (p.gender === 'Male' || p.gender === 'Female') {
        const father = findFather(p.id, peopleById, relationships)
        const fatherLastName = father ? resolved.get(father.id) ?? null : null
        if (!isBlank(fatherLastName)) {
          resolved.set(p.id, fatherLastName)
          changed = true
        }
      }
    }
  }

  const updates: LastNameUpdate[] = []
  for (const p of people) {
    if (!isBlank(p.last_name)) continue
    const newName = resolved.get(p.id)
    if (newName && !isBlank(newName)) {
      updates.push({ id: p.id, last_name: newName })
    }
  }
  return updates
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd client && npx vitest run src/lib/lastNameInheritance.test.ts`
Expected: PASS, all 9 tests.

- [ ] **Step 5: Commit**

```bash
git add client/src/lib/lastNameInheritance.ts client/src/lib/lastNameInheritance.test.ts
git commit -m "Add pure last-name inheritance resolution function"
```

---

### Task 2: Wire the resolver into App.tsx (edits + load-time backfill)

**Files:**
- Modify: `client/src/App.tsx`
- Test: `client/src/App.test.tsx`

**Interfaces:**
- Consumes: `resolveLastNames`, `LastNameUpdate` from Task 1's `./lib/lastNameInheritance` (new import). `refresh()` (existing, returns `{ people: Person[], relationships: Relationship[] }`). `updatePerson` (existing, from `./api/people`, expects `(id: string, fields: PersonFields)`).
- Produces: nothing new consumed elsewhere — this task's `reconcileLastNames` is called only from within `App.tsx`.

- [ ] **Step 1: Add the import**

In `client/src/App.tsx`, add this new line directly after the existing `import { getParentIds, getSpouseIds } from './lib/familyGraph'` line (line 13) — do not modify that existing line:

```typescript
import { resolveLastNames } from './lib/lastNameInheritance'
```

- [ ] **Step 2: Add the `reconcileLastNames` helper**

Add this function inside the `App` component, directly after the existing `refresh` function (after line 108, i.e. right after its closing `}`):

```typescript
  // After any edit that could make a previously-unresolved last name
  // resolvable (a new parent-child/spouse link, or a gender change), persist
  // any newly-resolved names and reflect them in state. Safe to call after
  // every relevant write since resolveLastNames only ever fills a blank
  // field — a call that resolves nothing is a no-op past its first line.
  async function reconcileLastNames(currentPeople: Person[], currentRelationships: Relationship[]) {
    const updates = resolveLastNames(currentPeople, currentRelationships)
    if (updates.length === 0) return
    const byId = new Map(currentPeople.map((p) => [p.id, p]))
    for (const update of updates) {
      const person = byId.get(update.id)
      if (!person) continue
      await updatePerson(person.id, {
        first_name: person.first_name,
        last_name: update.last_name,
        gender: person.gender,
        birth_date: person.birth_date,
        death_date: person.death_date,
        birth_place: person.birth_place,
        occupation: person.occupation,
        bio: person.bio,
      })
    }
    await refresh()
  }
```

- [ ] **Step 3: Call it from `load()` (the backfill path)**

In `load()` (around line 78-93), call it right after the initial state is set, fire-and-forget so it doesn't delay `setLoadState('loaded')`:

```typescript
  async function load() {
    setLoadState('loading')
    try {
      const [peopleRows, relRows] = await Promise.all([fetchPeople(), fetchRelationships()])
      setPeople(peopleRows)
      setRelationships(relRows)
      if (peopleRows.length > 0) setFocalId((prev) => prev ?? peopleRows[0].id)
      setLoadState('loaded')
      void reconcileLastNames(peopleRows, relRows)
    } catch (err) {
      console.error('Failed to load people/relationships', err)
      setLoadState('failed')
    }
  }
```

- [ ] **Step 4: Call it from `handleSavePerson`**

In `handleSavePerson` (around line 128-153), call it after `refresh()` in both branches, capturing `refresh()`'s return value (it wasn't captured before):

```typescript
  async function handleSavePerson(fields: PersonFields) {
    const editingId = panel.kind === 'form' ? panel.editingId : null
    try {
      setErrorMessage(null)
      if (editingId) {
        await updatePerson(editingId, fields)
        const { people: freshPeople, relationships: freshRelationships } = await refresh()
        await reconcileLastNames(freshPeople, freshRelationships)
        // Editing was launched from a profile panel — return there rather than
        // dropping the user back on the bare tree.
        setPanel({ kind: 'profile', personId: editingId })
      } else {
        const newId = await addPerson(fields)
        if (!focalId) setFocalId(newId)
        const { people: freshPeople, relationships: freshRelationships } = await refresh()
        await reconcileLastNames(freshPeople, freshRelationships)
        // The standalone "+ Add Person" flow creates a person with no
        // relationship yet — land on their own profile so they're immediately
        // visible and editable, rather than leaving them an orphan only
        // reachable later via another person's relationship-picker search.
        setPanel({ kind: 'profile', personId: newId })
      }
    } catch (err) {
      // Leave the form panel in place (unless handleWriteError opened the
      // gate) so the user can see the error and retry without losing input.
      handleWriteError(err)
    }
  }
```

- [ ] **Step 5: Call it from `handleLinkExisting`**

In `handleLinkExisting` (around line 199), call it right after the existing `refresh()` call, before the `if (kind === 'parent')` branch that decides the next panel:

```typescript
    const { people: freshPeople, relationships: freshRelationships } = await refresh()
    await reconcileLastNames(freshPeople, freshRelationships)

    if (kind === 'parent') {
```

(The rest of `handleLinkExisting` below this point is unchanged — it already uses the locally captured `freshPeople`/`freshRelationships`, which `reconcileLastNames` does not mutate.)

- [ ] **Step 6: Write the new tests**

Add to `client/src/App.test.tsx`, following the existing mocking pattern (queue `mockResolvedValueOnce` per expected `fetchPeople`/`fetchRelationships` call):

```typescript
test('loading the app backfills a blank last name the relationship graph already resolves', async () => {
  ;(fetchPeople as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
    { id: 'father', first_name: 'Ravi', last_name: 'Gade', gender: 'Male', birth_date: null, death_date: null, birth_place: null, occupation: null, bio: null, created_at: '', updated_at: '' },
    { id: 'son', first_name: 'Omkar', last_name: null, gender: 'Male', birth_date: null, death_date: null, birth_place: null, occupation: null, bio: null, created_at: '', updated_at: '' },
  ])
  ;(fetchRelationships as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
    { id: 'r1', type: 'parent-child', from_id: 'father', to_id: 'son' },
  ])
  render(<App />)
  await waitFor(() => expect(screen.getByText('Ravi Gade')).toBeInTheDocument())

  await waitFor(() => expect(updatePerson).toHaveBeenCalledWith('son', expect.objectContaining({ last_name: 'Gade' })))
})

test('editing a person to set their gender resolves their blank last name from their father', async () => {
  localStorage.setItem('vansh:passphrase', 'test-passphrase')
  ;(fetchPeople as ReturnType<typeof vi.fn>)
    .mockResolvedValueOnce([
      { id: 'father', first_name: 'Ravi', last_name: 'Gade', gender: 'Male', birth_date: null, death_date: null, birth_place: null, occupation: null, bio: null, created_at: '', updated_at: '' },
      { id: 'son', first_name: 'Omkar', last_name: null, gender: null, birth_date: null, death_date: null, birth_place: null, occupation: null, bio: null, created_at: '', updated_at: '' },
    ])
    .mockResolvedValueOnce([
      { id: 'father', first_name: 'Ravi', last_name: 'Gade', gender: 'Male', birth_date: null, death_date: null, birth_place: null, occupation: null, bio: null, created_at: '', updated_at: '' },
      { id: 'son', first_name: 'Omkar', last_name: null, gender: 'Male', birth_date: null, death_date: null, birth_place: null, occupation: null, bio: null, created_at: '', updated_at: '' },
    ])
  ;(fetchRelationships as ReturnType<typeof vi.fn>)
    .mockResolvedValueOnce([{ id: 'r1', type: 'parent-child', from_id: 'father', to_id: 'son' }])
    .mockResolvedValueOnce([{ id: 'r1', type: 'parent-child', from_id: 'father', to_id: 'son' }])
  render(<App />)
  await waitFor(() => expect(screen.getByText('Ravi Gade')).toBeInTheDocument())

  fireEvent.click(screen.getByText('Omkar'))
  await waitFor(() => expect(screen.getByText('Edit Profile')).toBeInTheDocument())
  fireEvent.click(screen.getByText('Edit Profile'))
  await waitFor(() => expect(screen.getByText('Edit Person')).toBeInTheDocument())

  fireEvent.change(screen.getByLabelText('Gender'), { target: { value: 'Male' } })
  fireEvent.click(screen.getByText('Save'))

  await waitFor(() => expect(updatePerson).toHaveBeenCalledWith('son', expect.objectContaining({ last_name: 'Gade' })))
})
```

Note: these two tests queue their own `fetchPeople`/`fetchRelationships` mocks per call, so they're independent of whatever the top-level `vi.mock('./api/people', ...)` factory's default single-Meera fixture returns for any call beyond what's queued (a third call, if triggered by `reconcileLastNames`'s own internal `refresh()`, harmlessly falls through to that default — it isn't asserted on).

- [ ] **Step 7: Run the full test suite**

Run: `cd client && npm test`
Expected: PASS, all prior tests plus these 2 new ones (do NOT append `-- run` — `package.json`'s `test` script is already `vitest run`).

- [ ] **Step 8: Type-check**

Run: `cd client && npx tsc --noEmit`
Expected: clean, no output.

- [ ] **Step 9: Commit**

```bash
git add client/src/App.tsx client/src/App.test.tsx
git commit -m "Wire last-name resolution into person/relationship edits and load-time backfill"
```
