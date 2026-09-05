import { render, screen, fireEvent } from '@testing-library/react'
import { PersonProfile } from './PersonProfile'
import type { Person, Relationship } from '../../types'

function person(id: string, first: string, extra: Partial<Person> = {}): Person {
  return { id, first_name: first, last_name: null, gender: null, birth_date: null, death_date: null, birth_place: null, occupation: null, bio: null, created_at: '', updated_at: '', ...extra }
}

const meera = person('meera', 'Meera', { last_name: 'Gade', birth_date: '1955', birth_place: 'Pune, India', occupation: 'Teacher' })
const people = [meera, person('anna', 'Anna'), person('rohan', 'Rohan')]
const relationships: Relationship[] = [
  { id: 'r1', type: 'parent-child', from_id: 'anna', to_id: 'meera' },
  { id: 'r2', type: 'parent-child', from_id: 'meera', to_id: 'rohan' },
]

test('renders name and available meta fields, omitting blank ones', () => {
  render(<PersonProfile person={meera} people={people} relationships={relationships} onEdit={() => {}} onAddRelationship={() => {}} onOpenPerson={() => {}} />)
  expect(screen.getByText('Meera Gade')).toBeInTheDocument()
  expect(screen.getByText(/Pune, India/)).toBeInTheDocument()
  expect(screen.getByText(/Teacher/)).toBeInTheDocument()
})

test('lists relationship chips by role', () => {
  render(<PersonProfile person={meera} people={people} relationships={relationships} onEdit={() => {}} onAddRelationship={() => {}} onOpenPerson={() => {}} />)
  expect(screen.getByText('Parent · Anna')).toBeInTheDocument()
  expect(screen.getByText('Child · Rohan')).toBeInTheDocument()
})

test('clicking a relationship chip opens that person', () => {
  const onOpenPerson = vi.fn()
  render(<PersonProfile person={meera} people={people} relationships={relationships} onEdit={() => {}} onAddRelationship={() => {}} onOpenPerson={onOpenPerson} />)
  fireEvent.click(screen.getByText('Parent · Anna'))
  expect(onOpenPerson).toHaveBeenCalledWith('anna')
})

test('Edit Profile and Add relationship fire their callbacks', () => {
  const onEdit = vi.fn()
  const onAddRelationship = vi.fn()
  render(<PersonProfile person={meera} people={people} relationships={relationships} onEdit={onEdit} onAddRelationship={onAddRelationship} onOpenPerson={() => {}} />)
  fireEvent.click(screen.getByText('Edit Profile'))
  fireEvent.click(screen.getByText('Add relationship'))
  expect(onEdit).toHaveBeenCalledOnce()
  expect(onAddRelationship).toHaveBeenCalledOnce()
})
