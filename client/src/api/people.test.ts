import { vi } from 'vitest'

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
  },
}))

vi.mock('../lib/passphrase', () => ({
  getPassphrase: () => 'sesame',
}))

import { supabase } from '../lib/supabaseClient'
import { fetchPeople, addPerson } from './people'

test('fetchPeople selects all rows from the people table ordered by created_at', async () => {
  const order = vi.fn().mockResolvedValue({ data: [{ id: '1', first_name: 'Anna' }], error: null })
  const select = vi.fn().mockReturnValue({ order })
  ;(supabase.from as any).mockReturnValue({ select })

  const people = await fetchPeople()
  expect(supabase.from).toHaveBeenCalledWith('people')
  expect(select).toHaveBeenCalledWith('*')
  expect(order).toHaveBeenCalledWith('created_at')
  expect(people).toEqual([{ id: '1', first_name: 'Anna' }])
})

test('addPerson calls the add_person RPC with the stored passphrase', async () => {
  ;(supabase.rpc as any).mockResolvedValue({ data: 'new-id', error: null })

  const id = await addPerson({
    first_name: 'Anna', last_name: null, gender: null,
    birth_date: null, death_date: null, birth_place: null, occupation: null, bio: null,
  })

  expect(supabase.rpc).toHaveBeenCalledWith('add_person', expect.objectContaining({
    p_passphrase: 'sesame',
    p_first_name: 'Anna',
  }))
  expect(id).toBe('new-id')
})
