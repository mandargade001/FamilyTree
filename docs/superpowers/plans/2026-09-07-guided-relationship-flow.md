# Guided Relationship-Adding Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn gender into a structured dropdown, make relationship labels gender-aware (Father/Mother/Husband/Wife), add a direct "Sibling" option to the relationship picker, and nudge the user to add the second parent immediately after the first is recorded.

**Architecture:** Five small, mostly-independent changes to existing React components in `client/src`, plus one new pure-function module (`relationshipLabels.ts`). No schema/API changes — `gender` stays a free-text column, siblings are still expressed as shared `parent-child` links (no new relationship type). Tasks 1-4 are self-contained; Task 5 integrates Tasks 3 and 4's new `RelationshipPicker` props into `App.tsx`'s write flow.

**Tech Stack:** React 18 + TypeScript, Vitest + React Testing Library, existing `Button`/`Icon` shared components, existing `familyGraph.ts` helpers (`getParentIds`).

## Global Constraints

- No schema/migration changes. `people.gender` stays `string | null`; relationships stay `'parent-child' | 'spouse'` only — a sibling is always expressed as two people sharing the same recorded parent(s), never a new relationship type.
- Gender-based labels only apply where the spec calls for them: parent role (Father/Mother/Parent) and spouse role (Husband/Wife/Spouse). Child and Sibling labels stay unchanged ("Child", "Sibling") — no "Son"/"Daughter"/"Brother"/"Sister".
- The "add mother" nudge triggers exactly when the anchor's parent count becomes 1 after an add — never on 0→already-had-one-before, never on 2+.
- Match existing code style: no comments except where a non-obvious constraint needs explaining.
- Run `cd client && npm test` after every task (this project's `package.json` test script is already `vitest run` — do NOT append `-- run`, which breaks it by treating "run" as a filename filter and yields "No test files found").

---

### Task 1: Gender dropdown in PersonForm

**Files:**
- Modify: `client/src/components/form/PersonForm.tsx`
- Test: `client/src/components/form/PersonForm.test.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: no interface change — `fields.gender` stays `string | null`, still written via the existing `set()` helper (`set('gender', e.target.value)`), which already converts `''` to `null` for any field except `first_name` (`PersonForm.tsx:19-23`).

- [ ] **Step 1: Write the failing test**

Add to `client/src/components/form/PersonForm.test.tsx`, inside the existing `describe('PersonForm', ...)` block, after the `'Save is disabled until a first name is entered'` test:

```tsx
it('gender is a dropdown with blank/Male/Female/Other options, writing null for the blank option', () => {
  const onSave = vi.fn()
  render(<PersonForm initial={null} onSave={onSave} onCancel={() => {}} />)
  fireEvent.change(screen.getByLabelText(/First name/), { target: { value: 'Anna' } })

  const genderSelect = screen.getByLabelText('Gender') as HTMLSelectElement
  expect(Array.from(genderSelect.options).map((o) => o.value)).toEqual(['', 'Male', 'Female', 'Other'])

  fireEvent.change(genderSelect, { target: { value: 'Female' } })
  fireEvent.click(screen.getByText('Save'))
  expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ gender: 'Female' }))
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npx vitest run src/components/form/PersonForm.test.tsx`
Expected: FAIL — `screen.getByLabelText('Gender')` finds an `<input>`, not a `<select>` with the expected `.options`.

- [ ] **Step 3: Replace the gender input with a select**

In `client/src/components/form/PersonForm.tsx`, replace:

```tsx
        <div className="form-row">
          <label htmlFor="gender">Gender</label>
          <input id="gender" className="field" value={fields.gender ?? ''} onChange={(e) => set('gender', e.target.value)} placeholder="optional" />
        </div>
