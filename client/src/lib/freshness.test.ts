import { isFresh, FRESH_WINDOW_MS } from './freshness'

const NOW = Date.parse('2026-09-06T12:00:00.000Z')

test('a person updated 1 minute ago is fresh', () => {
  const updatedAt = new Date(NOW - 60 * 1000).toISOString()
  expect(isFresh({ updated_at: updatedAt }, NOW)).toBe(true)
})

test('a person updated 2 hours ago is not fresh', () => {
  const updatedAt = new Date(NOW - 2 * 60 * 60 * 1000).toISOString()
  expect(isFresh({ updated_at: updatedAt }, NOW)).toBe(false)
})

// Boundary judgment call: the window is treated as half-open, (now - window, now],
// so a person updated exactly FRESH_WINDOW_MS ago is no longer fresh — the
// badge fully expires at the stated threshold rather than lingering one tick
// past it.
test('a person updated exactly at the window boundary is no longer fresh', () => {
  const updatedAt = new Date(NOW - FRESH_WINDOW_MS).toISOString()
  expect(isFresh({ updated_at: updatedAt }, NOW)).toBe(false)
})

test('a person updated in the future (clock skew) is not treated as fresh', () => {
  const updatedAt = new Date(NOW + 1000).toISOString()
  expect(isFresh({ updated_at: updatedAt }, NOW)).toBe(false)
})

test('an invalid updated_at is not fresh', () => {
  expect(isFresh({ updated_at: 'not-a-date' }, NOW)).toBe(false)
})
