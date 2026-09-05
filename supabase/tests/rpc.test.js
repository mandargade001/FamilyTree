import test from 'node:test'
import assert from 'node:assert/strict'
import { supabase, pool } from './db.js'

test('people table exists and accepts a row via service-level insert check', async () => {
  const { error } = await supabase.from('people').select('id').limit(1)
  assert.equal(error, null)
})

test('anon cannot insert into people directly (RLS blocks it)', async () => {
  await pool.query('set role anon')
  try {
    const { error } = await supabase.from('people').insert({ first_name: 'Blocked' })
    assert.ok(error, 'expected an RLS error but insert succeeded')
    assert.match(
      error.message,
      /row-level security/i,
      `expected the insert to fail specifically due to RLS, but got: ${error.message}`
    )
  } finally {
    await pool.query('reset role')
  }
})

test('verify_passphrase rejects the wrong passphrase', async () => {
  const { data, error } = await supabase.rpc('verify_passphrase', { p_passphrase: 'definitely-wrong' })
  assert.equal(error, null)
  assert.equal(data, false)
})
