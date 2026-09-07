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
