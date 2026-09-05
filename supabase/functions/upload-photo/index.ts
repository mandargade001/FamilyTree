import { createClient } from 'jsr:@supabase/supabase-js@2'

const MAX_BYTES = 10 * 1024 * 1024
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/heic']

Deno.serve(async (req) => {
  const formData = await req.formData()
  const passphrase = formData.get('passphrase')
  const personId = formData.get('personId')
  const file = formData.get('file')

  if (typeof passphrase !== 'string' || typeof personId !== 'string' || !(file instanceof File)) {
    return new Response(JSON.stringify({ error: 'missing passphrase, personId, or file' }), { status: 400 })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { data: passphraseOk } = await supabase.rpc('verify_passphrase', { p_passphrase: passphrase })
  if (!passphraseOk) {
    return new Response(JSON.stringify({ error: 'incorrect passphrase' }), { status: 403 })
  }

  if (file.size > MAX_BYTES) {
    return new Response(JSON.stringify({ error: 'file too large (max 10MB)' }), { status: 400 })
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return new Response(JSON.stringify({ error: 'unsupported file type (jpg/png/heic only)' }), { status: 400 })
  }

  const path = `${personId}/${crypto.randomUUID()}-${file.name}`
  const { error } = await supabase.storage.from('photos').upload(path, file, { contentType: file.type })
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }

  return new Response(JSON.stringify({ path }), { status: 200 })
})
