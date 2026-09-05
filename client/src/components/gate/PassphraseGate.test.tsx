import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, test, expect, vi, beforeEach } from 'vitest'
import { supabase } from '../../lib/supabaseClient'
import { PassphraseGate } from './PassphraseGate'
import { getPassphrase } from '../../lib/passphrase'

vi.mock('../../lib/supabaseClient', () => ({
  supabase: { rpc: vi.fn() },
}))

beforeEach(() => localStorage.clear())

describe('PassphraseGate', () => {
  test('shows an error and does not store the passphrase when it is wrong', async () => {
    ;(supabase.rpc as any).mockResolvedValue({ data: false, error: null })
    const onUnlocked = vi.fn()
    render(<PassphraseGate onUnlocked={onUnlocked} onCancel={() => {}} />)

    fireEvent.change(screen.getByPlaceholderText('Passphrase'), { target: { value: 'wrong' } })
    fireEvent.click(screen.getByText('Unlock editing'))

    await waitFor(() => expect(screen.getByText('Incorrect passphrase.')).toBeInTheDocument())
    expect(onUnlocked).not.toHaveBeenCalled()
    expect(getPassphrase()).toBeNull()
  })

  test('stores the passphrase and calls onUnlocked when correct', async () => {
    ;(supabase.rpc as any).mockResolvedValue({ data: true, error: null })
    const onUnlocked = vi.fn()
    render(<PassphraseGate onUnlocked={onUnlocked} onCancel={() => {}} />)

    fireEvent.change(screen.getByPlaceholderText('Passphrase'), { target: { value: 'sesame' } })
    fireEvent.click(screen.getByText('Unlock editing'))

    await waitFor(() => expect(onUnlocked).toHaveBeenCalledOnce())
    expect(getPassphrase()).toBe('sesame')
  })
})
