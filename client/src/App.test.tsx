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

beforeEach(() => localStorage.clear())

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
