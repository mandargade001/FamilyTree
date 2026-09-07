import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { PersonForm } from './PersonForm'

describe('PersonForm', () => {
  it('Save is disabled until a first name is entered', () => {
    render(<PersonForm initial={null} onSave={() => {}} onCancel={() => {}} />)
    expect(screen.getByText('Save')).toBeDisabled()
    fireEvent.change(screen.getByLabelText(/First name/), { target: { value: 'Anna' } })
    expect(screen.getByText('Save')).not.toBeDisabled()
  })

  it('gender is a dropdown with blank/Male/Female/Other options, writing null for the blank option', async () => {
    const onSave = vi.fn()
    render(<PersonForm initial={null} onSave={onSave} onCancel={() => {}} />)
    fireEvent.change(screen.getByLabelText(/First name/), { target: { value: 'Anna' } })

    const genderSelect = screen.getByLabelText('Gender') as HTMLSelectElement
    expect(Array.from(genderSelect.options).map((o) => o.value)).toEqual(['', 'Male', 'Female', 'Other'])

    fireEvent.change(genderSelect, { target: { value: 'Female' } })
    fireEvent.click(screen.getByText('Save'))
    // Save plays a brief completion flourish before actually calling onSave —
    // see SAVE_FLOURISH_MS in PersonForm.tsx.
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ gender: 'Female' })))
  })

  it('calls onSave with the entered fields, defaulting optional fields to null', async () => {
    const onSave = vi.fn()
    render(<PersonForm initial={null} onSave={onSave} onCancel={() => {}} />)
    fireEvent.change(screen.getByLabelText(/First name/), { target: { value: 'Anna' } })
    fireEvent.click(screen.getByText('Save'))
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({
      first_name: 'Anna', last_name: null, gender: null, birth_date: null,
      death_date: null, birth_place: null, occupation: null, bio: null,
    }))
  })

  it('pre-fills fields from the initial value when editing', () => {
    render(<PersonForm initial={{ first_name: 'Meera', last_name: 'Gade', gender: null, birth_date: '1955', death_date: null, birth_place: null, occupation: null, bio: null }} onSave={() => {}} onCancel={() => {}} />)
    expect(screen.getByDisplayValue('Meera')).toBeInTheDocument()
    expect(screen.getByDisplayValue('1955')).toBeInTheDocument()
  })

  it('disables Save when first name is cleared after being entered (no crash)', () => {
    render(<PersonForm initial={null} onSave={() => {}} onCancel={() => {}} />)
    const firstNameInput = screen.getByLabelText(/First name/)
    const saveButton = screen.getByText('Save')

    // Enable Save by typing a name
    fireEvent.change(firstNameInput, { target: { value: 'Anna' } })
    expect(saveButton).not.toBeDisabled()

    // Disable Save by clearing the name (must not crash)
    fireEvent.change(firstNameInput, { target: { value: '' } })
    expect(saveButton).toBeDisabled()
  })
})
