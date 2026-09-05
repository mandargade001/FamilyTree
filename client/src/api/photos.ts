import { supabase } from '../lib/supabaseClient'
import { getPassphrase } from '../lib/passphrase'

export async function uploadPhoto(personId: string, file: File): Promise<void> {
  const body = new FormData()
  body.set('passphrase', getPassphrase() ?? '')
  body.set('personId', personId)
  body.set('file', file)

  const response = await fetch(`${(supabase as any).functions.url}/upload-photo`, { method: 'POST', body })
  const result = await response.json()
  if (!response.ok) {
    throw new Error(result.error ?? 'upload failed')
  }
}
