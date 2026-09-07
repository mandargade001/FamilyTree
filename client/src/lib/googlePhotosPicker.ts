import { requestGoogleAccessToken } from './googleAuth'

interface PickingSession {
  id: string
  pickerUri: string
  mediaItemsSet: boolean
  pollingConfig?: { pollInterval: string; timeoutIn: string }
}

interface MediaItem {
  id: string
  baseUrl: string
  mimeType: string
}

// Google returns durations as strings like "2s" or "3.5s".
function parseDurationSeconds(duration: string): number {
  return parseFloat(duration.replace('s', ''))
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Resolves with the picked photo as a File, or null if the session's own
// timeout elapses before the user finishes picking (they closed the tab,
// walked away, etc.) — not an error case, just "nothing was picked."
export async function pickGooglePhoto(): Promise<File | null> {
  const googleToken = await requestGoogleAccessToken()

  const createRes = await callProxy(googleToken, { action: 'create' })
  const session: PickingSession = await createRes.json()

  window.open(session.pickerUri, '_blank')

  const pollIntervalMs = session.pollingConfig ? parseDurationSeconds(session.pollingConfig.pollInterval) * 1000 : 2000
  const timeoutMs = session.pollingConfig ? parseDurationSeconds(session.pollingConfig.timeoutIn) * 1000 : 5 * 60 * 1000
  const deadline = Date.now() + timeoutMs

  let picked = false
  while (Date.now() < deadline) {
    await sleep(pollIntervalMs)
    const getRes = await callProxy(googleToken, { action: 'get', sessionId: session.id })
    const status: PickingSession = await getRes.json()
    if (status.mediaItemsSet) {
      picked = true
      break
    }
  }

  if (!picked) {
    void callProxy(googleToken, { action: 'delete', sessionId: session.id })
    return null
  }

  const listRes = await callProxy(googleToken, { action: 'list', sessionId: session.id })
  const listData: { mediaItems: MediaItem[] } = await listRes.json()
  const item = listData.mediaItems[0]

  const downloadRes = await callProxy(googleToken, { action: 'download', baseUrl: item.baseUrl })
  const blob = await downloadRes.blob()

  void callProxy(googleToken, { action: 'delete', sessionId: session.id })

  const extension = item.mimeType.split('/')[1] ?? 'jpg'
  return new File([blob], `google-photo.${extension}`, { type: item.mimeType })
}
