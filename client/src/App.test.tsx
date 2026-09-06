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
  addRelationship: vi.fn().mockResolvedValue('new-rel-id'),
  deleteRelationship: vi.fn(),
}))
vi.mock('./api/photos', () => ({
  uploadPhoto: vi.fn(),
}))
vi.mock('./lib/supabaseClient', () => ({
  supabase: { rpc: vi.fn(), from: vi.fn() },
}))

import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { beforeEach } from 'vitest'
import App from './App'
import { addPerson, updatePerson, fetchPeople, deletePerson } from './api/people'
import { addRelationship } from './api/relationships'

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

test('shows a persistent Add Person button once the tree has people, opening the add-person form', async () => {
  localStorage.setItem('vansh:passphrase', 'test-passphrase')
  render(<App />)
  await waitFor(() => expect(screen.getByText('Meera Gade')).toBeInTheDocument())

  fireEvent.click(screen.getAllByText('Add Person')[0])
  await waitFor(() => expect(screen.getByText('Save')).toBeInTheDocument())
})

test('picking Child on the relationship picker makes the anchor the parent', async () => {
  localStorage.setItem('vansh:passphrase', 'test-passphrase')
  ;(addPerson as ReturnType<typeof vi.fn>).mockResolvedValueOnce('rohan-id')
  await openMeeraProfile()

  fireEvent.click(screen.getByText('Add relationship'))
  await waitFor(() => expect(screen.getByText('Add relationship to Meera')).toBeInTheDocument())

  fireEvent.click(screen.getByText('Child'))
  fireEvent.change(screen.getByPlaceholderText('Search existing people…'), { target: { value: 'Rohan' } })
  fireEvent.click(screen.getByText('Create new person "Rohan"'))

  await waitFor(() =>
    expect(addRelationship).toHaveBeenCalledWith('parent-child', 'meera', expect.any(String)),
  )
})

test('picking Parent on the relationship picker makes the picked person the parent of the anchor', async () => {
  localStorage.setItem('vansh:passphrase', 'test-passphrase')
  ;(addPerson as ReturnType<typeof vi.fn>).mockResolvedValueOnce('ravi-id')
  await openMeeraProfile()

  fireEvent.click(screen.getByText('Add relationship'))
  await waitFor(() => expect(screen.getByText('Add relationship to Meera')).toBeInTheDocument())

  // 'Parent' is the default selected type.
  fireEvent.change(screen.getByPlaceholderText('Search existing people…'), { target: { value: 'Ravi' } })
  fireEvent.click(screen.getByText('Create new person "Ravi"'))

  await waitFor(() =>
    expect(addRelationship).toHaveBeenCalledWith('parent-child', expect.any(String), 'meera'),
  )
})

