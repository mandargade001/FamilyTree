# Google Photos Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a family member pick a photo from their own Google Photos library and attach it to a person's profile, without a passphrase-free "look around" step becoming a passphrase-free *write* — the existing passphrase gate stays the only thing that authorizes saving anything.

**Architecture:** A new, unauthenticated Supabase Edge Function (`google-photos-proxy`) relays Google's Photos Picker API calls (session create/get/list/download/delete) server-to-server, using the caller's own Google OAuth token — this sidesteps any uncertainty about whether `photospicker.googleapis.com` allows direct browser CORS calls, since server-to-server requests have no CORS concern at all, and it costs the project nothing extra since one Deno Edge Function is already the established pattern here (`upload-photo`). The proxy holds no secrets of its own (no Google client secret needed for this OAuth flow) and needs no app-level passphrase check — the worst a caller could do with it is fetch their *own* Google Photos data, which they could already do by calling Google directly. The client obtains a Google OAuth access token via Google Identity Services' browser token-client flow, drives the picker session through the proxy, and once a photo is picked, downloads its bytes (also through the proxy) and hands the resulting `File` to the exact same `onUploadPhoto` prop `PersonProfile.tsx` already uses for a locally-selected file — so the existing, unchanged passphrase gate (`App.tsx`'s `requestUploadPhoto`) still authorizes the actual save, identically to today.

**Tech Stack:** Deno Edge Function (existing pattern), React + TypeScript client, Google Identity Services (`accounts.google.com/gsi/client`, loaded via a static `<script>` tag — no npm package), Google Photos Picker API (`photospicker.googleapis.com`).

## Global Constraints

