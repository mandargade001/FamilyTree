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