test('shows a distinct load-failure state on fetch failure, not the empty-tree state', async () => {
  ;(fetchPeople as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('network down'))
  render(<App />)
  await waitFor(() => expect(screen.getByText(/Couldn't load your family tree/)).toBeInTheDocument())
  expect(screen.queryByText('Add the first person')).not.toBeInTheDocument()
})

test('a failed save shows an inline error and keeps the form open', async () => {
  localStorage.setItem('vansh:passphrase', 'test-passphrase')
  ;(updatePerson as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('validation failed'))
  await openMeeraProfile()

  fireEvent.click(screen.getByText('Edit Profile'))
  await waitFor(() => expect(screen.getByText('Edit Person')).toBeInTheDocument())
  fireEvent.click(screen.getByText('Save'))

  await waitFor(() => expect(screen.getByText('validation failed')).toBeInTheDocument())
  // Form is still open — the save failure didn't silently discard the edit.
  expect(screen.getByText('Edit Person')).toBeInTheDocument()
})

test('an incorrect-passphrase write failure clears the stored passphrase and reopens the gate', async () => {
  localStorage.setItem('vansh:passphrase', 'stale-passphrase')
  ;(updatePerson as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('incorrect passphrase'))
  await openMeeraProfile()

  fireEvent.click(screen.getByText('Edit Profile'))
  await waitFor(() => expect(screen.getByText('Edit Person')).toBeInTheDocument())
  fireEvent.click(screen.getByText('Save'))

  await waitFor(() => expect(screen.getByText('Enter the family passphrase')).toBeInTheDocument())
  expect(localStorage.getItem('vansh:passphrase')).toBeNull()
})

test('Center tree here re-roots the tree on that person', async () => {
  localStorage.setItem('vansh:passphrase', 'test-passphrase')
  ;(fetchPeople as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
    { id: 'meera', first_name: 'Meera', last_name: 'Gade', gender: null, birth_date: '1955', death_date: null, birth_place: null, occupation: null, bio: null, created_at: '2020-01-01', updated_at: '' },
    { id: 'anna', first_name: 'Anna', last_name: null, gender: null, birth_date: null, death_date: null, birth_place: null, occupation: null, bio: null, created_at: '2020-01-02', updated_at: '' },
  ])
  render(<App />)
  await waitFor(() => expect(screen.getByText('Meera Gade')).toBeInTheDocument())

  fireEvent.click(screen.getByText('Meera Gade'))
  await waitFor(() => expect(screen.getByText('Center tree here')).toBeInTheDocument())
  fireEvent.click(screen.getByText('Center tree here'))

  // Re-rooting doesn't throw and the app keeps rendering (Meera's profile stays open).
  expect(screen.getByText('Edit Profile')).toBeInTheDocument()
})

test('creating a standalone person via + Add Person navigates to their own profile', async () => {
  localStorage.setItem('vansh:passphrase', 'test-passphrase')
  ;(addPerson as ReturnType<typeof vi.fn>).mockResolvedValueOnce('nina-id')

  render(<App />)
  await waitFor(() => expect(screen.getByText('Meera Gade')).toBeInTheDocument())

  // Only the post-create refresh (inside handleSavePerson) should see Nina —
  // the initial mount load above already consumed the module's default value.
  ;(fetchPeople as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
    { id: 'meera', first_name: 'Meera', last_name: 'Gade', gender: null, birth_date: '1955', death_date: null, birth_place: null, occupation: null, bio: null, created_at: '', updated_at: '' },
    { id: 'nina-id', first_name: 'Nina', last_name: null, gender: null, birth_date: null, death_date: null, birth_place: null, occupation: null, bio: null, created_at: '', updated_at: '' },
  ])

  fireEvent.click(screen.getAllByText('Add Person')[0])
  await waitFor(() => expect(screen.getByText('Save')).toBeInTheDocument())

  fireEvent.change(screen.getByLabelText(/First name/), { target: { value: 'Nina' } })
  fireEvent.click(screen.getByText('Save'))

  // Landed on Nina's own profile, not a bare tree — otherwise she'd be an
  // orphan only reachable later via another person's relationship-picker search.
  await waitFor(() => expect(screen.getByText('Edit Profile')).toBeInTheDocument())
  expect(addPerson).toHaveBeenCalledWith(expect.objectContaining({ first_name: 'Nina' }))
  expect(screen.getAllByText('Nina').length).toBeGreaterThan(0)
})

test('a duplicate-relationship error is translated into a friendly message', async () => {
  localStorage.setItem('vansh:passphrase', 'test-passphrase')
  ;(addRelationship as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
    new Error('duplicate key value violates unique constraint "relationships_unique_edge"'),
  )
  await openMeeraProfile()

  fireEvent.click(screen.getByText('Add relationship'))
  await waitFor(() => expect(screen.getByText('Add relationship to Meera')).toBeInTheDocument())
  fireEvent.change(screen.getByPlaceholderText('Search existing people…'), { target: { value: 'Nina' } })
  fireEvent.click(screen.getByText('Create new person "Nina"'))

  await waitFor(() => expect(screen.getByText("They're already linked that way.")).toBeInTheDocument())
  expect(screen.queryByText(/duplicate key value violates/)).not.toBeInTheDocument()
})

test('a "person not found" error is translated into a friendly message', async () => {
  localStorage.setItem('vansh:passphrase', 'test-passphrase')
  ;(updatePerson as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('person not found'))
  await openMeeraProfile()

  fireEvent.click(screen.getByText('Edit Profile'))
  await waitFor(() => expect(screen.getByText('Edit Person')).toBeInTheDocument())
  fireEvent.click(screen.getByText('Save'))

  await waitFor(() => expect(screen.getByText('That record no longer exists — try reloading.')).toBeInTheDocument())
  expect(screen.queryByText('person not found')).not.toBeInTheDocument()
})

test('viewing a profile for a person removed from the list (e.g. deleted in another tab) falls back instead of crashing', async () => {
  localStorage.setItem('vansh:passphrase', 'test-passphrase')
  // Priya first so she becomes the initial focal person (and thus renders as
  // her own tree patch, depth-0, even with no recorded relationships yet).
  ;(fetchPeople as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
    { id: 'priya', first_name: 'Priya', last_name: null, gender: null, birth_date: null, death_date: null, birth_place: null, occupation: null, bio: null, created_at: '', updated_at: '' },
    { id: 'meera', first_name: 'Meera', last_name: 'Gade', gender: null, birth_date: '1955', death_date: null, birth_place: null, occupation: null, bio: null, created_at: '', updated_at: '' },
  ])
  render(<App />)
  await waitFor(() => expect(screen.getByText('Priya')).toBeInTheDocument())

  fireEvent.click(screen.getByText('Priya'))
  await waitFor(() => expect(screen.getByText('Edit Profile')).toBeInTheDocument())

  // Simulate another tab deleting Priya: the next refresh (triggered here by
  // linking Meera as her spouse) returns a list that no longer contains her.
  ;(fetchPeople as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
    { id: 'meera', first_name: 'Meera', last_name: 'Gade', gender: null, birth_date: '1955', death_date: null, birth_place: null, occupation: null, bio: null, created_at: '', updated_at: '' },
  ])

  fireEvent.click(screen.getByText('Add relationship'))
  await waitFor(() => expect(screen.getByText('Add relationship to Priya')).toBeInTheDocument())
  fireEvent.click(screen.getByText('Spouse'))
  fireEvent.change(screen.getByPlaceholderText('Search existing people…'), { target: { value: 'Meera' } })
  fireEvent.click(screen.getByText('Meera Gade'))

  // handleLinkExisting refreshes (Priya is now gone) then tries to set the
  // panel back to Priya's profile — this must not crash, and must fall back
  // to a sane panel instead of rendering a dead profile off a stale id.
  await waitFor(() => expect(screen.queryByText('Edit Profile')).not.toBeInTheDocument())
  // The app is still alive and rendering normally (not a blank crashed page).
  expect(screen.getByText('Add Person')).toBeInTheDocument()
})

test('deleting the focal person returns to the bare tree view', async () => {
  localStorage.setItem('vansh:passphrase', 'test-passphrase')
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  ;(deletePerson as ReturnType<typeof vi.fn>).mockResolvedValueOnce(undefined)
  await openMeeraProfile()

  // Only the post-delete refetch (inside handleDeletePerson) should see an
  // empty list — the initial mount load above already consumed the module's
  // default resolved value.
  ;(fetchPeople as ReturnType<typeof vi.fn>).mockResolvedValueOnce([])

  fireEvent.click(screen.getByText('Delete'))
  await waitFor(() => expect(deletePerson).toHaveBeenCalledWith('meera'))
  await waitFor(() => expect(screen.queryByText('Edit Profile')).not.toBeInTheDocument())
})
