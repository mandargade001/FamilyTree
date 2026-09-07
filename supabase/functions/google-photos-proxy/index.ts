// Relays Google Photos Picker API calls using the caller's own Google OAuth
// token. Holds no secrets of its own and performs no app-level
// authorization — the worst a caller can do with this is fetch their own
// Google Photos data, which they could already do by calling Google
// directly. The family passphrase gate is enforced separately, only at the
// point of actually saving a photo (see upload-photo), not here.

const PICKER_API = 'https://photospicker.googleapis.com/v1'

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

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return jsonResponse({ error: 'missing Google Authorization header' }, 401)
  }
  const googleToken = authHeader.slice('Bearer '.length)

  let body: { action?: string; sessionId?: string; baseUrl?: string }
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: 'invalid JSON body' }, 400)
  }

  const googleHeaders = { Authorization: `Bearer ${googleToken}` }

  if (body.action === 'create') {
    const res = await fetch(`${PICKER_API}/sessions`, {
      method: 'POST',
      headers: { ...googleHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ pickingConfig: { maxItemCount: '1' } }),
    })
    const data = await res.json()
    return jsonResponse(data, res.status)
  }

  if (body.action === 'get') {
    if (!body.sessionId) return jsonResponse({ error: 'sessionId is required' }, 400)
    const res = await fetch(`${PICKER_API}/sessions/${encodeURIComponent(body.sessionId)}`, {
      headers: googleHeaders,
    })
    const data = await res.json()
    return jsonResponse(data, res.status)
  }

  if (body.action === 'list') {
    if (!body.sessionId) return jsonResponse({ error: 'sessionId is required' }, 400)
    const res = await fetch(`${PICKER_API}/mediaItems?sessionId=${encodeURIComponent(body.sessionId)}`, {
      headers: googleHeaders,
    })
    const data = await res.json()
    return jsonResponse(data, res.status)
  }

  if (body.action === 'delete') {
    if (!body.sessionId) return jsonResponse({ error: 'sessionId is required' }, 400)
    await fetch(`${PICKER_API}/sessions/${encodeURIComponent(body.sessionId)}`, {
      method: 'DELETE',
      headers: googleHeaders,
    })
    return jsonResponse({ ok: true }, 200)
  }

  if (body.action === 'download') {
    if (!body.baseUrl) return jsonResponse({ error: 'baseUrl is required' }, 400)
    const res = await fetch(`${body.baseUrl}=d`, { headers: googleHeaders })
    if (!res.ok) {
      return jsonResponse({ error: `Google returned ${res.status} downloading the photo` }, 502)
    }
    const contentType = res.headers.get('Content-Type') ?? 'application/octet-stream'
    const bytes = await res.arrayBuffer()
    return new Response(bytes, {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': contentType },
    })
  }

  return jsonResponse({ error: `unknown action: ${body.action}` }, 400)
})
