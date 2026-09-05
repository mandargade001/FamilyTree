import { supabase } from '../lib/supabaseClient'
import { getPassphrase } from '../lib/passphrase'
import type { Relationship, RelationshipType } from '../types'

export async function fetchRelationships(): Promise<Relationship[]> {
  const { data, error } = await supabase.from('relationships').select('*')
  if (error) throw error
  return data as Relationship[]
}

export async function addRelationship(
  type: RelationshipType,
  fromId: string,
  toId: string,
): Promise<string> {
  const { data, error } = await supabase.rpc('add_relationship', {
    p_passphrase: getPassphrase(),
    p_type: type,
    p_from_id: fromId,
    p_to_id: toId,
  })
  if (error) throw error
  return data as string
}

export async function deleteRelationship(id: string): Promise<void> {
  const { error } = await supabase.rpc('delete_relationship', {
    p_passphrase: getPassphrase(),
    p_id: id,
  })
  if (error) throw error
}
