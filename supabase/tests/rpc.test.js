import test from 'node:test'
import assert from 'node:assert/strict'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321'
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY
if (!SUPABASE_ANON_KEY) {
  throw new Error('Set SUPABASE_ANON_KEY to the local anon key printed by `supabase start`')
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

test('people table exists and accepts a row via service-level insert check', async () => {
  const { error } = await supabase.from('people').select('id').limit(1)
  assert.equal(error, null)
})
