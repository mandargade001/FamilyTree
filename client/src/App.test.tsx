vi.mock('./api/people', () => ({
  fetchPeople: vi.fn().mockResolvedValue([
    { id: 'meera', first_name: 'Meera', last_name: 'Gade', gender: null, birth_date: '1955', death_date: null, birth_place: null, occupation: null, bio: null, created_at: '', updated_at: '' },
  ]),
  addPerson: vi.fn(),
  updatePerson: vi.fn(),
  deletePerson: vi.fn(),
}))
vi.mock('./api/relationships', () => ({
  fetchRelationships: vi.fn().mockResolvedValue([]),
  addRelationship: vi.fn(),
  deleteRelationship: vi.fn(),
}))
vi.mock('./lib/supabaseClient', () => ({
  supabase: { rpc: vi.fn(), from: vi.fn() },
}))

import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { beforeEach } from 'vitest'
import App from './App'
import { addPerson, updatePerson } from './api/people'

beforeEach(() => localStorage.clear())

async function openMeeraProfile() {
  render(<App />)
  await waitFor(() => expect(screen.getByText('Meera Gade')).toBeInTheDocument())
  fireEvent.click(screen.getByText('Meera Gade'))
  await waitFor(() => expect(screen.getByText('Edit Profile')).toBeInTheDocument())
}

test('loads people and relationships and renders the tree', async () => {
  render(<App />)
  await waitFor(() => expect(screen.getByText('Meera Gade')).toBeInTheDocument())
})

test('canceling the relationship picker returns to the profile, not a stuck state', async () => {
  // Bypass the passphrase gate so "Add relationship" opens the picker directly.
  localStorage.setItem('vansh:passphrase', 'test-passphrase')

  render(<App />)
  await waitFor(() => expect(screen.getByText('Meera Gade')).toBeInTheDocument())

  fireEvent.click(screen.getByText('Meera Gade'))
  await waitFor(() => expect(screen.getByText('Add relationship')).toBeInTheDocument())

  fireEvent.click(screen.getByText('Add relationship'))
  await waitFor(() => expect(screen.getByText('Add relationship to Meera')).toBeInTheDocument())

  fireEvent.click(screen.getByText('Cancel'))

  // Picker is gone, and we're back on Meera's profile — not stuck, not dropped to a blank screen.
  // (Both the tree and the profile panel render "Meera Gade" at once, so assert on
  // profile-specific content rather than the now-ambiguous name text.)
  expect(screen.queryByText('Add relationship to Meera')).not.toBeInTheDocument()
  expect(screen.getByText('Add relationship')).toBeInTheDocument()
  expect(screen.getByText('Edit Profile')).toBeInTheDocument()
})

test('editing a person and saving returns to that person\'s profile, not a bare tree', async () => {
  localStorage.setItem('vansh:passphrase', 'test-passphrase')
  await openMeeraProfile()

  fireEvent.click(screen.getByText('Edit Profile'))
  await waitFor(() => expect(screen.getByText('Edit Person')).toBeInTheDocument())
  expect(screen.getByDisplayValue('Meera')).toBeInTheDocument()

  fireEvent.click(screen.getByText('Save'))

  // Back on the profile, not stranded on the bare tree with no panel.
  await waitFor(() => expect(screen.getByText('Edit Profile')).toBeInTheDocument())
  expect(screen.queryByText('Edit Person')).not.toBeInTheDocument()
  expect(updatePerson).toHaveBeenCalledWith('meera', expect.objectContaining({ first_name: 'Meera' }))
})

test('canceling an edit returns to that person\'s profile, not a bare tree', async () => {
  localStorage.setItem('vansh:passphrase', 'test-passphrase')
  await openMeeraProfile()

  fireEvent.click(screen.getByText('Edit Profile'))
  await waitFor(() => expect(screen.getByText('Edit Person')).toBeInTheDocument())

  fireEvent.click(screen.getByText('Cancel'))

  // Back on the profile immediately (no async work involved in cancel).
  expect(screen.getByText('Edit Profile')).toBeInTheDocument()
  expect(screen.queryByText('Edit Person')).not.toBeInTheDocument()
})

test('a failed create-new-person round trip does not strand the UI or throw unhandled', async () => {
  localStorage.setItem('vansh:passphrase', 'test-passphrase')
  ;(addPerson as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('network down'))

  await openMeeraProfile()

  fireEvent.click(screen.getByText('Add relationship'))
  await waitFor(() => expect(screen.getByText('Add relationship to Meera')).toBeInTheDocument())

  fireEvent.change(screen.getByPlaceholderText('Search existing people…'), { target: { value: 'Nina' } })
  fireEvent.click(screen.getByText('Create new person "Nina"'))

  // While the (failing) create-new round trip is pending, no interactive form is
  // shown — only a non-interactive loading state, so there's nothing to submit or
  // cancel that could race with it.
  expect(screen.getByText('Creating person…')).toBeInTheDocument()
  expect(screen.queryByText('Save')).not.toBeInTheDocument()

  // Once the rejection is caught, the UI lands back on the anchor's profile
  // rather than being stuck on the loading state or throwing an unhandled rejection.
  await waitFor(() => expect(screen.getByText('Edit Profile')).toBeInTheDocument())
  expect(screen.queryByText('Creating person…')).not.toBeInTheDocument()
})