- No database/RLS/RPC changes. No allowlist, no Supabase Auth, no change to the passphrase gate anywhere.
- The new Edge Function performs no app-level authorization — it only relays Google API calls using the caller-supplied Google Bearer token.
- The picker session is created with `pickingConfig.maxItemCount: '1'` — this feature always picks exactly one photo per action, matching the existing single-file upload flow. No multi-select or pagination handling.
- Some exact Google API response field names below (`mediaItems` as the list-response wrapper key) are inferred from Google's documented conventions but weren't independently confirmed byte-for-byte against a live response during design (Google's own reference pages don't show a full worked example). Each task that depends on one flags it with a comment; if a live test contradicts it, that specific field-name assumption is corrected in place — it does not change the overall architecture.
- Match existing code style: no comments except where a non-obvious constraint needs explaining.
- Run `cd client && npm test` after every client task (this project's `package.json` test script is already `vitest run` — do NOT append `-- run`).
- The Edge Function has no automated test in this project (matching the existing untested `upload-photo` function — there's no CI/local harness for Deno Edge Functions here); it's verified by manual deployment + a real picker round-trip, documented as an explicit manual step in Task 1.

---

### Task 1: `google-photos-proxy` Edge Function

**Files:**
- Create: `supabase/functions/google-photos-proxy/index.ts`

**Interfaces:**
- Produces: an HTTP endpoint accepting `POST` with JSON body `{ action: 'create' | 'get' | 'list' | 'download' | 'delete', sessionId?: string, baseUrl?: string }` and header `Authorization: Bearer <google-access-token>`. Later tasks (client `lib/googlePhotosPicker.ts`) depend on this exact request shape and the response shapes documented in each step below.

- [ ] **Step 1: Write the Edge Function**

Create `supabase/functions/google-photos-proxy/index.ts`:

```ts
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
```

- [ ] **Step 2: Deploy the function with JWT verification disabled**

Run: `cd supabase && npx supabase functions deploy google-photos-proxy --no-verify-jwt`

This flag is required and is a deliberate difference from `upload-photo` (which deploys with Supabase's default `verify_jwt: true`). `upload-photo` works with the default because `supabase.functions.invoke()` always sends the Supabase anon key as the Authorization header, which Supabase's gateway can validate as a real Supabase-signed token. This function instead receives the caller's **Google** OAuth token in its Authorization header (see Task 3) — Supabase's gateway cannot validate a Google-issued token as a Supabase JWT, and would reject every request with 401 before this function's code ever ran if JWT verification were left on. `--no-verify-jwt` tells Supabase's gateway to pass the request straight through and let this function's own code (which needs no Supabase-level identity at all — see the file's top comment) decide what to do with it. Check `README.md`'s deployment section for the exact project-linking prerequisites if this is the first deploy in the session.

- [ ] **Step 3: Manual verification (no automated test exists for Edge Functions in this project)**

This step can only be completed once the external Google Cloud OAuth Client ID exists (see the plan's final "Manual setup" section) — if that hasn't happened yet, defer this step and come back to it before Task 4 is considered done, not before Task 1's commit.

Once a Client ID exists, obtain a real Google OAuth access token for the `https://www.googleapis.com/auth/photospicker.mediaitems.readonly` scope (e.g. via [Google's OAuth 2.0 Playground](https://developers.google.com/oauthplayground) for a one-off manual check), then:

```bash
curl -X POST https://<project-ref>.supabase.co/functions/v1/google-photos-proxy \
  -H "Authorization: Bearer <google-access-token>" \
  -H "Content-Type: application/json" \
  -d '{"action":"create"}'
```

Expected: a JSON response containing `id`, `pickerUri`, and `pollingConfig`. Visit the `pickerUri` in a browser, pick a photo, then confirm `{"action":"get","sessionId":"<id>"}` eventually returns `"mediaItemsSet": true`, `{"action":"list","sessionId":"<id>"}` returns a `mediaItems` array with a `baseUrl`, and `{"action":"download","baseUrl":"<that baseUrl>"}` returns image bytes (check `Content-Type` in the response headers). If the `list` response's array is under a different JSON key than `mediaItems`, note the actual key here and fix `client/src/lib/googlePhotosPicker.ts`'s parsing in Task 3 accordingly.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/google-photos-proxy/index.ts
git commit -m "Add google-photos-proxy Edge Function"
```

---

### Task 2: Google Identity Services setup + access-token helper

**Files:**
- Modify: `client/index.html`
- Create: `client/src/types/google-identity.d.ts`
- Create: `client/src/lib/googleAuth.ts`
- Test: `client/src/lib/googleAuth.test.ts`

**Interfaces:**
- Consumes: the global `window.google.accounts.oauth2` object, made available by the script tag added in Step 1.
- Produces: `requestGoogleAccessToken(): Promise<string>` — resolves with a Google OAuth access token scoped to `photospicker.mediaitems.readonly`, or rejects if the user closes/denies the consent popup. Task 3 depends on this exact function name/signature.

- [ ] **Step 1: Add the Google Identity Services script tag**

In `client/index.html`, add this line inside `<head>`, after the existing font `<link>` tags:

```html
    <script src="https://accounts.google.com/gsi/client" async defer></script>
```

- [ ] **Step 2: Add ambient types for the parts of the GIS API this project uses**

Create `client/src/types/google-identity.d.ts`:

```ts
export {}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient(config: {
            client_id: string
            scope: string
            callback: (response: { access_token?: string; error?: string }) => void
          }): { requestAccessToken(): void }
        }
      }
    }
  }
}
```

- [ ] **Step 3: Write the failing test**

Create `client/src/lib/googleAuth.test.ts`:

```ts
import { requestGoogleAccessToken } from './googleAuth'

describe('requestGoogleAccessToken', () => {
  afterEach(() => {
    // `google` is declared optional on Window (see google-identity.d.ts),
    // so this is valid TS without a suppression comment.
    delete window.google
  })

  it('resolves with the access token on success', async () => {
    let capturedCallback: ((response: { access_token?: string; error?: string }) => void) | undefined
    window.google = {
      accounts: {
        oauth2: {
          initTokenClient: (config) => {
            capturedCallback = config.callback
            return {
              requestAccessToken: () => {
                capturedCallback?.({ access_token: 'test-token-123' })
              },
            }
          },
        },
      },
    }

    await expect(requestGoogleAccessToken()).resolves.toBe('test-token-123')
  })

  it('rejects when the callback reports an error', async () => {
    window.google = {
      accounts: {
        oauth2: {
          initTokenClient: (config) => ({
            requestAccessToken: () => config.callback({ error: 'access_denied' }),
          }),
        },
      },
    }

    await expect(requestGoogleAccessToken()).rejects.toThrow('access_denied')
  })

  it('rejects when Google Identity Services has not loaded', async () => {
    // window.google left undefined (script blocked, ad-blocker, offline, etc.)
    await expect(requestGoogleAccessToken()).rejects.toThrow('Google Identity Services did not load')
  })
})
```

- [ ] **Step 4: Run test to verify it fails**

Run: `cd client && npx vitest run src/lib/googleAuth.test.ts`
Expected: FAIL — `./googleAuth` doesn't exist yet.

- [ ] **Step 5: Implement the helper**

Create `client/src/lib/googleAuth.ts`:

```ts
const SCOPE = 'https://www.googleapis.com/auth/photospicker.mediaitems.readonly'

