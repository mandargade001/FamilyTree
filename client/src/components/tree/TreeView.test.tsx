import { render, screen, fireEvent } from '@testing-library/react'
import { TreeView } from './TreeView'
import type { Person, Relationship } from '../../types'

function person(id: string, first: string): Person {
  return {
    id, first_name: first, last_name: null, gender: null, birth_date: null,
    death_date: null, birth_place: null, occupation: null, bio: null,
    created_at: '', updated_at: '',
  }
}

const people = [person('anna', 'Anna'), person('ravi', 'Ravi'), person('meera', 'Meera'), person('sanjay', 'Sanjay'), person('deepak', 'Deepak')]
const relationships: Relationship[] = [
  { id: 'r1', type: 'spouse', from_id: 'anna', to_id: 'ravi' },
  { id: 'r2', type: 'parent-child', from_id: 'anna', to_id: 'meera' },
  { id: 'r3', type: 'parent-child', from_id: 'ravi', to_id: 'meera' },
  { id: 'r4', type: 'parent-child', from_id: 'anna', to_id: 'sanjay' },
  { id: 'r5', type: 'parent-child', from_id: 'ravi', to_id: 'sanjay' },
  { id: 'r6', type: 'parent-child', from_id: 'anna', to_id: 'deepak' },
  { id: 'r7', type: 'parent-child', from_id: 'ravi', to_id: 'deepak' },
]

test('renders the focal person and their parent couple', () => {
  render(<TreeView people={people} relationships={relationships} focalId="meera" onAddParent={() => {}} onOpenProfile={() => {}} />)
  expect(screen.getByText('Meera')).toBeInTheDocument()
  expect(screen.getByText('Anna')).toBeInTheDocument()
  expect(screen.getByText('Ravi')).toBeInTheDocument()
})

test('siblings start collapsed behind a flap showing the correct count', () => {
  render(<TreeView people={people} relationships={relationships} focalId="meera" onAddParent={() => {}} onOpenProfile={() => {}} />)
  expect(screen.getByText('2 siblings')).toBeInTheDocument()
  expect(screen.queryByText('Sanjay')).not.toBeInTheDocument()
})

test('clicking the sibling flap reveals the siblings', () => {
  render(<TreeView people={people} relationships={relationships} focalId="meera" onAddParent={() => {}} onOpenProfile={() => {}} />)
  fireEvent.click(screen.getByText('2 siblings'))
  expect(screen.getByText('Sanjay')).toBeInTheDocument()
  expect(screen.getByText('Deepak')).toBeInTheDocument()
})

test('shows an Add Parent slot above a person with no recorded parents', () => {
  render(<TreeView people={people} relationships={relationships} focalId="meera" onAddParent={() => {}} onOpenProfile={() => {}} />)
  // Anna and Ravi are both parentless in this fixture, so both members of the
  // couple independently get their own slot.
  expect(screen.getAllByText('Add Parent')).toHaveLength(2)
})

test('clicking an Add Parent slot calls onAddParent with that specific person', () => {
  const onAddParent = vi.fn()
  render(<TreeView people={people} relationships={relationships} focalId="meera" onAddParent={onAddParent} onOpenProfile={() => {}} />)
  const addParentButtons = screen.getAllByText('Add Parent')
  fireEvent.click(addParentButtons[0])
  expect(onAddParent).toHaveBeenCalledWith('anna')
})

test("renders the focal person's own children by default, below them", () => {
  const withChild = [...people, person('rohan', 'Rohan')]
  const relsWithChild: Relationship[] = [...relationships, { id: 'r8', type: 'parent-child', from_id: 'meera', to_id: 'rohan' }]
  render(<TreeView people={withChild} relationships={relsWithChild} focalId="meera" onAddParent={() => {}} onOpenProfile={() => {}} />)
  expect(screen.getByText('Rohan')).toBeInTheDocument()
})

test("a child's own children stay collapsed behind a toggle until clicked", () => {
  const withGrandchild = [...people, person('rohan', 'Rohan'), person('aditi', 'Aditi')]
  const relsWithGrandchild: Relationship[] = [
    ...relationships,
    { id: 'r8', type: 'parent-child', from_id: 'meera', to_id: 'rohan' },
    { id: 'r9', type: 'parent-child', from_id: 'rohan', to_id: 'aditi' },
  ]
  render(<TreeView people={withGrandchild} relationships={relsWithGrandchild} focalId="meera" onAddParent={() => {}} onOpenProfile={() => {}} />)
  expect(screen.queryByText('Aditi')).not.toBeInTheDocument()
  fireEvent.click(screen.getByLabelText('Show Rohan’s children'))
  expect(screen.getByText('Aditi')).toBeInTheDocument()
})

