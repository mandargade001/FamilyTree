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
// row, in which case its width becomes the sum of whatever width its own
// personId-side and spouseId-side parent-units need. A lineage's footprint
// never shrinks going further back, only grows or stays flat.
//
// Pass 2 (top-down): depth 0's own span is [0, requiredWidth) — note this
// is NOT hardcoded to exactly 2 (or 1 solo); it's the same required-width
// computation as every other unit, so the focal couple's own reserved
// space widens too when one side's ancestry needs more room than the
// other's. Every other unit's span is the exact sub-range its own personId
// or spouseId occupies within its child's own span — which, by
// construction in Pass 1, is exactly as wide as this unit itself needs. No
// further splitting math is required.
export function computeAncestorLayout(rows: AncestorRow[]): Map<string, ColumnSpan> {
  const rowsByDepth = new Map<number, AncestorRow>()
  let maxDepth = 0
  for (const row of rows) {
    rowsByDepth.set(row.depth, row)
    if (row.depth > maxDepth) maxDepth = row.depth
  }

  // Pass 1: bottom-up required width, keyed by unit.personId.
  const requiredWidth = new Map<string, number>()
  const unitByChildId = new Map<number, Map<string, AncestorUnit>>()

  for (let depth = maxDepth; depth >= 0; depth--) {
    const row = rowsByDepth.get(depth)
    if (!row) continue
    const childMap = new Map<string, AncestorUnit>()
    for (const unit of row.units) {
      if (unit.childId) childMap.set(unit.childId, unit)
    }
    unitByChildId.set(depth, childMap)

    const nextChildMap = unitByChildId.get(depth + 1)
    for (const unit of row.units) {
      const personParent = nextChildMap?.get(unit.personId)
      const personWidth = personParent ? requiredWidth.get(personParent.personId)! : 1
      let spouseWidth = 0
      if (unit.spouseId) {
        const spouseParent = nextChildMap?.get(unit.spouseId)
        spouseWidth = spouseParent ? requiredWidth.get(spouseParent.personId)! : 1
      }
      requiredWidth.set(unit.personId, personWidth + spouseWidth)
    }
  }

  // Pass 2: top-down span assignment.
  const spans = new Map<string, ColumnSpan>()
  const rootRow = rowsByDepth.get(0)
  if (!rootRow || rootRow.units.length === 0) return spans
  const rootUnit = rootRow.units[0]
  spans.set(rootUnit.personId, { start: 0, end: requiredWidth.get(rootUnit.personId) ?? (rootUnit.spouseId ? 2 : 1) })

  for (let depth = 0; depth < maxDepth; depth++) {
    const row = rowsByDepth.get(depth)
    if (!row) continue
    const nextChildMap = unitByChildId.get(depth + 1)
    if (!nextChildMap) continue

    for (const unit of row.units) {
      const parentSpan = spans.get(unit.personId)
      if (!parentSpan) continue

      const personParent = nextChildMap.get(unit.personId)
      const personWidth = personParent ? requiredWidth.get(personParent.personId)! : 1
      const personEnd = parentSpan.start + personWidth
      if (personParent) spans.set(personParent.personId, { start: parentSpan.start, end: personEnd })

      if (unit.spouseId) {
        const spouseParent = nextChildMap.get(unit.spouseId)
        if (spouseParent) spans.set(spouseParent.personId, { start: personEnd, end: parentSpan.end })
      }
    }
  }

  return spans
}