export function requestGoogleAccessToken(): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!window.google) {
      reject(new Error('Google Identity Services did not load'))
      return
    }

    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPE,
      callback: (response) => {
        if (response.error || !response.access_token) {
          reject(new Error(response.error ?? 'no access token returned'))
          return
        }
        resolve(response.access_token)
      },
    })
    client.requestAccessToken()
  })
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd client && npx vitest run src/lib/googleAuth.test.ts`
Expected: PASS, all 3 tests green.

- [ ] **Step 7: Commit**

```bash
git add client/index.html client/src/types/google-identity.d.ts client/src/lib/googleAuth.ts client/src/lib/googleAuth.test.ts
git commit -m "Add Google Identity Services access-token helper"
```

---

### Task 3: Picker session orchestration

**Files:**
- Create: `client/src/lib/googlePhotosPicker.ts`
- Test: `client/src/lib/googlePhotosPicker.test.ts`

**Interfaces:**
- Consumes: `requestGoogleAccessToken()` from Task 2.
- Produces: `pickGooglePhoto(): Promise<File | null>` — drives the whole flow (token → create session → open picker → poll → list → download → delete session) and resolves with the picked photo as a `File`, or `null` if the user closed the picker tab without picking anything before the session's timeout. Task 4 (`PersonProfile.tsx`) depends on this exact function name/signature and the `File | null` contract.

- [ ] **Step 1: Write the failing test**

Create `client/src/lib/googlePhotosPicker.test.ts`:

```ts
import { pickGooglePhoto } from './googlePhotosPicker'

vi.mock('./googleAuth', () => ({ requestGoogleAccessToken: vi.fn().mockResolvedValue('test-token') }))

const originalFetch = global.fetch
const originalOpen = window.open

beforeEach(() => {
  vi.useFakeTimers()
  window.open = vi.fn()
})

afterEach(() => {
  global.fetch = originalFetch
  window.open = originalOpen
  vi.useRealTimers()
})

test('drives the full flow and resolves with the picked photo as a File', async () => {
  const calls: unknown[] = []
  global.fetch = vi.fn(async (_url, opts) => {
    const body = opts?.body ? JSON.parse(opts.body as string) : null
    calls.push(body)
    if (body?.action === 'create') {
      return new Response(JSON.stringify({
        id: 'session-1', pickerUri: 'https://photos.google.com/picker/session-1',
        pollingConfig: { pollInterval: '2s', timeoutIn: '300s' }, mediaItemsSet: false,
      }), { status: 200 })
    }
    if (body?.action === 'get') {
      return new Response(JSON.stringify({ id: 'session-1', mediaItemsSet: true }), { status: 200 })
    }
    if (body?.action === 'list') {
      return new Response(JSON.stringify({
        mediaItems: [{ id: 'item-1', baseUrl: 'https://example.com/photo', mimeType: 'image/jpeg' }],
      }), { status: 200 })
    }
    if (body?.action === 'download') {
      return new Response(new Blob(['fake-image-bytes']), { status: 200, headers: { 'Content-Type': 'image/jpeg' } })
    }
    if (body?.action === 'delete') {
      return new Response(JSON.stringify({ ok: true }), { status: 200 })
    }
    throw new Error(`unexpected action: ${body?.action}`)
  }) as typeof fetch

  const resultPromise = pickGooglePhoto()
  await vi.advanceTimersByTimeAsync(2000)
  const result = await resultPromise

  expect(window.open).toHaveBeenCalledWith('https://photos.google.com/picker/session-1', '_blank')
  expect(result).toBeInstanceOf(File)
  expect(result?.type).toBe('image/jpeg')
  expect(calls.map((c) => (c as { action: string }).action)).toEqual(['create', 'get', 'list', 'download', 'delete'])
})

