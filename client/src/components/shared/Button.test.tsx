import { render, screen, fireEvent } from '@testing-library/react'
import { describe, test, expect, vi } from 'vitest'
import { Button } from './Button'

describe('Button', () => {
  test('renders its label and fires onClick', () => {
    const onClick = vi.fn()
    render(<Button variant="primary" onClick={onClick}>Add Person</Button>)
    fireEvent.click(screen.getByText('Add Person'))
    expect(onClick).toHaveBeenCalledOnce()
  })

  test('applies the ghost variant class', () => {
    render(<Button variant="ghost">Focus Mode</Button>)
    expect(screen.getByText('Focus Mode')).toHaveClass('btn-ghost')
  })
})
