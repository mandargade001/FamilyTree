import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi } from 'vitest'

const mockListPhotos = vi.hoisted(() => vi.fn())
vi.mock('../../api/photos', () => ({ listPhotos: mockListPhotos }))

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

function noop() {}
function baseProps(overrides: Partial<Parameters<typeof PersonProfile>[0]> = {}) {
  return {
    person: meera,
    people,
    relationships,
    onEdit: noop,
    onAddRelationship: noop,
    onOpenPerson: noop,
    onCenterHere: noop,
    onDelete: noop,
    onClose: noop,
    onUploadPhoto: async () => ({ ok: true as const }),
    ...overrides,
  }
}

beforeEach(() => {
  mockListPhotos.mockReset()
  mockListPhotos.mockResolvedValue([])
})

test('renders name and available meta fields, omitting blank ones', () => {
  render(<PersonProfile {...baseProps()} />)
  expect(screen.getByText('Meera Gade')).toBeInTheDocument()
  expect(screen.getByText(/Pune, India/)).toBeInTheDocument()
  expect(screen.getByText(/Teacher/)).toBeInTheDocument()
})

test('lists relationship chips by role', () => {
  render(<PersonProfile {...baseProps()} />)
  expect(screen.getByText('Parent · Anna')).toBeInTheDocument()
  expect(screen.getByText('Child · Rohan')).toBeInTheDocument()
})

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

test('clicking a relationship chip opens that person', () => {
  const onOpenPerson = vi.fn()
  render(<PersonProfile {...baseProps({ onOpenPerson })} />)
  fireEvent.click(screen.getByText('Parent · Anna'))
  expect(onOpenPerson).toHaveBeenCalledWith('anna')
})

test('Edit Profile and Add relationship fire their callbacks', () => {
  const onEdit = vi.fn()
  const onAddRelationship = vi.fn()
  render(<PersonProfile {...baseProps({ onEdit, onAddRelationship })} />)
  fireEvent.click(screen.getByText('Edit Profile'))
  fireEvent.click(screen.getByText('Add relationship'))
  expect(onEdit).toHaveBeenCalledOnce()
  expect(onAddRelationship).toHaveBeenCalledOnce()
})

test('Center tree here calls onCenterHere', () => {
  const onCenterHere = vi.fn()
  render(<PersonProfile {...baseProps({ onCenterHere })} />)
  fireEvent.click(screen.getByText('Center tree here'))
  expect(onCenterHere).toHaveBeenCalledOnce()
})

test('clicking the close button calls onClose', () => {
  const onClose = vi.fn()
  render(<PersonProfile {...baseProps({ onClose })} />)
  fireEvent.click(screen.getByLabelText('Close profile'))
  expect(onClose).toHaveBeenCalledOnce()
})

test('Delete asks for confirmation showing the relationship count, and calls onDelete when confirmed', () => {
  const onDelete = vi.fn()
  const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
  render(<PersonProfile {...baseProps({ onDelete })} />)
  fireEvent.click(screen.getByText('Delete'))
  expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('2 relationships'))
  expect(onDelete).toHaveBeenCalledOnce()
  confirmSpy.mockRestore()
})

test('Delete does not call onDelete when the confirmation is declined', () => {
  const onDelete = vi.fn()
  const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
  render(<PersonProfile {...baseProps({ onDelete })} />)
  fireEvent.click(screen.getByText('Delete'))
  expect(onDelete).not.toHaveBeenCalled()
  confirmSpy.mockRestore()
})

test('uploading a photo calls onUploadPhoto and shows a success message', async () => {
  const onUploadPhoto = vi.fn().mockResolvedValue({ ok: true })
  const { container } = render(<PersonProfile {...baseProps({ onUploadPhoto })} />)
  const file = new File(['data'], 'photo.jpg', { type: 'image/jpeg' })
  const input = container.querySelector('input[type="file"]') as HTMLInputElement
  fireEvent.change(input, { target: { files: [file] } })
  expect(onUploadPhoto).toHaveBeenCalledWith(file)
  await waitFor(() => expect(screen.getByText('Photo uploaded.')).toBeInTheDocument())
})

test('uploading a photo shows an error message on failure', async () => {
  const onUploadPhoto = vi.fn().mockResolvedValue({ ok: false, message: 'incorrect passphrase' })
  const { container } = render(<PersonProfile {...baseProps({ onUploadPhoto })} />)
  const file = new File(['data'], 'photo.jpg', { type: 'image/jpeg' })
  const input = container.querySelector('input[type="file"]') as HTMLInputElement
  fireEvent.change(input, { target: { files: [file] } })
  await waitFor(() => expect(screen.getByText('incorrect passphrase')).toBeInTheDocument())
})

test('falls back to the placeholder icon and shows no gallery row when there are no photos', async () => {
  mockListPhotos.mockResolvedValue([])
  const { container } = render(<PersonProfile {...baseProps()} />)
  await waitFor(() => expect(mockListPhotos).toHaveBeenCalledWith('meera'))
  expect(container.querySelector('.gallery-row')).not.toBeInTheDocument()
  expect(container.querySelector('.profile-photo img')).not.toBeInTheDocument()
})

test('renders fetched photos as a gallery and uses the first as the profile photo', async () => {
  mockListPhotos.mockResolvedValue(['https://cdn.example/meera/a.jpg', 'https://cdn.example/meera/b.jpg'])
  const { container } = render(<PersonProfile {...baseProps()} />)
  await waitFor(() => expect(container.querySelectorAll('.gallery-thumb')).toHaveLength(2))
  const mainPhoto = container.querySelector('.profile-photo img') as HTMLImageElement
  expect(mainPhoto.src).toBe('https://cdn.example/meera/a.jpg')
})

test('a successful upload re-fetches and shows the new photo in the gallery', async () => {
  mockListPhotos.mockResolvedValueOnce([]).mockResolvedValueOnce(['https://cdn.example/meera/new.jpg'])
  const onUploadPhoto = vi.fn().mockResolvedValue({ ok: true })
  const { container } = render(<PersonProfile {...baseProps({ onUploadPhoto })} />)
  await waitFor(() => expect(mockListPhotos).toHaveBeenCalledTimes(1))

  const file = new File(['data'], 'photo.jpg', { type: 'image/jpeg' })
  const input = container.querySelector('input[type="file"]') as HTMLInputElement
  fireEvent.change(input, { target: { files: [file] } })

  await waitFor(() => expect(mockListPhotos).toHaveBeenCalledTimes(2))
  await waitFor(() => expect(container.querySelectorAll('.gallery-thumb')).toHaveLength(1))
})