test('resolves null if the session times out without a photo being picked', async () => {
  global.fetch = vi.fn(async (_url, opts) => {
    const body = opts?.body ? JSON.parse(opts.body as string) : null
    if (body?.action === 'create') {
      return new Response(JSON.stringify({
        id: 'session-2', pickerUri: 'https://photos.google.com/picker/session-2',
        pollingConfig: { pollInterval: '2s', timeoutIn: '4s' }, mediaItemsSet: false,
      }), { status: 200 })
    }
    if (body?.action === 'get') {
      return new Response(JSON.stringify({ id: 'session-2', mediaItemsSet: false }), { status: 200 })
    }
    if (body?.action === 'delete') {
      return new Response(JSON.stringify({ ok: true }), { status: 200 })
    }
    throw new Error(`unexpected action: ${body?.action}`)
  }) as typeof fetch

  const resultPromise = pickGooglePhoto()
  await vi.advanceTimersByTimeAsync(6000)
  const result = await resultPromise

  expect(result).toBeNull()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npx vitest run src/lib/googlePhotosPicker.test.ts`
Expected: FAIL — `./googlePhotosPicker` doesn't exist yet.

- [ ] **Step 3: Implement the orchestration**

Create `client/src/lib/googlePhotosPicker.ts`:

```ts
import { supabase } from './supabaseClient'
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
```

Note: `supabase` is imported but not directly called here — `import.meta.env.VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` are read directly since `callProxy` builds a raw `fetch`, not a `supabase.functions.invoke()` call (the proxy needs the *Google* token as its Authorization header, not the Supabase session/anon token — `supabase.functions.invoke()` always sends the Supabase client's own auth, which is the wrong credential here). Remove the unused `supabase` import if your editor/linter flags it — it was listed for clarity about why a raw `fetch` is used instead of the `supabase-js` functions client, but isn't actually referenced; delete that import line.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd client && npx vitest run src/lib/googlePhotosPicker.test.ts`
Expected: PASS, both tests green.

- [ ] **Step 5: Commit**

```bash
git add client/src/lib/googlePhotosPicker.ts client/src/lib/googlePhotosPicker.test.ts
git commit -m "Add Google Photos picker session orchestration"
```

---

### Task 4: "Import from Google Photos" button in PersonProfile

**Files:**
- Modify: `client/src/components/profile/PersonProfile.tsx`
- Test: `client/src/components/profile/PersonProfile.test.tsx`
- Modify: `client/src/styles/global.css`

**Interfaces:**
- Consumes: `pickGooglePhoto()` from Task 3 — exact same `File | null` contract. Reuses the existing `onUploadPhoto` prop unchanged (no new prop, no `App.tsx` changes).

- [ ] **Step 1: Write the failing tests**

Add to `client/src/components/profile/PersonProfile.test.tsx`, after the existing `'uploading a photo shows an error message on failure'` test. First add the mock at the top of the file, alongside the existing `vi.mock('../../api/photos', ...)`:

```tsx
const mockPickGooglePhoto = vi.hoisted(() => vi.fn())
vi.mock('../../lib/googlePhotosPicker', () => ({ pickGooglePhoto: mockPickGooglePhoto }))
```

Then add the tests:

```tsx
test('clicking "Import from Google Photos" uploads the picked file the same way as a local upload', async () => {
  const pickedFile = new File(['data'], 'google-photo.jpg', { type: 'image/jpeg' })
  mockPickGooglePhoto.mockResolvedValue(pickedFile)
  const onUploadPhoto = vi.fn().mockResolvedValue({ ok: true })
  render(<PersonProfile {...baseProps({ onUploadPhoto })} />)

  fireEvent.click(screen.getByText('Import from Google Photos'))

  await waitFor(() => expect(onUploadPhoto).toHaveBeenCalledWith(pickedFile))
  await waitFor(() => expect(screen.getByText('Photo uploaded.')).toBeInTheDocument())
})

test('does nothing if the user closes the picker without choosing a photo', async () => {
  mockPickGooglePhoto.mockResolvedValue(null)
  const onUploadPhoto = vi.fn()
  render(<PersonProfile {...baseProps({ onUploadPhoto })} />)

  fireEvent.click(screen.getByText('Import from Google Photos'))

  await waitFor(() => expect(mockPickGooglePhoto).toHaveBeenCalledOnce())
  expect(onUploadPhoto).not.toHaveBeenCalled()
})

test('shows an error message if fetching the Google photo fails', async () => {
  mockPickGooglePhoto.mockRejectedValue(new Error('Google Identity Services did not load'))
  render(<PersonProfile {...baseProps()} />)

  fireEvent.click(screen.getByText('Import from Google Photos'))

  await waitFor(() => expect(screen.getByText('Google Identity Services did not load')).toBeInTheDocument())
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd client && npx vitest run src/components/profile/PersonProfile.test.tsx -t "Google Photos"`
Expected: FAIL — no "Import from Google Photos" button exists yet, and `../../lib/googlePhotosPicker` doesn't exist for the mock to attach to (this second failure is expected and resolves once Task 3 is merged into the same branch — if running this task's tests in isolation before Task 3 lands, the mock's target module must exist first; in the full plan sequence Task 3 runs before Task 4, so this is a non-issue).

- [ ] **Step 3: Add the button and shared upload handling**

In `client/src/components/profile/PersonProfile.tsx`, add the import:

```tsx
import { pickGooglePhoto } from '../../lib/googlePhotosPicker'
```

Refactor `handleFileChange` to extract a shared `handleFile` used by both the native file input and the new Google Photos path:

```tsx
  function handleFile(file: File) {
    setUploadStatus({ state: 'uploading' })
    void onUploadPhoto(file).then((result) => {
      if (result.ok) {
        setUploadStatus({ state: 'success' })
        void listPhotos(person.id).then(setPhotos)
      } else {
        setUploadStatus({ state: 'error', message: result.message })
      }
    })
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    handleFile(file)
  }

  function handleGooglePhotoClick() {
    setUploadStatus({ state: 'uploading' })
    pickGooglePhoto()
      .then((file) => {
        if (file) {
          handleFile(file)
        } else {
          setUploadStatus({ state: 'idle' })
        }
      })
      .catch((err: unknown) => {
        setUploadStatus({ state: 'error', message: err instanceof Error ? err.message : 'Could not import from Google Photos.' })
      })
  }
```

(This replaces the existing `handleFileChange` function — `handleFile` is new, and `handleFileChange`'s body shrinks to just extracting the file and delegating to `handleFile`.)

Wrap the existing "Upload photo" `<Button>` and the new button in a `photo-actions` div, so both buttons stack cleanly in the narrow 200px photo column instead of relying on default inline wrapping:

```tsx
        <div className="photo-actions">
          <Button variant="ghost" onClick={() => fileInputRef.current?.click()} disabled={uploadStatus.state === 'uploading'}>
            <Icon name="photo" size={14} /> {uploadStatus.state === 'uploading' ? 'Uploading…' : 'Upload photo'}
          </Button>
          <Button variant="ghost" onClick={handleGooglePhotoClick} disabled={uploadStatus.state === 'uploading'}>
            <Icon name="photo" size={14} /> Import from Google Photos
          </Button>
        </div>
```

This replaces the single existing `<Button variant="ghost" onClick={() => fileInputRef.current?.click()} ...>Upload photo</Button>` line — don't leave the old unwrapped copy in place.

In `client/src/styles/global.css`, add this rule directly after the existing `.upload-status-error` rule:

```css
.photo-actions { display: flex; flex-direction: column; gap: 8px; margin-bottom: 4px; }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd client && npx vitest run src/components/profile/PersonProfile.test.tsx`
Expected: PASS, full file green (existing tests + 3 new ones).

- [ ] **Step 5: Run the full client test suite**

Run: `cd client && npm test`
Expected: PASS, entire suite green.

- [ ] **Step 6: Commit**

```bash
git add client/src/components/profile/PersonProfile.tsx client/src/components/profile/PersonProfile.test.tsx
git commit -m "Add Import from Google Photos button to the profile panel"
```

---

### Task 5: Config, deploy wiring, and the manual setup checklist

**Files:**
- Modify: `client/src/vite-env.d.ts` (create if it doesn't already exist)
- Modify: `.github/workflows/deploy.yml`
- Modify: `README.md`
- Create: `docs/google-photos-setup.md`

**Interfaces:**
- Produces: the `VITE_GOOGLE_CLIENT_ID` environment variable, consumed by Task 2's `googleAuth.ts`.

- [ ] **Step 1: Check for an existing `vite-env.d.ts`**

Run: `test -f client/src/vite-env.d.ts && cat client/src/vite-env.d.ts || echo "does not exist"`

If it doesn't exist, create `client/src/vite-env.d.ts`:

```ts
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_GOOGLE_CLIENT_ID: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
```

If it already exists (e.g. from a Vite scaffold default), add `readonly VITE_GOOGLE_CLIENT_ID: string` to its existing `ImportMetaEnv` interface instead of overwriting the file.

- [ ] **Step 2: Wire the env var into the deploy workflow**

In `.github/workflows/deploy.yml`, find the `env:` block under the `npm run build` step (currently listing `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`) and add:

```yaml
          VITE_GOOGLE_CLIENT_ID: ${{ secrets.VITE_GOOGLE_CLIENT_ID }}
```

- [ ] **Step 3: Update local-dev instructions in README.md**

Find the line documenting the local dev command (currently `VITE_SUPABASE_URL=<your project URL> VITE_SUPABASE_ANON_KEY=<your anon key> npm run dev`) and add `VITE_GOOGLE_CLIENT_ID=<your OAuth client ID>` to it. Find the GitHub Pages secrets-setup step (currently listing the same two secret names) and add `VITE_GOOGLE_CLIENT_ID` to that list too.

- [ ] **Step 4: Write the manual setup checklist**

Create `docs/google-photos-setup.md`:

```markdown
# Google Photos import — manual setup

One-time setup in Google Cloud Console, needed before the "Import from Google Photos" button will work. No code changes here — this is account/console configuration only.

1. Go to [Google Cloud Console](https://console.cloud.google.com/) and create a new project (or pick an existing one you're comfortable using for this).
2. **Enable the Google Photos Picker API**: APIs & Services → Library → search "Google Photos Picker API" → Enable.
3. **Configure the OAuth consent screen**: APIs & Services → OAuth consent screen.
   - User type: **External** (family members use personal Gmail accounts, not a Google Workspace org).
   - Fill in the required app name/support email fields (any reasonable values — this is a private family tool, not a published app).
   - Add the scope `.../auth/photospicker.mediaitems.readonly` under "Scopes."
   - Add each family member's Gmail address under "Test users" — **while the app is in "Testing" publishing status, only listed test users can complete sign-in.** (Publishing to "Production" removes this restriction but triggers Google's verification process, which isn't necessary for a private family tool — stay in Testing and just list everyone who needs access as a test user.)
4. **Create an OAuth 2.0 Client ID**: APIs & Services → Credentials → Create Credentials → OAuth client ID.
   - Application type: **Web application**.
   - Authorized JavaScript origins: add the app's GitHub Pages URL (e.g. `https://<username>.github.io`) and, for local development, `http://localhost:5173`.
   - No redirect URI is needed for this flow (it's a token-only popup flow, not a redirect-based one).
   - Copy the resulting **Client ID** (not the secret — this flow doesn't use one).
5. **Set the Client ID in two places:**
   - As a GitHub repository secret named `VITE_GOOGLE_CLIENT_ID` (Settings → Secrets and variables → Actions) — used by the deploy workflow.
   - In your local `.env` (or however you run `npm run dev`) as `VITE_GOOGLE_CLIENT_ID=<the client ID>`.
6. **Deploy the Edge Function** (if not already done as part of implementing this feature): `cd supabase && npx supabase functions deploy google-photos-proxy --no-verify-jwt`. The `--no-verify-jwt` flag is required — see the function's own top comment for why. It needs no secrets of its own.

That's it — no Supabase Dashboard changes, no database migrations, no allowlist to maintain. Adding or removing who can use the feature means editing the OAuth consent screen's test-user list in step 3.
```

- [ ] **Step 5: Run the full client test suite one more time**

Run: `cd client && npm test`
Expected: PASS, entire suite green — confirms `vite-env.d.ts` changes didn't break the TypeScript build (`cd client && npx tsc --noEmit` should also stay clean).

- [ ] **Step 6: Commit**

```bash
git add client/src/vite-env.d.ts .github/workflows/deploy.yml README.md docs/google-photos-setup.md
git commit -m "Wire up VITE_GOOGLE_CLIENT_ID and document manual Google Cloud setup"
```

---

## Post-plan: session log

Per this repo's `CLAUDE.md` session-logging convention, append an entry to the active `docs/sessions/YYYY-MM-DD-*.md` file for today recording: the request (Spec 3: Google Photos import, superseding the original Spec 3a Google-sign-in-as-unlock design per clarification), what was done (Edge Function proxy, Google Identity Services token helper, picker session orchestration, PersonProfile UI, config/docs — Tasks 1-5), and the outcome (commit SHAs, tests passing, and the fact that Task 1's manual verification step and the whole feature's end-to-end functioning both depend on the user completing `docs/google-photos-setup.md`'s external setup, which hasn't happened yet as of this plan's authoring).
