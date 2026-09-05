import { supabase } from '../lib/supabaseClient'
import { getPassphrase } from '../lib/passphrase'
import type { Person, PersonFields } from '../types'

export async function fetchPeople(): Promise<Person[]> {
  // Ordering by created_at makes the default focal/root person deterministic:
  // the first person ever entered (rather than whatever order Postgres
  // happens to return rows in).
  const { data, error } = await supabase.from('people').select('*').order('created_at')
  if (error) throw error
  return data as Person[]
}

export async function addPerson(fields: PersonFields): Promise<string> {
  const { data, error } = await supabase.rpc('add_person', {
    p_passphrase: getPassphrase(),
    p_first_name: fields.first_name,
    p_last_name: fields.last_name,
    p_gender: fields.gender,
    p_birth_date: fields.birth_date,
    p_death_date: fields.death_date,
    p_birth_place: fields.birth_place,
    p_occupation: fields.occupation,
    p_bio: fields.bio,
  })
  if (error) throw error
  return data as string
}

export async function updatePerson(id: string, fields: PersonFields): Promise<void> {
  const { error } = await supabase.rpc('update_person', {
    p_passphrase: getPassphrase(),
    p_id: id,
    p_first_name: fields.first_name,
    p_last_name: fields.last_name,
    p_gender: fields.gender,
    p_birth_date: fields.birth_date,
    p_death_date: fields.death_date,
    p_birth_place: fields.birth_place,
    p_occupation: fields.occupation,
    p_bio: fields.bio,
  })
  if (error) throw error
}

export async function deletePerson(id: string): Promise<void> {
  const { error } = await supabase.rpc('delete_person', {
    p_passphrase: getPassphrase(),
    p_id: id,
  })
  if (error) throw error
}
