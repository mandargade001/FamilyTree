import { createClient } from 'jsr:@supabase/supabase-js@2'

const MAX_BYTES = 10 * 1024 * 1024
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/heic']

// Every response — including error responses — must carry these, or the
// browser blocks it as a CORS failure regardless of status code. The OPTIONS
// preflight the browser sends before the real POST must be answered here
// directly, without touching the request body: it has no Content-Type and
// no form data, so calling req.formData() on it throws and crashes the
// function before any CORS headers are ever sent.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const formData = await req.formData()
  const passphrase = formData.get('passphrase')
  const personId = formData.get('personId')
  const file = formData.get('file')

  if (typeof passphrase !== 'string' || typeof personId !== 'string' || !(file instanceof File)) {
    return jsonResponse({ error: 'missing passphrase, personId, or file' }, 400)
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { data: passphraseOk } = await supabase.rpc('verify_passphrase', { p_passphrase: passphrase })
  if (!passphraseOk) {
    return jsonResponse({ error: 'incorrect passphrase' }, 403)
  }

  if (file.size > MAX_BYTES) {
    return jsonResponse({ error: 'file too large (max 10MB)' }, 400)
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return jsonResponse({ error: 'unsupported file type (jpg/png/heic only)' }, 400)
  }

  const path = `${personId}/${crypto.randomUUID()}-${file.name}`
  const { error } = await supabase.storage.from('photos').upload(path, file, { contentType: file.type })
  if (error) {
    return jsonResponse({ error: error.message }, 500)
  }

  return jsonResponse({ path }, 200)
})
