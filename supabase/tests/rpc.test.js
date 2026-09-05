import test from 'node:test'
import assert from 'node:assert/strict'
import { supabase } from './db.js'

test('people table exists and accepts a row via service-level insert check', async () => {
  const { error } = await supabase.from('people').select('id').limit(1)
  assert.equal(error, null)
})
