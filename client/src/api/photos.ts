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
  // A successful upload changes this person's primary photo, so any
  // previously cached getPrimaryPhoto() result (or in-flight lookup) for
  // them is now stale — drop it so the next render re-fetches instead of
  // serving the photo that was current before this upload.
  invalidatePrimaryPhoto(personId)
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

// Every sibling-flap toggle remounts the ancestor subtree it belongs to
// (switching between the grid and flex renderers), which resets each
// PersonPatch's photo state and would otherwise re-fire this Storage
// list() call on every remount. This module-level cache, keyed by
// personId, makes a remount within the same session reuse the already-
// resolved (or in-flight) result instead of re-fetching. Caching the
// Promise itself (not just its resolved value) also de-dupes concurrent
// in-flight lookups for the same person.
const primaryPhotoCache = new Map<string, Promise<string | null>>()

// Drops a person's cached lookup (if any) so the next call re-fetches —
// used when we know their photo just changed (see uploadPhoto above).
export function invalidatePrimaryPhoto(personId: string): void {
  primaryPhotoCache.delete(personId)
}

// Lighter than listPhotos() for the tree's collapsed card thumbnail, which
// only ever needs the single most-recent photo, not the full gallery —
// `limit: 1` avoids fetching every filename in the folder just to use one.
export function getPrimaryPhoto(personId: string): Promise<string | null> {
  const cached = primaryPhotoCache.get(personId)
  if (cached) return cached

  const promise = (async () => {
    const { data, error } = await supabase.storage.from('photos').list(personId, { limit: 1 })
    if (error || !data || data.length === 0 || !data[0].name) return null
    return supabase.storage.from('photos').getPublicUrl(`${personId}/${data[0].name}`).data.publicUrl
  })()

  primaryPhotoCache.set(personId, promise)
  return promise
}
