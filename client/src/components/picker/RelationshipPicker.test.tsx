import { render, screen, fireEvent } from '@testing-library/react'
import { RelationshipPicker } from './RelationshipPicker'
import type { Person, Relationship } from '../../types'

function person(id: string, first: string, last: string | null = null): Person {
  return { id, first_name: first, last_name: last, gender: null, birth_date: null, death_date: null, birth_place: null, occupation: null, bio: null, created_at: '', updated_at: '' }
}

const anchor = person('meera', 'Meera')
const people = [anchor, person('deepak', 'Deepak'), person('priya', 'Priya'), person('rakesh', 'Rakesh', 'Verma')]

test('filters the result list as the search text changes', () => {
  render(<RelationshipPicker anchorPerson={anchor} people={people} relationships={[]} onLinkExisting={() => {}} onCreateNew={() => {}} onCancel={() => {}} />)
  fireEvent.change(screen.getByPlaceholderText('Search existing people…'), { target: { value: 'Dee' } })
  expect(screen.getByText('Deepak')).toBeInTheDocument()
  expect(screen.queryByText('Priya')).not.toBeInTheDocument()
})

test('never shows the anchor person as a result', () => {
  render(<RelationshipPicker anchorPerson={anchor} people={people} relationships={[]} onLinkExisting={() => {}} onCreateNew={() => {}} onCancel={() => {}} />)
  fireEvent.change(screen.getByPlaceholderText('Search existing people…'), { target: { value: 'Meera' } })
  expect(screen.queryByText('Meera')).not.toBeInTheDocument()
})

test('clicking a result calls onLinkExisting with the selected relationship type', () => {
  const onLinkExisting = vi.fn()
  render(<RelationshipPicker anchorPerson={anchor} people={people} relationships={[]} onLinkExisting={onLinkExisting} onCreateNew={() => {}} onCancel={() => {}} />)
  fireEvent.click(screen.getByText('Spouse'))
  fireEvent.change(screen.getByPlaceholderText('Search existing people…'), { target: { value: 'Priya' } })
  fireEvent.click(screen.getByText('Priya'))
  expect(onLinkExisting).toHaveBeenCalledWith('spouse', 'priya')
})

test('offers a Child option that calls onLinkExisting with kind "child"', () => {
  const onLinkExisting = vi.fn()
  render(<RelationshipPicker anchorPerson={anchor} people={people} relationships={[]} onLinkExisting={onLinkExisting} onCreateNew={() => {}} onCancel={() => {}} />)
  fireEvent.click(screen.getByText('Child'))
  fireEvent.change(screen.getByPlaceholderText('Search existing people…'), { target: { value: 'Priya' } })
  fireEvent.click(screen.getByText('Priya'))
  expect(onLinkExisting).toHaveBeenCalledWith('child', 'priya')
})

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

test('shows a create-new row with the current search text', () => {
  render(<RelationshipPicker anchorPerson={anchor} people={people} relationships={[]} onLinkExisting={() => {}} onCreateNew={() => {}} onCancel={() => {}} />)
  fireEvent.change(screen.getByPlaceholderText('Search existing people…'), { target: { value: 'Kiran' } })
  expect(screen.getByText('Create new person "Kiran"')).toBeInTheDocument()
})

test('searching by last name finds the matching person', () => {
  render(<RelationshipPicker anchorPerson={anchor} people={people} relationships={[]} onLinkExisting={() => {}} onCreateNew={() => {}} onCancel={() => {}} />)
  fireEvent.change(screen.getByPlaceholderText('Search existing people…'), { target: { value: 'Verma' } })
  expect(screen.getByText('Rakesh Verma')).toBeInTheDocument()
  expect(screen.queryByText('Deepak')).not.toBeInTheDocument()
})

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

test('clicking Cancel calls onCancel', () => {
  const onCancel = vi.fn()
  render(<RelationshipPicker anchorPerson={anchor} people={people} relationships={[]} onLinkExisting={() => {}} onCreateNew={() => {}} onCancel={onCancel} />)
  fireEvent.click(screen.getByText('Cancel'))
  expect(onCancel).toHaveBeenCalled()
})