```

with:

```tsx
        <div className="form-row">
          <label htmlFor="gender">Gender</label>
          <select id="gender" className="field" value={fields.gender ?? ''} onChange={(e) => set('gender', e.target.value)}>
            <option value="">Prefer not to say</option>
            <option value="Male">Male</option>
            <option value="Female">Female</option>
            <option value="Other">Other</option>
          </select>
        </div>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd client && npx vitest run src/components/form/PersonForm.test.tsx`
Expected: PASS, all tests in the file (existing + new) green. The existing `'calls onSave with the entered fields, defaulting optional fields to null'` test never touches gender, so it's unaffected and should still pass unchanged.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/form/PersonForm.tsx client/src/components/form/PersonForm.test.tsx
git commit -m "Turn the person form's gender field into a dropdown"
```

---

### Task 2: Gender-aware parent/spouse role labels

**Files:**
- Create: `client/src/lib/relationshipLabels.ts`
- Test: `client/src/lib/relationshipLabels.test.ts`
- Modify: `client/src/components/profile/PersonProfile.tsx`
- Test: `client/src/components/profile/PersonProfile.test.tsx`

**Interfaces:**
- Produces: `parentRoleLabel(gender: string | null): string` → `'Father' | 'Mother' | 'Parent'`; `spouseRoleLabel(gender: string | null): string` → `'Husband' | 'Wife' | 'Spouse'`. Both exported from `client/src/lib/relationshipLabels.ts`. No other task consumes these directly, but they establish the naming other tasks' prose refers to.

- [ ] **Step 1: Write the failing test for the helper**

Create `client/src/lib/relationshipLabels.test.ts`:

```ts
import { parentRoleLabel, spouseRoleLabel } from './relationshipLabels'

test('parentRoleLabel maps gender to Father/Mother/Parent', () => {
  expect(parentRoleLabel('Male')).toBe('Father')
  expect(parentRoleLabel('Female')).toBe('Mother')
  expect(parentRoleLabel('Other')).toBe('Parent')
  expect(parentRoleLabel(null)).toBe('Parent')
})

test('spouseRoleLabel maps gender to Husband/Wife/Spouse', () => {
  expect(spouseRoleLabel('Male')).toBe('Husband')
  expect(spouseRoleLabel('Female')).toBe('Wife')
  expect(spouseRoleLabel('Other')).toBe('Spouse')
  expect(spouseRoleLabel(null)).toBe('Spouse')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npx vitest run src/lib/relationshipLabels.test.ts`
Expected: FAIL — the module doesn't exist yet.

- [ ] **Step 3: Implement the helper**

Create `client/src/lib/relationshipLabels.ts`:

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

- [ ] **Step 4: Run test to verify it passes**

Run: `cd client && npx vitest run src/lib/relationshipLabels.test.ts`
Expected: PASS, both tests green.

- [ ] **Step 5: Write the failing test for chip labeling**

Add to `client/src/components/profile/PersonProfile.test.tsx`, after the existing `'lists relationship chips by role'` test:

```tsx
test('relationship chips use gender-aware role labels for parent and spouse', () => {
  const father = person('anna-father', 'Anna', { gender: 'Male' })
  const husband = person('deepak', 'Deepak', { gender: 'Male' })
  const localPeople = [meera, father, husband]
  const localRelationships: Relationship[] = [
    { id: 'r1', type: 'parent-child', from_id: 'anna-father', to_id: 'meera' },
    { id: 'r2', type: 'spouse', from_id: 'meera', to_id: 'deepak' },
  ]
  render(<PersonProfile {...baseProps({ people: localPeople, relationships: localRelationships })} />)
  expect(screen.getByText('Father · Anna')).toBeInTheDocument()
  expect(screen.getByText('Husband · Deepak')).toBeInTheDocument()
})
```

(The existing `'lists relationship chips by role'` test already covers the fallback case — its fixture people have `gender: null`, so it continues to assert `'Parent · Anna'` and `'Child · Rohan'` unchanged, proving the no-gender-recorded fallback still works.)

- [ ] **Step 6: Run test to verify it fails**

Run: `cd client && npx vitest run src/components/profile/PersonProfile.test.tsx -t "gender-aware role labels"`
Expected: FAIL — chips currently always say "Parent" / "Spouse" regardless of gender.

