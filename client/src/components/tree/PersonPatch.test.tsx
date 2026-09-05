import { render, screen, fireEvent } from '@testing-library/react'
import { PersonPatch } from './PersonPatch'
import type { Person } from '../../types'

const meera: Person = {
  id: 'meera', first_name: 'Meera', last_name: 'Gade', gender: null,
  birth_date: '1955', death_date: null, birth_place: null, occupation: null, bio: null,
  created_at: '', updated_at: '',
}

test('renders the name and birth-death years', () => {
  render(<PersonPatch person={meera} inFocus={false} dimmed={false} fresh={false} onOpen={() => {}} onDoubleOpen={() => {}} />)
  expect(screen.getByText('Meera Gade')).toBeInTheDocument()
  expect(screen.getByText('b. 1955')).toBeInTheDocument()
})

test('fires onOpen on click and onDoubleOpen on double-click', () => {
  const onOpen = vi.fn()
  const onDoubleOpen = vi.fn()
  render(<PersonPatch person={meera} inFocus={false} dimmed={false} fresh={false} onOpen={onOpen} onDoubleOpen={onDoubleOpen} />)
  const patch = screen.getByText('Meera Gade').closest('.patch')!
  fireEvent.click(patch)
  fireEvent.doubleClick(patch)
  expect(onOpen).toHaveBeenCalledWith('meera')
  expect(onDoubleOpen).toHaveBeenCalledWith('meera')
})

test('shows the fresh-stitch badge only when fresh is true', () => {
  const { rerender } = render(<PersonPatch person={meera} inFocus={false} dimmed={false} fresh={true} onOpen={() => {}} onDoubleOpen={() => {}} />)
  expect(document.querySelector('.fresh-badge')).toBeInTheDocument()
  rerender(<PersonPatch person={meera} inFocus={false} dimmed={false} fresh={false} onOpen={() => {}} onDoubleOpen={() => {}} />)
  expect(document.querySelector('.fresh-badge')).not.toBeInTheDocument()
})
