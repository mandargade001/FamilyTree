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

test('anon cannot select from app_config directly (RLS + revoked grants block it)', async () => {
  await pool.query('set role anon')
  try {
    const { error } = await supabase.from('app_config').select('*').limit(1)
    assert.ok(error, 'expected an error but select succeeded')
    assert.match(
      error.message,
      /permission denied|row-level security/i,
      `expected the select to be blocked, but got: ${error.message}`
    )
  } finally {
    await pool.query('reset role')
  }
})

test('anon cannot update app_config directly (passphrase hash cannot be overwritten)', async () => {
  await pool.query('set role anon')
  let caught = null
  try {
    await pool.query("update app_config set value = 'hacked' where key = 'passphrase_hash'")
  } catch (err) {
    caught = err
  } finally {
    await pool.query('reset role')
  }
  assert.ok(caught, 'expected update to be rejected, but it succeeded')
  assert.match(
    caught.message,
    /permission denied|row-level security/i,
    `expected the update to be blocked, but got: ${caught.message}`
  )
})

test('app_config has row-level security enabled at the relation level', async () => {
  const { rows } = await pool.query(
    `select relrowsecurity from pg_class where relname = 'app_config' and relnamespace = 'public'::regnamespace`
  )
  assert.equal(rows.length, 1, 'expected to find the app_config relation')
  assert.equal(rows[0].relrowsecurity, true, 'expected row-level security to be enabled on app_config')
})