- [ ] **Step 7: Use the helper in PersonProfile's chip labels**

In `client/src/components/profile/PersonProfile.tsx`, add the import:

```tsx
import { parentRoleLabel, spouseRoleLabel } from '../../lib/relationshipLabels'
```

Replace:

```tsx
  const chips: { role: string; personId: string }[] = [
    ...family.parents.map((id) => ({ role: 'Parent', personId: id })),
    ...(family.spouse ? [{ role: 'Spouse', personId: family.spouse }] : []),
    ...family.children.map((id) => ({ role: 'Child', personId: id })),
  ]
```

with:

```tsx
  const chips: { role: string; personId: string }[] = [
    ...family.parents.map((id) => ({ role: parentRoleLabel(byId.get(id)?.gender ?? null), personId: id })),
    ...(family.spouse ? [{ role: spouseRoleLabel(byId.get(family.spouse)?.gender ?? null), personId: family.spouse }] : []),
    ...family.children.map((id) => ({ role: 'Child', personId: id })),
  ]
```

- [ ] **Step 8: Run test to verify it passes**

Run: `cd client && npx vitest run src/components/profile/PersonProfile.test.tsx`
Expected: PASS, full file green (existing + new test).

- [ ] **Step 9: Commit**

```bash
git add client/src/lib/relationshipLabels.ts client/src/lib/relationshipLabels.test.ts client/src/components/profile/PersonProfile.tsx client/src/components/profile/PersonProfile.test.tsx
git commit -m "Add gender-aware Father/Mother/Husband/Wife relationship labels"
```

---

### Task 3: Sibling as a fourth relationship-picker type

**Files:**
- Modify: `client/src/components/picker/RelationshipPicker.tsx`
- Modify: `client/src/components/picker/RelationshipPicker.test.tsx`
- Modify: `client/src/styles/global.css`

**Interfaces:**
- Consumes: `getParentIds(personId, relationships): string[]` from `client/src/lib/familyGraph.ts` (already exists, signature unchanged).
- Produces: `PickKind` becomes `'parent' | 'child' | 'spouse' | 'sibling'`. `RelationshipPickerProps` gains a new **required** prop `relationships: Relationship[]`. Task 5 (App.tsx integration) depends on both: the widened `PickKind` (so `handleLinkExisting` can branch on `'sibling'`) and the new required `relationships` prop (so it must pass `relationships={relationships}` at the call site).

- [ ] **Step 1: Update existing tests for the new required prop**

In `client/src/components/picker/RelationshipPicker.test.tsx`, add the type import and pass `relationships={[]}` to every existing `render(<RelationshipPicker .../>)` call (there are 7):

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { RelationshipPicker } from './RelationshipPicker'
import type { Person, Relationship } from '../../types'
```

For each existing `render(<RelationshipPicker anchorPerson={anchor} people={people} onLinkExisting={...} onCreateNew={...} onCancel={...} />)` call in the file, add `relationships={[]}` (anchor has no recorded parents — none of the existing tests exercise the Sibling option, so this doesn't change their behavior).

- [ ] **Step 2: Write the failing tests for Sibling**

Add to the same file, after the existing `'offers a Child option...'` test:

```tsx
test('offers a Sibling option that calls onLinkExisting with kind "sibling", when the anchor has a recorded parent', () => {
  const onLinkExisting = vi.fn()
  const relationships: Relationship[] = [{ id: 'r1', type: 'parent-child', from_id: 'deepak', to_id: 'meera' }]
  render(<RelationshipPicker anchorPerson={anchor} people={people} relationships={relationships} onLinkExisting={onLinkExisting} onCreateNew={() => {}} onCancel={() => {}} />)
  fireEvent.click(screen.getByText('Sibling'))
  fireEvent.change(screen.getByPlaceholderText('Search existing people…'), { target: { value: 'Priya' } })
  fireEvent.click(screen.getByText('Priya'))
  expect(onLinkExisting).toHaveBeenCalledWith('sibling', 'priya')
})

