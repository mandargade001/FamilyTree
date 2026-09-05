import { getPassphrase, setPassphrase, clearPassphrase } from './passphrase'

beforeEach(() => localStorage.clear())

test('returns null when nothing is stored', () => {
  expect(getPassphrase()).toBeNull()
})

test('stores and retrieves the passphrase', () => {
  setPassphrase('sesame')
  expect(getPassphrase()).toBe('sesame')
})

test('clearPassphrase removes it', () => {
  setPassphrase('sesame')
  clearPassphrase()
  expect(getPassphrase()).toBeNull()
})