test('shows an Add Parent slot for a shallower person even when another lineage traces back further', () => {
  // Ravi's parents (RaviDad & RaviMom) are recorded, pushing that lineage to
  // depth 2 and making it the tree's deepest row — but Anna's parents are not
  // recorded. Anna sits at the shallower depth 1, and must still get her own
  // Add Parent slot rather than only whoever is at the single deepest row.
  // RaviDad and RaviMom, each having no recorded parents of their own,
  // independently get a slot too: three total, one per parentless person.
  const asymmetricPeople = [...people, person('ravi_dad', 'RaviDad'), person('ravi_mom', 'RaviMom')]
  const asymmetricRelationships: Relationship[] = [
    ...relationships,
    { id: 'r8', type: 'spouse', from_id: 'ravi_dad', to_id: 'ravi_mom' },
    { id: 'r9', type: 'parent-child', from_id: 'ravi_dad', to_id: 'ravi' },
    { id: 'r10', type: 'parent-child', from_id: 'ravi_mom', to_id: 'ravi' },
  ]
  const onAddParent = vi.fn()
  render(<TreeView people={asymmetricPeople} relationships={asymmetricRelationships} focalId="meera" onAddParent={onAddParent} onOpenProfile={() => {}} />)
  const addParentButtons = screen.getAllByText('Add Parent')
  expect(addParentButtons).toHaveLength(3)
  addParentButtons.forEach((button) => fireEvent.click(button))
  expect(onAddParent).toHaveBeenCalledWith('anna')
  expect(onAddParent).toHaveBeenCalledWith('ravi_dad')
  expect(onAddParent).toHaveBeenCalledWith('ravi_mom')
  expect(onAddParent).not.toHaveBeenCalledWith('ravi')
})

test('shows an Add Parent slot for the spouse side of a couple, not just the anchor', () => {
  // Give Anna (the row unit's anchor, per relationship ordering) her own
  // recorded parents, while Ravi (her spouse in the unit) stays parentless.
  // Only Ravi should get a slot — proving the check isn't anchored to
  // unit.personId alone.
  const spousePeople = [...people, person('anna_dad', 'AnnaDad'), person('anna_mom', 'AnnaMom')]
  const spouseRelationships: Relationship[] = [
    ...relationships,
    { id: 'r8', type: 'spouse', from_id: 'anna_dad', to_id: 'anna_mom' },
    { id: 'r9', type: 'parent-child', from_id: 'anna_dad', to_id: 'anna' },
    { id: 'r10', type: 'parent-child', from_id: 'anna_mom', to_id: 'anna' },
  ]
  const onAddParent = vi.fn()
  render(<TreeView people={spousePeople} relationships={spouseRelationships} focalId="meera" onAddParent={onAddParent} onOpenProfile={() => {}} />)
  screen.getAllByText('Add Parent').forEach((button) => fireEvent.click(button))
  expect(onAddParent).toHaveBeenCalledWith('ravi')
  expect(onAddParent).not.toHaveBeenCalledWith('anna')
})

test('shows a sibling flap for the spouse side of a couple, not just the anchor', () => {
  // Ravi (the unit's spouse, not the anchor Anna) has his own recorded
  // parent and sibling — Anna has none of her own. Only Ravi should get a
  // sibling flap, proving the check isn't anchored to unit.personId alone.
  const siblingSpousePeople = [...people, person('ravi_parent', 'RaviParent'), person('ravi_sibling', 'RaviSibling')]
  const siblingSpouseRelationships: Relationship[] = [
    ...relationships,
    { id: 'r8', type: 'parent-child', from_id: 'ravi_parent', to_id: 'ravi' },
    { id: 'r9', type: 'parent-child', from_id: 'ravi_parent', to_id: 'ravi_sibling' },
  ]
  render(<TreeView people={siblingSpousePeople} relationships={siblingSpouseRelationships} focalId="meera" onAddParent={() => {}} onOpenProfile={() => {}} />)
  expect(screen.getByText('1 sibling')).toBeInTheDocument()
  fireEvent.click(screen.getByText('1 sibling'))
  expect(screen.getByText('RaviSibling')).toBeInTheDocument()
})
