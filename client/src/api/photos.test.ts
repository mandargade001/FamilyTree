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

import { uploadPhoto, listPhotos, getPrimaryPhoto, invalidatePrimaryPhoto } from './photos'

// getPrimaryPhoto caches its result per personId at module scope (see
// Finding 3 in the final-fix report), so results from an earlier test can
// otherwise leak into a later one that reuses the same personId. Explicitly
// invalidate every personId this file exercises before each test to keep
// tests independent of run order.
beforeEach(() => {
  invalidatePrimaryPhoto('meera')
  invalidatePrimaryPhoto('nobody')
  invalidatePrimaryPhoto('ravi')
  mockInvoke.mockClear()
  mockList.mockClear()
  mockGetPublicUrl.mockClear()
})

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

test('getPrimaryPhoto requests only one entry and returns its public URL', async () => {
  mockList.mockResolvedValue({ data: [{ name: 'a.jpg' }], error: null })
  mockGetPublicUrl.mockImplementation((path: string) => ({ data: { publicUrl: `https://cdn.example/${path}` } }))

  const url = await getPrimaryPhoto('meera')

  expect(mockList).toHaveBeenCalledWith('meera', { limit: 1 })
  expect(url).toBe('https://cdn.example/meera/a.jpg')
})

test('getPrimaryPhoto returns null when the person has no photos', async () => {
  mockList.mockResolvedValue({ data: [], error: null })
  await expect(getPrimaryPhoto('nobody')).resolves.toBeNull()
})

test('getPrimaryPhoto returns null instead of throwing when listing fails', async () => {
  mockList.mockResolvedValue({ data: null, error: new Error('boom') })
  await expect(getPrimaryPhoto('meera')).resolves.toBeNull()
})

test('getPrimaryPhoto caches per personId, so a second call does not re-invoke Storage list()', async () => {
  mockList.mockResolvedValue({ data: [{ name: 'a.jpg' }], error: null })
  mockGetPublicUrl.mockImplementation((path: string) => ({ data: { publicUrl: `https://cdn.example/${path}` } }))

  const first = await getPrimaryPhoto('ravi')
  const second = await getPrimaryPhoto('ravi')

  expect(mockList).toHaveBeenCalledOnce()
  expect(first).toBe('https://cdn.example/ravi/a.jpg')
  expect(second).toBe('https://cdn.example/ravi/a.jpg')
})

test('getPrimaryPhoto de-dupes concurrent in-flight lookups for the same personId', async () => {
  let resolveList!: (v: { data: { name: string }[]; error: null }) => void
  mockList.mockReturnValue(new Promise((resolve) => { resolveList = resolve }))
  mockGetPublicUrl.mockImplementation((path: string) => ({ data: { publicUrl: `https://cdn.example/${path}` } }))

  const p1 = getPrimaryPhoto('ravi')
  const p2 = getPrimaryPhoto('ravi')
  resolveList({ data: [{ name: 'a.jpg' }], error: null })

  await expect(p1).resolves.toBe('https://cdn.example/ravi/a.jpg')
  await expect(p2).resolves.toBe('https://cdn.example/ravi/a.jpg')
  expect(mockList).toHaveBeenCalledOnce()
})

test('invalidatePrimaryPhoto clears the cached entry so the next call re-fetches', async () => {
  mockList.mockResolvedValue({ data: [{ name: 'a.jpg' }], error: null })
  mockGetPublicUrl.mockImplementation((path: string) => ({ data: { publicUrl: `https://cdn.example/${path}` } }))

  await getPrimaryPhoto('ravi')
  invalidatePrimaryPhoto('ravi')
  mockList.mockResolvedValue({ data: [{ name: 'b.jpg' }], error: null })
  const url = await getPrimaryPhoto('ravi')

  expect(mockList).toHaveBeenCalledTimes(2)
  expect(url).toBe('https://cdn.example/ravi/b.jpg')
})

test('uploadPhoto invalidates the cached primary photo for that person', async () => {
  mockList.mockResolvedValue({ data: [{ name: 'old.jpg' }], error: null })
  mockGetPublicUrl.mockImplementation((path: string) => ({ data: { publicUrl: `https://cdn.example/${path}` } }))
  await getPrimaryPhoto('ravi')

  mockInvoke.mockResolvedValue({ data: { path: 'ravi/new.jpg' }, error: null })
  await uploadPhoto('ravi', new File(['data'], 'new.jpg', { type: 'image/jpeg' }))

  mockList.mockResolvedValue({ data: [{ name: 'new.jpg' }], error: null })
  const url = await getPrimaryPhoto('ravi')

  expect(mockList).toHaveBeenCalledTimes(2)
  expect(url).toBe('https://cdn.example/ravi/new.jpg')
})
