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
