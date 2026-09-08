import type { AncestorRow, AncestorUnit } from './familyGraph'

export interface ColumnSpan {
  start: number
  end: number
}

// Computes each ancestor-row unit's horizontal column span (half-open,
// [start, end)) so a unit renders positioned directly above the specific
// person (its `childId`) it's the parent-pair of, with siblings in the
// same generation never overlapping.
//
// Pass 1 (bottom-up): each unit's required width is 2 if it has a recorded
// spouse, 1 otherwise — UNLESS its own parents are also present in the next
// row, in which case its width becomes the SUM of whatever width every
// personId-side and every spouseId-side parent-unit needs. Normally a
// side (personId or spouseId) has at most one matching parent-unit in the
// next row, but it can have more than one: when two co-parents of the same
// child have no recorded spouse relationship between them,
// `buildAncestorRows` emits two separate units that both have that same
// `childId` — so a side's width must be the sum across ALL matching units,
// not just one, or a real parent silently loses their reserved space. A
// side with zero matching units still reserves width 1. A lineage's
// footprint never shrinks going further back, only grows or stays flat.
//
// Pass 2 (top-down): depth 0's own span is [0, requiredWidth) — note this
// is NOT hardcoded to exactly 2 (or 1 solo); it's the same required-width
// computation as every other unit, so the focal couple's own reserved
// space widens too when one side's ancestry needs more room than the
// other's. Every other unit's span is a sub-range within its child's own
// span — which, by construction in Pass 1, is exactly as wide as its side
// needs in total. When a side has multiple matching units (the
// no-recorded-spouse case above), they're laid out side by side within
// that side's reserved sub-range, each taking exactly its own
// requiredWidth, so spans never overlap and the side's total consumed
// width matches Pass 1 exactly.
export function computeAncestorLayout(rows: AncestorRow[]): Map<string, ColumnSpan> {
  const rowsByDepth = new Map<number, AncestorRow>()
  let maxDepth = 0
  for (const row of rows) {
    rowsByDepth.set(row.depth, row)
    if (row.depth > maxDepth) maxDepth = row.depth
  }

  // Pass 1: bottom-up required width, keyed by unit.personId.
  const requiredWidth = new Map<string, number>()
  const unitByChildId = new Map<number, Map<string, AncestorUnit[]>>()

  const sumWidth = (units: AncestorUnit[] | undefined): number => {
    if (!units || units.length === 0) return 1
    return units.reduce((sum, u) => sum + requiredWidth.get(u.personId)!, 0)
  }

  for (let depth = maxDepth; depth >= 0; depth--) {
    const row = rowsByDepth.get(depth)
    if (!row) continue
    const childMap = new Map<string, AncestorUnit[]>()
    for (const unit of row.units) {
      if (!unit.childId) continue
      const existing = childMap.get(unit.childId)
      if (existing) existing.push(unit)
      else childMap.set(unit.childId, [unit])
    }
    unitByChildId.set(depth, childMap)

    const nextChildMap = unitByChildId.get(depth + 1)
    for (const unit of row.units) {
      const personWidth = sumWidth(nextChildMap?.get(unit.personId))
      const spouseWidth = unit.spouseId ? sumWidth(nextChildMap?.get(unit.spouseId)) : 0
      requiredWidth.set(unit.personId, personWidth + spouseWidth)
    }
  }

  // Pass 2: top-down span assignment.
  const spans = new Map<string, ColumnSpan>()
  const rootRow = rowsByDepth.get(0)
  if (!rootRow || rootRow.units.length === 0) return spans
  const rootUnit = rootRow.units[0]
  spans.set(rootUnit.personId, { start: 0, end: requiredWidth.get(rootUnit.personId) ?? (rootUnit.spouseId ? 2 : 1) })

  // Lay out a side's matching units side by side within [start, start + total).
  const layoutSide = (units: AncestorUnit[] | undefined, start: number): void => {
    if (!units) return
    let cursor = start
    for (const unit of units) {
      const width = requiredWidth.get(unit.personId)!
      spans.set(unit.personId, { start: cursor, end: cursor + width })
      cursor += width
    }
  }

  for (let depth = 0; depth < maxDepth; depth++) {
    const row = rowsByDepth.get(depth)
    if (!row) continue
    const nextChildMap = unitByChildId.get(depth + 1)
    if (!nextChildMap) continue

    for (const unit of row.units) {
      const parentSpan = spans.get(unit.personId)
      if (!parentSpan) continue

      const personParents = nextChildMap.get(unit.personId)
      const personWidth = sumWidth(personParents)
      const personEnd = parentSpan.start + personWidth
      layoutSide(personParents, parentSpan.start)

      if (unit.spouseId) {
        const spouseParents = nextChildMap.get(unit.spouseId)
        layoutSide(spouseParents, personEnd)
      }
    }
  }

  return spans
}
