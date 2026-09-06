import { vi } from 'vitest'

const { mockInvoke, mockList, mockGetPublicUrl } = vi.hoisted(() => ({
  mockInvoke: vi.fn(),
  mockList: vi.fn(),
  mockGetPublicUrl: vi.fn(),
}))

vi.mock('../lib/passphrase', () => ({ getPassphrase: () => 'sesame' }))
vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    functions: { invoke: mockInvoke },
    storage: {
      from: () => ({ list: mockList, getPublicUrl: mockGetPublicUrl }),
    },
  },
}))

import { uploadPhoto, listPhotos } from './photos'

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

test('listPhotos returns public URLs for each file in the person folder', async () => {
  mockList.mockResolvedValue({ data: [{ name: 'a.jpg' }, { name: 'b.png' }], error: null })
  mockGetPublicUrl.mockImplementation((path: string) => ({ data: { publicUrl: `https://cdn.example/${path}` } }))

  const urls = await listPhotos('meera')

  expect(mockList).toHaveBeenCalledWith('meera')
  expect(urls).toEqual(['https://cdn.example/meera/a.jpg', 'https://cdn.example/meera/b.png'])
})

test('listPhotos returns an empty array when the folder does not exist yet', async () => {
  mockList.mockResolvedValue({ data: [], error: null })
  const urls = await listPhotos('nobody')
  expect(urls).toEqual([])
})

test('listPhotos returns an empty array instead of throwing when listing fails', async () => {
  mockList.mockResolvedValue({ data: null, error: new Error('boom') })
  await expect(listPhotos('meera')).resolves.toEqual([])
})
