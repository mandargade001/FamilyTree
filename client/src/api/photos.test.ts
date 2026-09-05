import { vi } from 'vitest'

const { mockInvoke } = vi.hoisted(() => ({ mockInvoke: vi.fn() }))

vi.mock('../lib/passphrase', () => ({ getPassphrase: () => 'sesame' }))
vi.mock('../lib/supabaseClient', () => ({
  supabase: { functions: { invoke: mockInvoke } },
}))

import { uploadPhoto } from './photos'

test('uploadPhoto invokes the upload-photo function with a FormData payload', async () => {
  mockInvoke.mockResolvedValue({ data: { path: 'meera/photo.jpg' }, error: null })
  const file = new File(['data'], 'photo.jpg', { type: 'image/jpeg' })

  await uploadPhoto('meera', file)

  expect(mockInvoke).toHaveBeenCalledOnce()
  const [name, options] = mockInvoke.mock.calls[0]
  expect(name).toBe('upload-photo')
  const body = options.body as FormData
  expect(body.get('passphrase')).toBe('sesame')
  expect(body.get('personId')).toBe('meera')
  expect(body.get('file')).toBe(file)
})

test('uploadPhoto throws when the function returns an HTTP error', async () => {
  const context = { json: async () => ({ error: 'incorrect passphrase' }) }
  const { FunctionsHttpError } = await import('@supabase/supabase-js')
  mockInvoke.mockResolvedValue({ data: null, error: new FunctionsHttpError(context as unknown as Response) })
  const file = new File(['data'], 'photo.jpg', { type: 'image/jpeg' })
  await expect(uploadPhoto('meera', file)).rejects.toThrow('incorrect passphrase')
})

test('uploadPhoto throws a generic error for non-HTTP failures', async () => {
  mockInvoke.mockResolvedValue({ data: null, error: new Error('network down') })
  const file = new File(['data'], 'photo.jpg', { type: 'image/jpeg' })
  await expect(uploadPhoto('meera', file)).rejects.toThrow('network down')
})
