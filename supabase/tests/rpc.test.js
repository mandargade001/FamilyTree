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

test('add_person rejects a missing first name', async () => {
  const { error } = await supabase.rpc('add_person', {
    p_passphrase: 'changeme',
    p_first_name: '',
  })
  assert.ok(error)
})

test('add_person rejects the wrong passphrase', async () => {
  const { error } = await supabase.rpc('add_person', {
    p_passphrase: 'wrong',
    p_first_name: 'Anna',
  })
  assert.ok(error)
})

test('add_person creates a person with the correct passphrase', async () => {
  const { data, error } = await supabase.rpc('add_person', {
    p_passphrase: 'changeme',
    p_first_name: 'Anna',
    p_last_name: 'Gade',
    p_birth_date: '1932',
  })
  assert.equal(error, null)
  assert.ok(data, 'expected a returned uuid')

  const { data: row } = await supabase.from('people').select('*').eq('id', data).single()
  assert.equal(row.first_name, 'Anna')
  assert.equal(row.birth_date, '1932')
})

test('update_person changes fields on an existing person', async () => {
  const { data: id } = await supabase.rpc('add_person', {
    p_passphrase: 'changeme',
    p_first_name: 'Ravi',
  })
  const { error } = await supabase.rpc('update_person', {
    p_passphrase: 'changeme',
    p_id: id,
    p_first_name: 'Ravi',
    p_occupation: 'Engineer',
  })
  assert.equal(error, null)

  const { data: row } = await supabase.from('people').select('*').eq('id', id).single()
  assert.equal(row.occupation, 'Engineer')
})
