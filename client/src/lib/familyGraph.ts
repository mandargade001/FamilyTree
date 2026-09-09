import type { Relationship } from '../types'

export function getParentIds(personId: string, relationships: Relationship[]): string[] {
  return relationships
    .filter((r) => r.type === 'parent-child' && r.to_id === personId)
    .map((r) => r.from_id)
}

export function getChildIds(personId: string, relationships: Relationship[]): string[] {
  return relationships
    .filter((r) => r.type === 'parent-child' && r.from_id === personId)
    .map((r) => r.to_id)
}

export function getDescendantIds(personId: string, relationships: Relationship[]): string[] {
  return getChildIds(personId, relationships)
}

export function getSpouseIds(personId: string, relationships: Relationship[]): string[] {
  return relationships
    .filter((r) => r.type === 'spouse' && (r.from_id === personId || r.to_id === personId))
    .map((r) => (r.from_id === personId ? r.to_id : r.from_id))
}

export function getSiblingIds(personId: string, relationships: Relationship[]): string[] {
  const parents = getParentIds(personId, relationships)
  if (parents.length === 0) return []
  const siblingSet = new Set<string>()
  for (const parentId of parents) {
    for (const childId of getChildIds(parentId, relationships)) {
      if (childId !== personId) siblingSet.add(childId)
    }
  }
  return [...siblingSet]
}

export interface ImmediateFamily {
  parents: string[]
  spouse: string | null
  children: string[]
  siblings: string[]
}

export function computeImmediateFamily(personId: string, relationships: Relationship[]): ImmediateFamily {
  const spouses = getSpouseIds(personId, relationships)
  return {
    parents: getParentIds(personId, relationships),
    spouse: spouses[0] ?? null,
    children: getChildIds(personId, relationships),
    siblings: getSiblingIds(personId, relationships),
  }
}

export interface AncestorUnit {
  id: string
  personId: string
  spouseId: string | null
  childId: string | null
}

export interface AncestorRow {
  depth: number
  units: AncestorUnit[]
}

export function buildAncestorRows(focalId: string, relationships: Relationship[]): AncestorRow[] {
  const rows: AncestorRow[] = [{ depth: 0, units: [{ id: '0:root:' + focalId, personId: focalId, spouseId: getSpouseIds(focalId, relationships)[0] ?? null, childId: null }] }]

  let currentIds = [focalId]
  let depth = 0

  while (currentIds.length > 0) {
    depth += 1
    const units: AncestorUnit[] = []

    for (const id of currentIds) {
      const seenParentIds = new Set<string>()
      for (const parentId of getParentIds(id, relationships)) {
        if (seenParentIds.has(parentId)) continue
        const spouseId = getSpouseIds(parentId, relationships)[0] ?? null
        if (spouseId) seenParentIds.add(spouseId)
        seenParentIds.add(parentId)
        units.push({ id: `${depth}:${id}:${parentId}`, personId: parentId, spouseId, childId: id })
      }
    }

    if (units.length === 0) break
    rows.push({ depth, units })
    currentIds = units.flatMap((u) => (u.spouseId ? [u.personId, u.spouseId] : [u.personId]))
  }

  return rows
}
