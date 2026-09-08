import { describe, expect, test } from 'vitest'
import type { AncestorRow } from './familyGraph'
import { computeAncestorLayout } from './ancestorLayout'

describe('computeAncestorLayout', () => {
  test('a solo focal person with no recorded spouse gets a single-column span', () => {
    const rows: AncestorRow[] = [{ depth: 0, units: [{ personId: 'meera', spouseId: null, childId: null }] }]
    const spans = computeAncestorLayout(rows)
    expect(spans.get('meera')).toEqual({ start: 0, end: 1 })
  })

  test('a focal couple with no recorded ancestors gets a two-column span', () => {
    const rows: AncestorRow[] = [{ depth: 0, units: [{ personId: 'mangal', spouseId: 'kishan', childId: null }] }]
    const spans = computeAncestorLayout(rows)
    expect(spans.get('mangal')).toEqual({ start: 0, end: 2 })
  })

  test("one side's recorded parents render in that side's own portion, leaving room on the other side", () => {
    const rows: AncestorRow[] = [
      { depth: 0, units: [{ personId: 'mangal', spouseId: 'kishan', childId: null }] },
      { depth: 1, units: [{ personId: 'hanmantrao', spouseId: 'saraswati', childId: 'mangal' }] },
    ]
    const spans = computeAncestorLayout(rows)
    // Mangal's own reserved width grows to 3 (2 for her parents' couple + 1
    // reserved for Kishan's still-unrecorded side) even though the visible
    // couple itself is only 2 people — this is the intended, documented
    // "the focal couple's box centers within whatever width its ancestry
    // needs" behavior, not a bug.
    expect(spans.get('mangal')).toEqual({ start: 0, end: 3 })
    expect(spans.get('hanmantrao')).toEqual({ start: 0, end: 2 })
    // Kishan's own side has no unit at all (no parents recorded), so no
    // span exists for him — nothing to look up.
    expect(spans.has('kishan')).toBe(false)
  })

  test('both sides having recorded parents places them side by side, never overlapping', () => {
    const rows: AncestorRow[] = [
      { depth: 0, units: [{ personId: 'mangal', spouseId: 'kishan', childId: null }] },
      {
        depth: 1,
        units: [
          { personId: 'hanmantrao', spouseId: 'saraswati', childId: 'mangal' },
          { personId: 'kishan_dad', spouseId: 'kishan_mom', childId: 'kishan' },
        ],
      },
    ]
    const spans = computeAncestorLayout(rows)
    expect(spans.get('mangal')).toEqual({ start: 0, end: 4 })
    expect(spans.get('hanmantrao')).toEqual({ start: 0, end: 2 })
    expect(spans.get('kishan_dad')).toEqual({ start: 2, end: 4 })
  })

  test("a deeper ancestor on one side widens every generation below it on that same side", () => {
    const rows: AncestorRow[] = [
      { depth: 0, units: [{ personId: 'mangal', spouseId: 'kishan', childId: null }] },
      { depth: 1, units: [{ personId: 'hanmantrao', spouseId: 'saraswati', childId: 'mangal' }] },
      { depth: 2, units: [{ personId: 'great_grandpa', spouseId: 'great_grandma', childId: 'hanmantrao' }] },
    ]
    const spans = computeAncestorLayout(rows)
    // hanmantrao's own required width becomes 2 (his parents' couple) + 1
    // (saraswati, no recorded parents) = 3, which then makes mangal's own
    // width 3 (hanmantrao's side) + 1 (kishan's still-empty side) = 4.
    expect(spans.get('mangal')).toEqual({ start: 0, end: 4 })
    expect(spans.get('hanmantrao')).toEqual({ start: 0, end: 3 })
    expect(spans.get('great_grandpa')).toEqual({ start: 0, end: 2 })
  })

  test('an empty rows array returns an empty map rather than throwing', () => {
    expect(computeAncestorLayout([]).size).toBe(0)
  })
})
