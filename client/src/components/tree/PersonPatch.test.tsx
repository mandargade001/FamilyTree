import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { PersonPatch } from './PersonPatch'
import type { Person } from '../../types'

const mockGetPrimaryPhoto = vi.fn()
vi.mock('../../api/photos', () => ({ getPrimaryPhoto: (...args: unknown[]) => mockGetPrimaryPhoto(...args) }))

const meera: Person = {
  id: 'meera', first_name: 'Meera', last_name: 'Gade', gender: null,
  birth_date: '1955', death_date: null, birth_place: null, occupation: null, bio: null,
  created_at: '', updated_at: '',
}

beforeEach(() => {
  mockGetPrimaryPhoto.mockReset()
  mockGetPrimaryPhoto.mockResolvedValue(null)
})

test('renders the name and birth-death years', () => {
  render(<PersonPatch person={meera} inFocus={false} dimmed={false} fresh={false} onOpen={() => {}} onDoubleOpen={() => {}} />)
  expect(screen.getByText('Meera Gade')).toBeInTheDocument()
  expect(screen.getByText('b. 1955')).toBeInTheDocument()
})

test('a lone click fires onOpen after the debounce window, with no onDoubleOpen', async () => {
  vi.useFakeTimers()
  try {
    const onOpen = vi.fn()
    const onDoubleOpen = vi.fn()
    render(<PersonPatch person={meera} inFocus={false} dimmed={false} fresh={false} onOpen={onOpen} onDoubleOpen={onDoubleOpen} />)
    const patch = screen.getByText('Meera Gade').closest('.patch')!
    fireEvent.click(patch)
    expect(onOpen).not.toHaveBeenCalled()
    await act(async () => { await vi.advanceTimersByTimeAsync(250) })
    expect(onOpen).toHaveBeenCalledWith('meera')
    expect(onDoubleOpen).not.toHaveBeenCalled()
  } finally {
    vi.useRealTimers()
  }
})

test('a real double-click (click, click, dblclick) fires only onDoubleOpen, never onOpen', async () => {
  // A real browser dispatches `click` twice before `dblclick` — model that
  // sequence directly (fireEvent.doubleClick alone only dispatches a lone
  // `dblclick` and would not exercise the debounce/cancel logic at all).
  vi.useFakeTimers()
  try {
    const onOpen = vi.fn()
    const onDoubleOpen = vi.fn()
    render(<PersonPatch person={meera} inFocus={false} dimmed={false} fresh={false} onOpen={onOpen} onDoubleOpen={onDoubleOpen} />)
    const patch = screen.getByText('Meera Gade').closest('.patch')!
    fireEvent.click(patch)
    fireEvent.click(patch)
    fireEvent.doubleClick(patch)
    expect(onDoubleOpen).toHaveBeenCalledWith('meera')
    await act(async () => { await vi.advanceTimersByTimeAsync(500) })
    expect(onOpen).not.toHaveBeenCalled()
  } finally {
    vi.useRealTimers()
  }
})

test('shows the fresh-stitch badge only when fresh is true', () => {
  const { rerender } = render(<PersonPatch person={meera} inFocus={false} dimmed={false} fresh={true} onOpen={() => {}} onDoubleOpen={() => {}} />)
  expect(document.querySelector('.fresh-badge')).toBeInTheDocument()
  rerender(<PersonPatch person={meera} inFocus={false} dimmed={false} fresh={false} onOpen={() => {}} onDoubleOpen={() => {}} />)
  expect(document.querySelector('.fresh-badge')).not.toBeInTheDocument()
})

test('shows the placeholder icon when the person has no photo', async () => {
  render(<PersonPatch person={meera} inFocus={false} dimmed={false} fresh={false} onOpen={() => {}} onDoubleOpen={() => {}} />)
  await waitFor(() => expect(mockGetPrimaryPhoto).toHaveBeenCalledWith('meera'))
  expect(document.querySelector('.thumb img')).not.toBeInTheDocument()
})

test('shows the fetched photo as a circular thumbnail when one exists', async () => {
  mockGetPrimaryPhoto.mockResolvedValue('https://cdn.example/meera/photo.jpg')
  render(<PersonPatch person={meera} inFocus={false} dimmed={false} fresh={false} onOpen={() => {}} onDoubleOpen={() => {}} />)
  await waitFor(() => expect(document.querySelector('.thumb img')).toBeInTheDocument())
  expect(document.querySelector('.thumb img')).toHaveAttribute('src', 'https://cdn.example/meera/photo.jpg')
})
