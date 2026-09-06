import type { Person } from '../types'

// A session-scale "just changed this" signal, not a long-lived badge — the
// fresh-stitch marker described in DESIGN.md should fade well within the
// same sitting, not linger across a future visit.
export const FRESH_WINDOW_MS = 10 * 60 * 1000 // 10 minutes

// A person counts as "fresh" when their updated_at falls strictly within the
// recency window ending now. `now` is injectable for testing; a value exactly
// at the boundary (age === FRESH_WINDOW_MS) is treated as no longer fresh —
// the window is a half-open (now - window, now] interval.
export function isFresh(person: Pick<Person, 'updated_at'>, now: number = Date.now()): boolean {
  const updatedAt = Date.parse(person.updated_at)
  if (Number.isNaN(updatedAt)) return false
  const age = now - updatedAt
  return age >= 0 && age < FRESH_WINDOW_MS
}