test('anon and authenticated have zero table-level grants on app_config', async () => {
  const { rows } = await pool.query(
    `select grantee, privilege_type from information_schema.role_table_grants
     where table_schema = 'public' and table_name = 'app_config'
       and grantee in ('anon', 'authenticated')`
  )
  assert.deepEqual(rows, [], `expected no grants for anon/authenticated on app_config, but found: ${JSON.stringify(rows)}`)
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

test('add_person rejects a null passphrase', async () => {
  const { error } = await supabase.rpc('add_person', {
    p_passphrase: null,
    p_first_name: 'NullPassTest',
  })
  assert.ok(error, 'expected add_person to reject null passphrase')
})

test('update_person rejects a null passphrase', async () => {
  const { data: id } = await supabase.rpc('add_person', {
    p_passphrase: 'changeme',
    p_first_name: 'UpdateTest',
  })
  const { error } = await supabase.rpc('update_person', {
    p_passphrase: null,
    p_id: id,
    p_first_name: 'UpdateTest',
  })
  assert.ok(error, 'expected update_person to reject null passphrase')
})

test('update_person rejects a wrong (non-null) passphrase', async () => {
  const { data: id } = await supabase.rpc('add_person', {
    p_passphrase: 'changeme',
    p_first_name: 'PassphraseTest',
  })
  const { error } = await supabase.rpc('update_person', {
    p_passphrase: 'wrongpassphrase',
    p_id: id,
    p_first_name: 'PassphraseTest',
  })
  assert.ok(error, 'expected update_person to reject wrong passphrase')
})

test('update_person rejects a nonexistent person id', async () => {
  const fakeId = '00000000-0000-0000-0000-000000000000'
  const { error } = await supabase.rpc('update_person', {
    p_passphrase: 'changeme',
    p_id: fakeId,
    p_first_name: 'NoOne',
  })
  assert.ok(error, 'expected update_person to reject nonexistent person id')
  assert.match(error.message, /person not found/i)
})

test('delete_person removes the row and cascades its relationships', async () => {
  const { data: parentId } = await supabase.rpc('add_person', { p_passphrase: 'changeme', p_first_name: 'Deletable Parent' })
  const { data: childId } = await supabase.rpc('add_person', { p_passphrase: 'changeme', p_first_name: 'Deletable Child' })
  const { error: relError } = await supabase.rpc('add_relationship', { p_passphrase: 'changeme', p_type: 'parent-child', p_from_id: parentId, p_to_id: childId })
  assert.equal(relError, null)

  const { error } = await supabase.rpc('delete_person', { p_passphrase: 'changeme', p_id: parentId })
  assert.equal(error, null)

  const { data: remaining } = await supabase.from('relationships').select('*').eq('from_id', parentId)
  assert.equal(remaining.length, 0)
})

test('delete_person rejects the wrong passphrase and leaves the row intact', async () => {
  const { data: id } = await supabase.rpc('add_person', { p_passphrase: 'changeme', p_first_name: 'Protected' })
  const { error } = await supabase.rpc('delete_person', { p_passphrase: 'wrong', p_id: id })
  assert.ok(error)

  const { data: row } = await supabase.from('people').select('*').eq('id', id).single()
  assert.ok(row)
})

test('add_relationship links a parent to a child', async () => {
  const { data: parentId } = await supabase.rpc('add_person', { p_passphrase: 'changeme', p_first_name: 'Meera' })
  const { data: childId } = await supabase.rpc('add_person', { p_passphrase: 'changeme', p_first_name: 'Rohan' })

  const { data, error } = await supabase.rpc('add_relationship', {
    p_passphrase: 'changeme', p_type: 'parent-child', p_from_id: parentId, p_to_id: childId,
  })
  assert.equal(error, null)
  assert.ok(data)
})

test('add_relationship rejects a duplicate edge (same type/from/to)', async () => {
  const { data: parentId } = await supabase.rpc('add_person', { p_passphrase: 'changeme', p_first_name: 'Dupe Parent' })
  const { data: childId } = await supabase.rpc('add_person', { p_passphrase: 'changeme', p_first_name: 'Dupe Child' })

  const first = await supabase.rpc('add_relationship', {
    p_passphrase: 'changeme', p_type: 'parent-child', p_from_id: parentId, p_to_id: childId,
  })
  assert.equal(first.error, null)

  const second = await supabase.rpc('add_relationship', {
    p_passphrase: 'changeme', p_type: 'parent-child', p_from_id: parentId, p_to_id: childId,
  })
  assert.ok(second.error, 'expected the duplicate edge to be rejected')
})

test('add_relationship rejects a relationship that would make someone their own ancestor', async () => {
  const { data: grandparentId } = await supabase.rpc('add_person', { p_passphrase: 'changeme', p_first_name: 'Grandparent' })
  const { data: parentId } = await supabase.rpc('add_person', { p_passphrase: 'changeme', p_first_name: 'Parent' })
  const { data: childId } = await supabase.rpc('add_person', { p_passphrase: 'changeme', p_first_name: 'Child' })

  await supabase.rpc('add_relationship', { p_passphrase: 'changeme', p_type: 'parent-child', p_from_id: grandparentId, p_to_id: parentId })
  await supabase.rpc('add_relationship', { p_passphrase: 'changeme', p_type: 'parent-child', p_from_id: parentId, p_to_id: childId })

  // Child cannot become an ancestor of Grandparent — this would create a cycle.
  const { error } = await supabase.rpc('add_relationship', {
    p_passphrase: 'changeme', p_type: 'parent-child', p_from_id: childId, p_to_id: grandparentId,
  })
  assert.ok(error, 'expected the cycle to be rejected')
})

test('add_relationship rejects an invalid relationship type', async () => {
  const { data: a } = await supabase.rpc('add_person', { p_passphrase: 'changeme', p_first_name: 'A' })
  const { data: b } = await supabase.rpc('add_person', { p_passphrase: 'changeme', p_first_name: 'B' })
  const { error } = await supabase.rpc('add_relationship', {
    p_passphrase: 'changeme', p_type: 'sibling', p_from_id: a, p_to_id: b,
  })
  assert.ok(error)
})

test('delete_relationship removes the row with the correct passphrase', async () => {
  const { data: parentId } = await supabase.rpc('add_person', { p_passphrase: 'changeme', p_first_name: 'Rel Parent' })
  const { data: childId } = await supabase.rpc('add_person', { p_passphrase: 'changeme', p_first_name: 'Rel Child' })
  const { data: relId, error: relError } = await supabase.rpc('add_relationship', {
    p_passphrase: 'changeme', p_type: 'parent-child', p_from_id: parentId, p_to_id: childId,
  })
  assert.equal(relError, null)

  const { error } = await supabase.rpc('delete_relationship', { p_passphrase: 'changeme', p_id: relId })
  assert.equal(error, null)

  const { data: row } = await supabase.from('relationships').select('*').eq('id', relId)
  assert.equal(row.length, 0)
})

test('delete_relationship rejects the wrong passphrase and leaves the row intact', async () => {
  const { data: parentId } = await supabase.rpc('add_person', { p_passphrase: 'changeme', p_first_name: 'Rel Parent 2' })
  const { data: childId } = await supabase.rpc('add_person', { p_passphrase: 'changeme', p_first_name: 'Rel Child 2' })
  const { data: relId, error: relError } = await supabase.rpc('add_relationship', {
    p_passphrase: 'changeme', p_type: 'parent-child', p_from_id: parentId, p_to_id: childId,
  })
  assert.equal(relError, null)

  const { error } = await supabase.rpc('delete_relationship', { p_passphrase: 'wrong', p_id: relId })
  assert.ok(error)

  const { data: row } = await supabase.from('relationships').select('*').eq('id', relId).single()
  assert.ok(row)
})

test('add_relationship rejects a reversed duplicate spouse pair', async () => {
  const { data: aId } = await supabase.rpc('add_person', { p_passphrase: 'changeme', p_first_name: 'Spouse A' })
  const { data: bId } = await supabase.rpc('add_person', { p_passphrase: 'changeme', p_first_name: 'Spouse B' })

  const first = await supabase.rpc('add_relationship', {
    p_passphrase: 'changeme', p_type: 'spouse', p_from_id: aId, p_to_id: bId,
  })
  assert.equal(first.error, null, 'expected the original spouse pairing to succeed')
  assert.ok(first.data)

  const reversed = await supabase.rpc('add_relationship', {
    p_passphrase: 'changeme', p_type: 'spouse', p_from_id: bId, p_to_id: aId,
  })
  assert.ok(reversed.error, 'expected the reversed spouse pairing to be rejected')
  assert.match(reversed.error.message, /this spousal relationship already exists/i)
})

test('the reversed-spouse check does not leak into parent-child relationships between the same pair', async () => {
  const { data: aId } = await supabase.rpc('add_person', { p_passphrase: 'changeme', p_first_name: 'Cross A' })
  const { data: bId } = await supabase.rpc('add_person', { p_passphrase: 'changeme', p_first_name: 'Cross B' })

  const spouse = await supabase.rpc('add_relationship', {
    p_passphrase: 'changeme', p_type: 'spouse', p_from_id: aId, p_to_id: bId,
  })
  assert.equal(spouse.error, null)

  // A "reversed" parent-child pair between the same two people must still be allowed —
  // the spouse-specific reverse check must not affect parent-child at all.
  const parentChild = await supabase.rpc('add_relationship', {
    p_passphrase: 'changeme', p_type: 'parent-child', p_from_id: bId, p_to_id: aId,
  })
  assert.equal(parentChild.error, null, 'expected the parent-child edge to succeed despite the existing spouse edge')
})

test('delete_relationship rejects a nonexistent relationship id', async () => {
  const fakeId = '00000000-0000-0000-0000-000000000000'
  const { error } = await supabase.rpc('delete_relationship', { p_passphrase: 'changeme', p_id: fakeId })
  assert.ok(error, 'expected delete_relationship to reject nonexistent relationship id')
  assert.match(error.message, /relationship not found/i)
})
