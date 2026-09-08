import { render, screen, fireEvent } from '@testing-library/react'
import { SiblingFlap } from './SiblingFlap'

test('shows the sibling count as a bubble', () => {
  render(<SiblingFlap count={3} open={false} onToggle={() => {}} />)
  expect(screen.getByText('3')).toBeInTheDocument()
})

test('clicking the bubble calls onToggle', () => {
  const onToggle = vi.fn()
  render(<SiblingFlap count={2} open={false} onToggle={onToggle} />)
  fireEvent.click(screen.getByText('2'))
  expect(onToggle).toHaveBeenCalledOnce()
})

test('reflects the open state via a class, for the existing chevron-rotation CSS', () => {
  const { container } = render(<SiblingFlap count={1} open={true} onToggle={() => {}} />)
  expect(container.querySelector('.sibling-bubble.open')).toBeInTheDocument()
})
