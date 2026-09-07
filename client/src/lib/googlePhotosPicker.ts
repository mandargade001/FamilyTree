import { requestGoogleAccessToken } from './googleAuth'

interface PickingSession {
  id: string
  pickerUri: string
  mediaItemsSet: boolean
  pollingConfig?: { pollInterval: string; timeoutIn: string }
}

interface MediaItem {
  id: string
  mediaFile: {
    baseUrl: string
    mimeType: string
  }
}

// Google returns durations as strings like "2s" or "3.5s".
function parseDurationSeconds(duration: string): number {
  const seconds = parseFloat(duration.replace('s', ''))
  return Number.isNaN(seconds) ? 0 : seconds
}

async function callProxy(googleToken: string, payload: Record<string, unknown>): Promise<Response> {
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/google-photos-proxy`
  return fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${googleToken}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
}

// Throws with a message that includes the failing action and, when available,
// the Edge Function's own error detail. The `download` action's success
// response is a raw binary blob (not JSON), so on failure we can't assume
// `.json()` will parse — fall back to the HTTP status in that case.
async function assertOk(action: string, response: Response): Promise<Response> {
  if (response.ok) return response
  let detail = `HTTP ${response.status}`
  try {
    const body = await response.json()
    if (body && typeof body.error === 'string') detail = body.error
  } catch {
    // response body wasn't parseable JSON — stick with the HTTP status
  }
  throw new Error(`Google Photos proxy '${action}' failed: ${detail}`)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Resolves with the picked photo as a File, or null if the session's own
// timeout elapses before the user finishes picking (they closed the tab,
// walked away, etc.) — not an error case, just "nothing was picked."
export async function pickGooglePhoto(): Promise<File | null> {
  // Must be the very first synchronous statement, before any `await`, so the
  // browser still treats this as a direct response to the user's click and
  // doesn't block it as a popup. We navigate this already-open tab once the
  // real pickerUri is known below, instead of calling window.open again.
  const popup = window.open('', '_blank')
  if (!popup) {
    throw new Error('Your browser blocked the Google Photos picker popup. Please allow popups for this site and try again.')
  }

  const googleToken = await requestGoogleAccessToken()

  const createRes = await assertOk('create', await callProxy(googleToken, { action: 'create' }))
  const session: PickingSession = await createRes.json()

  popup.location.href = session.pickerUri

  try {
    const pollIntervalMs = session.pollingConfig ? parseDurationSeconds(session.pollingConfig.pollInterval) * 1000 : 2000
    const timeoutMs = session.pollingConfig ? parseDurationSeconds(session.pollingConfig.timeoutIn) * 1000 : 5 * 60 * 1000
    const deadline = Date.now() + timeoutMs

    let picked = false
    while (Date.now() < deadline) {
      await sleep(pollIntervalMs)
      const getRes = await assertOk('get', await callProxy(googleToken, { action: 'get', sessionId: session.id }))
      const status: PickingSession = await getRes.json()
      if (status.mediaItemsSet) {
        picked = true
        break
      }
    }

    if (!picked) {
      return null
    }

    const listRes = await assertOk('list', await callProxy(googleToken, { action: 'list', sessionId: session.id }))
    const listData: { mediaItems?: MediaItem[] } = await listRes.json()
    if (!listData.mediaItems || listData.mediaItems.length === 0) {
      throw new Error('No photo was selected.')
    }
    const item = listData.mediaItems[0]

    const downloadRes = await assertOk(
      'download',
      await callProxy(googleToken, { action: 'download', baseUrl: item.mediaFile.baseUrl }),
    )
    const blob = await downloadRes.blob()

    const mimeType = item.mediaFile.mimeType
    const extension = mimeType === 'image/jpeg' ? 'jpg' : (mimeType.split('/')[1] ?? 'jpg')
    return new File([blob], `google-photo.${extension}`, { type: mimeType })
  } finally {
    void callProxy(googleToken, { action: 'delete', sessionId: session.id })
  }
}