test('disables the Sibling option and shows a caption when the anchor has no recorded parents', () => {
  const onLinkExisting = vi.fn()
  render(<RelationshipPicker anchorPerson={anchor} people={people} relationships={[]} onLinkExisting={onLinkExisting} onCreateNew={() => {}} onCancel={() => {}} />)
  expect(screen.getByText('Add a parent first to add siblings.')).toBeInTheDocument()
  fireEvent.click(screen.getByText('Sibling'))
  fireEvent.change(screen.getByPlaceholderText('Search existing people…'), { target: { value: 'Priya' } })
  fireEvent.click(screen.getByText('Priya'))
  expect(onLinkExisting).not.toHaveBeenCalled()
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd client && npx vitest run src/components/picker/RelationshipPicker.test.tsx`
Expected: FAIL — `PickKind`/`TYPES`/`LABELS` don't include `'sibling'` yet, and `RelationshipPickerProps` doesn't accept `relationships` (TypeScript error).

- [ ] **Step 4: Add the Sibling type and disabled state**

In `client/src/components/picker/RelationshipPicker.tsx`, update the type and props:

```tsx
export type PickKind = 'parent' | 'child' | 'spouse' | 'sibling'

interface RelationshipPickerProps {
  anchorPerson: Person
  people: Person[]
  relationships: Relationship[]
  onLinkExisting: (kind: PickKind, personId: string) => void
  onCreateNew: (kind: PickKind, searchText: string) => void
  onCancel: () => void
}

const TYPES: PickKind[] = ['parent', 'child', 'spouse', 'sibling']
const LABELS: Record<PickKind, string> = { parent: 'Parent', child: 'Child', spouse: 'Spouse', sibling: 'Sibling' }
```

Add the import for `getParentIds` and the `Relationship` type:

```tsx
import type { Person, Relationship } from '../../types'
import { getParentIds } from '../../lib/familyGraph'
```

Update the function signature and add the disabled check:

```tsx
export function RelationshipPicker({ anchorPerson, people, relationships, onLinkExisting, onCreateNew, onCancel }: RelationshipPickerProps) {
  const [type, setType] = useState<PickKind>('parent')
  const [search, setSearch] = useState('')
  const anchorHasParents = getParentIds(anchorPerson.id, relationships).length > 0
```

Replace the type-row rendering:

```tsx
      <div className="rel-type-row">
        {TYPES.map((t) => {
          const disabled = t === 'sibling' && !anchorHasParents
          return (
            <div
              key={t}
              className={['rel-type', type === t ? 'selected' : '', disabled ? 'disabled' : ''].filter(Boolean).join(' ')}
              aria-disabled={disabled}
              onClick={() => { if (!disabled) setType(t) }}
            >
              {LABELS[t]}
            </div>
          )
        })}
      </div>
      {!anchorHasParents && <p className="callout">Add a parent first to add siblings.</p>}
```

- [ ] **Step 5: Add the disabled CSS**

In `client/src/styles/global.css`, add directly after the existing `.rel-type.selected` rule:

```css
.rel-type.disabled { opacity: .45; cursor: not-allowed; }
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd client && npx vitest run src/components/picker/RelationshipPicker.test.tsx`
Expected: PASS, full file green (existing 7 tests + 2 new ones).

- [ ] **Step 7: Commit**

```bash
git add client/src/components/picker/RelationshipPicker.tsx client/src/components/picker/RelationshipPicker.test.tsx client/src/styles/global.css
git commit -m "Add a Sibling option to the relationship picker"
```

---

### Task 4: Overridable heading/subheading/cancel label on RelationshipPicker

**Files:**
- Modify: `client/src/components/picker/RelationshipPicker.tsx`
- Modify: `client/src/components/picker/RelationshipPicker.test.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: `RelationshipPickerProps` gains optional `heading?: string`, `subheading?: string`, `cancelLabel?: string`, each defaulting to today's hardcoded text when omitted. Task 5 depends on these exact prop names and their default-when-omitted behavior — it passes them from `Panel`'s `picker` variant, which itself makes them optional (`undefined` when not set, i.e. every picker open except the post-first-parent nudge).

- [ ] **Step 1: Write the failing tests**

Add to `client/src/components/picker/RelationshipPicker.test.tsx`, after the disabled-sibling test from Task 3:

```tsx
test('heading, subheading, and cancel label can be overridden', () => {
  render(
    <RelationshipPicker
      anchorPerson={anchor}
      people={people}
      relationships={[]}
      onLinkExisting={() => {}}
      onCreateNew={() => {}}
      onCancel={() => {}}
      heading="Add Mother for Meera?"
      subheading="You just added Deepak as Meera's father."
      cancelLabel="Skip"
    />,
  )
  expect(screen.getByText('Add Mother for Meera?')).toBeInTheDocument()
  expect(screen.getByText("You just added Deepak as Meera's father.")).toBeInTheDocument()
  expect(screen.getByText('Skip')).toBeInTheDocument()
  expect(screen.queryByText('Cancel')).not.toBeInTheDocument()
})

test('falls back to the default heading, subheading, and Cancel label when not overridden', () => {
  render(<RelationshipPicker anchorPerson={anchor} people={people} relationships={[]} onLinkExisting={() => {}} onCreateNew={() => {}} onCancel={() => {}} />)
  expect(screen.getByText('Add relationship to Meera')).toBeInTheDocument()
  expect(screen.getByText('Choose the relationship type, then find or create the person.')).toBeInTheDocument()
  expect(screen.getByText('Cancel')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd client && npx vitest run src/components/picker/RelationshipPicker.test.tsx -t "heading, subheading"`
Expected: FAIL — `heading`/`subheading`/`cancelLabel` aren't accepted props yet, and the text they'd set isn't rendered.

- [ ] **Step 3: Add the overridable props**

In `client/src/components/picker/RelationshipPicker.tsx`, extend the props interface:

```tsx
interface RelationshipPickerProps {
  anchorPerson: Person
  people: Person[]
  relationships: Relationship[]
  onLinkExisting: (kind: PickKind, personId: string) => void
  onCreateNew: (kind: PickKind, searchText: string) => void
  onCancel: () => void
  heading?: string
  subheading?: string
  cancelLabel?: string
}
```

Destructure the new props:

```tsx
export function RelationshipPicker({
  anchorPerson,
  people,
  relationships,
  onLinkExisting,
  onCreateNew,
  onCancel,
  heading,
  subheading,
  cancelLabel,
}: RelationshipPickerProps) {
```

Replace the heading/subheading markup:

```tsx
      <div className="profile-name" style={{ fontSize: 18, marginBottom: 2 }}>
        {heading ?? `Add relationship to ${anchorPerson.first_name}`}
      </div>
      <p className="callout" style={{ marginBottom: 16 }}>{subheading ?? 'Choose the relationship type, then find or create the person.'}</p>
```

Replace the Cancel button:

```tsx
        <Button variant="ghost" onClick={onCancel}>{cancelLabel ?? 'Cancel'}</Button>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd client && npx vitest run src/components/picker/RelationshipPicker.test.tsx`
Expected: PASS, full file green (all tests from Tasks 3 and 4).

- [ ] **Step 5: Commit**

```bash
git add client/src/components/picker/RelationshipPicker.tsx client/src/components/picker/RelationshipPicker.test.tsx
git commit -m "Allow the relationship picker's heading, subheading, and cancel label to be overridden"
```

---

### Task 5: Wire sibling-linking and the second-parent nudge in App.tsx

**Files:**
- Modify: `client/src/App.tsx`
- Test: `client/src/App.test.tsx`

**Interfaces:**
- Consumes: `PickKind` (now including `'sibling'`) and `RelationshipPickerProps`'s `relationships`/`heading`/`subheading`/`cancelLabel` from Tasks 3-4; `getParentIds` from `client/src/lib/familyGraph.ts`; `parentRoleLabel` from `client/src/lib/relationshipLabels.ts` (Task 2).
- Produces: `refresh(): Promise<{ people: Person[]; relationships: Relationship[] }>` (was `Promise<void>`) — a project-internal change with three existing call sites, none of which need the return value except the new one added here.

- [ ] **Step 1: Write the failing tests**

Add to `client/src/App.test.tsx`, after the `'a duplicate-relationship error is translated into a friendly message'` test:

```tsx
test("adding a sibling links them to the anchor's existing parent, not the anchor", async () => {
  localStorage.setItem('vansh:passphrase', 'test-passphrase')
  ;(fetchPeople as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
    { id: 'meera', first_name: 'Meera', last_name: 'Gade', gender: null, birth_date: '1955', death_date: null, birth_place: null, occupation: null, bio: null, created_at: '', updated_at: '' },
    { id: 'anna', first_name: 'Anna', last_name: null, gender: 'Female', birth_date: null, death_date: null, birth_place: null, occupation: null, bio: null, created_at: '', updated_at: '' },
  ])
  ;(fetchRelationships as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
    { id: 'r1', type: 'parent-child', from_id: 'anna', to_id: 'meera' },
  ])
  render(<App />)
  await waitFor(() => expect(screen.getByText('Meera Gade')).toBeInTheDocument())

  fireEvent.click(screen.getByText('Meera Gade'))
  await waitFor(() => expect(screen.getByText('Add relationship')).toBeInTheDocument())
  fireEvent.click(screen.getByText('Add relationship'))
  await waitFor(() => expect(screen.getByText('Add relationship to Meera')).toBeInTheDocument())

  ;(addPerson as ReturnType<typeof vi.fn>).mockResolvedValueOnce('kiran-id')
  fireEvent.click(screen.getByText('Sibling'))
  fireEvent.change(screen.getByPlaceholderText('Search existing people…'), { target: { value: 'Kiran' } })
  fireEvent.click(screen.getByText('Create new person "Kiran"'))

  await waitFor(() => expect(addRelationship).toHaveBeenCalledWith('parent-child', 'anna', 'kiran-id'))
  expect(addRelationship).not.toHaveBeenCalledWith('parent-child', 'meera', 'kiran-id')
})

test('adding a first parent reopens the picker with a role-specific nudge; adding a second returns to the profile', async () => {
  localStorage.setItem('vansh:passphrase', 'test-passphrase')
  await openMeeraProfile()

  ;(addPerson as ReturnType<typeof vi.fn>).mockResolvedValueOnce('anna-id')
  ;(fetchPeople as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
    { id: 'meera', first_name: 'Meera', last_name: 'Gade', gender: null, birth_date: '1955', death_date: null, birth_place: null, occupation: null, bio: null, created_at: '', updated_at: '' },
    { id: 'anna-id', first_name: 'Anna', last_name: null, gender: 'Female', birth_date: null, death_date: null, birth_place: null, occupation: null, bio: null, created_at: '', updated_at: '' },
  ])
  ;(fetchRelationships as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
    { id: 'r1', type: 'parent-child', from_id: 'anna-id', to_id: 'meera' },
  ])

  fireEvent.click(screen.getByText('Add relationship'))
  await waitFor(() => expect(screen.getByText('Add relationship to Meera')).toBeInTheDocument())
  fireEvent.change(screen.getByPlaceholderText('Search existing people…'), { target: { value: 'Anna' } })
  fireEvent.click(screen.getByText('Create new person "Anna"'))

  // First parent added (Female → "mother"): nudged to add the father next, not dropped back to the profile.
  await waitFor(() => expect(screen.getByText('Add Father for Meera?')).toBeInTheDocument())
  expect(screen.queryByText('Edit Profile')).not.toBeInTheDocument()

  ;(addPerson as ReturnType<typeof vi.fn>).mockResolvedValueOnce('ravi-id')
  ;(fetchPeople as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
    { id: 'meera', first_name: 'Meera', last_name: 'Gade', gender: null, birth_date: '1955', death_date: null, birth_place: null, occupation: null, bio: null, created_at: '', updated_at: '' },
    { id: 'anna-id', first_name: 'Anna', last_name: null, gender: 'Female', birth_date: null, death_date: null, birth_place: null, occupation: null, bio: null, created_at: '', updated_at: '' },
    { id: 'ravi-id', first_name: 'Ravi', last_name: null, gender: 'Male', birth_date: null, death_date: null, birth_place: null, occupation: null, bio: null, created_at: '', updated_at: '' },
  ])
  ;(fetchRelationships as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
    { id: 'r1', type: 'parent-child', from_id: 'anna-id', to_id: 'meera' },
    { id: 'r2', type: 'parent-child', from_id: 'ravi-id', to_id: 'meera' },
  ])
  fireEvent.change(screen.getByPlaceholderText('Search existing people…'), { target: { value: 'Ravi' } })
  fireEvent.click(screen.getByText('Create new person "Ravi"'))

  // Second parent added: back to the profile, no further nudge.
  await waitFor(() => expect(screen.getByText('Edit Profile')).toBeInTheDocument())
  expect(screen.queryByText('Add Father for Meera?')).not.toBeInTheDocument()
  expect(screen.queryByText(/^Add .* for Meera\?$/)).not.toBeInTheDocument()
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd client && npx vitest run src/App.test.tsx -t "sibling"`
Run: `cd client && npx vitest run src/App.test.tsx -t "role-specific nudge"`
Expected: both FAIL — `'sibling'` isn't a handled `PickKind` in `handleLinkExisting` yet (falls into the `else` `'spouse'` branch), and no post-first-parent nudge exists yet (picker always closes straight to the profile).

- [ ] **Step 3: Add imports**

In `client/src/App.tsx`, add to the existing imports:

```tsx
import { getParentIds } from './lib/familyGraph'
import { parentRoleLabel } from './lib/relationshipLabels'
```

- [ ] **Step 4: Make `refresh()` return the fetched data**

Replace:

```tsx
  async function refresh() {
    setPeople(await fetchPeople())
    setRelationships(await fetchRelationships())
  }
```

with:

```tsx
  async function refresh() {
    const [newPeople, newRelationships] = await Promise.all([fetchPeople(), fetchRelationships()])
    setPeople(newPeople)
    setRelationships(newRelationships)
    return { people: newPeople, relationships: newRelationships }
  }
```

The three existing `await refresh()` call sites (none of which use the return value) are unaffected — ignoring a return value doesn't change their behavior. Do not modify those call sites.

- [ ] **Step 5: Widen the `Panel` type**

Replace:

```tsx
  | { kind: 'picker'; anchorId: string }
```

with:

```tsx
  | { kind: 'picker'; anchorId: string; heading?: string; subheading?: string; cancelLabel?: string }
```

- [ ] **Step 6: Add the sibling branch and the second-parent nudge to `handleLinkExisting`**

Replace:

```tsx
  async function handleLinkExisting(anchorId: string, kind: PickKind, otherId: string) {
    if (kind === 'parent') {
      // The picked/created person becomes the parent of the anchor.
      await addRelationship('parent-child', otherId, anchorId)
    } else if (kind === 'child') {
      // The anchor becomes the parent of the picked/created person.
      await addRelationship('parent-child', anchorId, otherId)
    } else {
      await addRelationship('spouse', anchorId, otherId)
    }
    await refresh()
    setPanel({ kind: 'profile', personId: anchorId })
  }
```

with:

```tsx
  async function handleLinkExisting(anchorId: string, kind: PickKind, otherId: string) {
    if (kind === 'parent') {
      // The picked/created person becomes the parent of the anchor.
      await addRelationship('parent-child', otherId, anchorId)
    } else if (kind === 'child') {
      // The anchor becomes the parent of the picked/created person.
      await addRelationship('parent-child', anchorId, otherId)
    } else if (kind === 'sibling') {
      // The picked/created person becomes a parent-child of each of the
      // anchor's own recorded parents (using relationships as it stood
      // before this add — the sibling link itself never changes the
      // anchor's own parents), making them a full or half sibling
      // depending on how many parents are already known.
      for (const parentId of getParentIds(anchorId, relationships)) {
        await addRelationship('parent-child', parentId, otherId)
      }
    } else {
      await addRelationship('spouse', anchorId, otherId)
    }

    const { people: freshPeople, relationships: freshRelationships } = await refresh()

    if (kind === 'parent') {
      const parentIds = getParentIds(anchorId, freshRelationships)
      if (parentIds.length === 1) {
        const addedPerson = freshPeople.find((p) => p.id === otherId)
        const anchorName = freshPeople.find((p) => p.id === anchorId)?.first_name ?? ''
        const addedRole = parentRoleLabel(addedPerson?.gender ?? null)
        const complementRole = addedPerson?.gender === 'Male' ? 'Mother' : addedPerson?.gender === 'Female' ? 'Father' : null
        setPanel({
          kind: 'picker',
          anchorId,
          heading: complementRole ? `Add ${complementRole} for ${anchorName}?` : `Add another parent for ${anchorName}?`,
          subheading: `You just added ${addedPerson?.first_name ?? 'them'} as ${anchorName}'s ${addedRole.toLowerCase()}. ${complementRole ? `Add their ${complementRole.toLowerCase()} now, or skip for later.` : 'Add another now, or skip for later.'}`,
          cancelLabel: 'Skip',
        })
        return
      }
    }

    setPanel({ kind: 'profile', personId: anchorId })
  }
