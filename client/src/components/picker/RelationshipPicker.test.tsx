import { render, screen, fireEvent } from '@testing-library/react'
import { RelationshipPicker } from './RelationshipPicker'
import type { Person } from '../../types'

function person(id: string, first: string): Person {
  return { id, first_name: first, last_name: null, gender: null, birth_date: null, death_date: null, birth_place: null, occupation: null, bio: null, created_at: '', updated_at: '' }
}

const anchor = person('meera', 'Meera')
const people = [anchor, person('deepak', 'Deepak'), person('priya', 'Priya')]

test('filters the result list as the search text changes', () => {
  render(<RelationshipPicker anchorPerson={anchor} people={people} onLinkExisting={() => {}} onCreateNew={() => {}} onCancel={() => {}} />)
  fireEvent.change(screen.getByPlaceholderText('Search existing people…'), { target: { value: 'Dee' } })
  expect(screen.getByText('Deepak')).toBeInTheDocument()
  expect(screen.queryByText('Priya')).not.toBeInTheDocument()
})

test('never shows the anchor person as a result', () => {
  render(<RelationshipPicker anchorPerson={anchor} people={people} onLinkExisting={() => {}} onCreateNew={() => {}} onCancel={() => {}} />)
  fireEvent.change(screen.getByPlaceholderText('Search existing people…'), { target: { value: 'Meera' } })
  expect(screen.queryByText('Meera')).not.toBeInTheDocument()
})

test('clicking a result calls onLinkExisting with the selected relationship type', () => {
  const onLinkExisting = vi.fn()
  render(<RelationshipPicker anchorPerson={anchor} people={people} onLinkExisting={onLinkExisting} onCreateNew={() => {}} onCancel={() => {}} />)
  fireEvent.click(screen.getByText('Spouse'))
  fireEvent.change(screen.getByPlaceholderText('Search existing people…'), { target: { value: 'Priya' } })
  fireEvent.click(screen.getByText('Priya'))
  expect(onLinkExisting).toHaveBeenCalledWith('spouse', 'priya')
})

test('shows a create-new row with the current search text', () => {
  render(<RelationshipPicker anchorPerson={anchor} people={people} onLinkExisting={() => {}} onCreateNew={() => {}} onCancel={() => {}} />)
  fireEvent.change(screen.getByPlaceholderText('Search existing people…'), { target: { value: 'Kiran' } })
  expect(screen.getByText('Create new person "Kiran"')).toBeInTheDocument()
})

test('clicking Cancel calls onCancel', () => {
  const onCancel = vi.fn()
  render(<RelationshipPicker anchorPerson={anchor} people={people} onLinkExisting={() => {}} onCreateNew={() => {}} onCancel={onCancel} />)
  fireEvent.click(screen.getByText('Cancel'))
  expect(onCancel).toHaveBeenCalled()
})
