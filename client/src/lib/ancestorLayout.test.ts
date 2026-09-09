import { describe, expect, test } from 'vitest'
import type { AncestorRow } from './familyGraph'
import { computeAncestorLayout } from './ancestorLayout'

describe('computeAncestorLayout', () => {
  test('a solo focal person with no recorded spouse gets a single-column span', () => {
    const rows: AncestorRow[] = [{ depth: 0, units: [{ id: 'meera', personId: 'meera', spouseId: null, childId: null }] }]
    const spans = computeAncestorLayout(rows)
    expect(spans.get('meera')).toEqual({ start: 0, end: 1 })
  })

  test('a focal couple with no recorded ancestors gets a two-column span', () => {
    const rows: AncestorRow[] = [{ depth: 0, units: [{ id: 'mangal', personId: 'mangal', spouseId: 'kishan', childId: null }] }]
    const spans = computeAncestorLayout(rows)
    expect(spans.get('mangal')).toEqual({ start: 0, end: 2 })
  })

  test("one side's recorded parents render in that side's own portion, leaving room on the other side", () => {
    const rows: AncestorRow[] = [
      { depth: 0, units: [{ id: 'mangal', personId: 'mangal', spouseId: 'kishan', childId: null }] },
      { depth: 1, units: [{ id: 'hanmantrao', personId: 'hanmantrao', spouseId: 'saraswati', childId: 'mangal' }] },
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
      { depth: 0, units: [{ id: 'mangal', personId: 'mangal', spouseId: 'kishan', childId: null }] },
      {
        depth: 1,
        units: [
          { id: 'hanmantrao', personId: 'hanmantrao', spouseId: 'saraswati', childId: 'mangal' },
          { id: 'kishan_dad', personId: 'kishan_dad', spouseId: 'kishan_mom', childId: 'kishan' },
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
      { depth: 0, units: [{ id: 'mangal', personId: 'mangal', spouseId: 'kishan', childId: null }] },
      { depth: 1, units: [{ id: 'hanmantrao', personId: 'hanmantrao', spouseId: 'saraswati', childId: 'mangal' }] },
      { depth: 2, units: [{ id: 'great_grandpa', personId: 'great_grandpa', spouseId: 'great_grandma', childId: 'hanmantrao' }] },
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

  // Finding 1 (Critical): buildAncestorRows emits two separate units that
  // share the same childId whenever two co-parents have no recorded spouse
  // relationship between them — the app's own default guided "add a
  // parent" flow produces exactly this. Both units must still get a valid,
  // non-overlapping span, and together they must consume exactly the width
  // a single 2-wide unit would have needed, or one parent silently vanishes
  // from the rendered tree.
  test('two co-parents with no recorded spouse relationship both get non-overlapping spans', () => {
    const rows: AncestorRow[] = [
      { depth: 0, units: [{ id: 'mangal', personId: 'mangal', spouseId: 'kishan', childId: null }] },
      {
        depth: 1,
        units: [
          { id: 'father', personId: 'father', spouseId: null, childId: 'mangal' },
          { id: 'mother', personId: 'mother', spouseId: null, childId: 'mangal' },
        ],
      },
    ]
    const spans = computeAncestorLayout(rows)

    const fatherSpan = spans.get('father')
    const motherSpan = spans.get('mother')
    expect(fatherSpan).toBeDefined()
    expect(motherSpan).toBeDefined()

    // Non-overlapping and contiguous.
    expect(fatherSpan!.end - fatherSpan!.start).toBe(1)
    expect(motherSpan!.end - motherSpan!.start).toBe(1)
    const [first, second] = [fatherSpan!, motherSpan!].sort((a, b) => a.start - b.start)
    expect(second.start).toBe(first.end)

    // Combined width matches what a single 2-wide (spouse-recorded) unit
    // would have needed for mangal's own personId-side reservation.
    expect(second.end - first.start).toBe(2)

    // mangal's own side (kishan's, still unrecorded) still reserves 1, so
    // mangal's total span is 2 (father+mother) + 1 (kishan) = 3.
    expect(spans.get('mangal')).toEqual({ start: 0, end: 3 })
  })

  test('computeAncestorLayout gives two units sharing a personId distinct, non-overlapping spans', () => {
    // Kunal's two depth-1 parents (ila, om) both trace back to the same
    // depth-2 ancestor, grandma — a pedigree collapse producing two
    // AncestorUnits with personId 'grandma' but different ids.
    const rows: AncestorRow[] = [
      { depth: 0, units: [{ id: '0:root:kunal', personId: 'kunal', spouseId: null, childId: null }] },
      {
        depth: 1,
        units: [
          { id: '1:kunal:ila', personId: 'ila', spouseId: null, childId: 'kunal' },
          { id: '1:kunal:om', personId: 'om', spouseId: null, childId: 'kunal' },
        ],
      },
      {
        depth: 2,
        units: [
          { id: '2:ila:grandma', personId: 'grandma', spouseId: null, childId: 'ila' },
          { id: '2:om:grandma', personId: 'grandma', spouseId: null, childId: 'om' },
        ],
      },
    ]
    const spans = computeAncestorLayout(rows)
    const span1 = spans.get('2:ila:grandma')
    const span2 = spans.get('2:om:grandma')
    expect(span1).toBeDefined()
    expect(span2).toBeDefined()
    // Non-overlapping: one entirely before the other.
    expect(span1!.end <= span2!.start || span2!.end <= span1!.start).toBe(true)
  })
})