```

- [ ] **Step 7: Pass the new props to `RelationshipPicker`, and force a fresh instance on reopen**

Replace:

```tsx
      {panel.kind === 'picker' && pickerAnchor && (
        <RelationshipPicker
          anchorPerson={pickerAnchor}
          people={people}
          onLinkExisting={(kind, personId) => {
```

with:

```tsx
      {panel.kind === 'picker' && pickerAnchor && (
        <RelationshipPicker
          key={panel.anchorId + (panel.heading ?? '')}
          anchorPerson={pickerAnchor}
          people={people}
          relationships={relationships}
          heading={panel.heading}
          subheading={panel.subheading}
          cancelLabel={panel.cancelLabel}
          onLinkExisting={(kind, personId) => {
```

(The `key` change matters: without it, reopening the picker for the second-parent nudge would reuse the same component instance — since it's the same JSX position/type on every render — leaving Task 4's internal `search` state showing the just-typed first parent's name instead of resetting for the nudge. Keying on `anchorId + heading` forces React to mount a fresh instance whenever the nudge's heading changes, while leaving ordinary same-anchor reopens with no heading override — the common case — unaffected.)

- [ ] **Step 8: Run tests to verify they pass**

Run: `cd client && npx vitest run src/App.test.tsx`
Expected: PASS, full file green (existing tests + the two new ones).

- [ ] **Step 9: Run the full client test suite**

Run: `cd client && npm test`
Expected: PASS, entire suite green — confirms no regressions from the `Panel` type widening, `refresh()` signature change, or `RelationshipPicker`'s new required `relationships` prop anywhere else in the app.

- [ ] **Step 10: Commit**

```bash
git add client/src/App.tsx client/src/App.test.tsx
git commit -m "Wire sibling-linking and the second-parent nudge into the write flow"
```

---

## Post-plan: session log

Per this repo's `CLAUDE.md` session-logging convention, append an entry to the active `docs/sessions/YYYY-MM-DD-*.md` file for today recording: the request (Spec 2a: guided relationship-adding flow), what was done (gender dropdown, gender-aware labels, Sibling picker option, second-parent nudge — Tasks 1-5), and the outcome (commit SHAs, tests passing, Spec 2b and Spec 3 still deferred).
