import { vi } from 'vitest'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

vi.mock('../lib/passphrase', () => ({ getPassphrase: () => 'sesame' }))
vi.mock('../lib/supabaseClient', () => ({
  supabase: { functions: { url: 'https://project.functions.supabase.co' } },
}))

import { uploadPhoto } from './photos'

test('uploadPhoto posts a FormData payload with the passphrase and personId', async () => {
  mockFetch.mockResolvedValue({ ok: true, json: async () => ({ path: 'meera/photo.jpg' }) })
  const file = new File(['data'], 'photo.jpg', { type: 'image/jpeg' })

  await uploadPhoto('meera', file)

  expect(mockFetch).toHaveBeenCalledOnce()
  const [url, options] = mockFetch.mock.calls[0]
  expect(url).toContain('upload-photo')
  const body = options.body as FormData
  expect(body.get('passphrase')).toBe('sesame')
  expect(body.get('personId')).toBe('meera')
  expect(body.get('file')).toBe(file)
})

test('uploadPhoto throws when the function returns an error', async () => {
  mockFetch.mockResolvedValue({ ok: false, json: async () => ({ error: 'incorrect passphrase' }) })
  const file = new File(['data'], 'photo.jpg', { type: 'image/jpeg' })
  await expect(uploadPhoto('meera', file)).rejects.toThrow('incorrect passphrase')
})
