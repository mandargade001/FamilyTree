import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '../lib/supabaseClient'
import { getPassphrase } from '../lib/passphrase'

export async function uploadPhoto(personId: string, file: File): Promise<void> {
  const body = new FormData()
  body.set('passphrase', getPassphrase() ?? '')
  body.set('personId', personId)
  body.set('file', file)

  // The installed @supabase/supabase-js version's functions.invoke() detects
  // a FormData body and sends it as-is (see @supabase/functions-js
  // FunctionsClient), so there's no need to reach into private client
  // fields to build the URL ourselves.
  const { error } = await supabase.functions.invoke('upload-photo', { body })
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const result = await error.context.json().catch(() => null)
      throw new Error(result?.error ?? error.message)
    }
    throw error
  }
}

// Photos are stored under photos/<personId>/<filename> in a public-read
// bucket, deliberately not tracked in a database column — so "listing a
// person's photos" means listing that storage folder. A person with no
// photos yet (folder doesn't exist) or a listing failure are both normal,
// expected states here, not errors worth throwing over — callers just get
// an empty gallery.
export async function listPhotos(personId: string): Promise<string[]> {
  const { data, error } = await supabase.storage.from('photos').list(personId)
  if (error || !data) return []
  return data
    .filter((entry) => entry.name)
    .map((entry) => supabase.storage.from('photos').getPublicUrl(`${personId}/${entry.name}`).data.publicUrl)
}

// Lighter than listPhotos() for the tree's collapsed card thumbnail, which
// only ever needs the single most-recent photo, not the full gallery —
// `limit: 1` avoids fetching every filename in the folder just to use one.
export async function getPrimaryPhoto(personId: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from('photos').list(personId, { limit: 1 })
  if (error || !data || data.length === 0 || !data[0].name) return null
  return supabase.storage.from('photos').getPublicUrl(`${personId}/${data[0].name}`).data.publicUrl
}
