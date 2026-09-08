import type { Person, Relationship } from '../types'
import { getParentIds, getSpouseIds } from './familyGraph'

function isBlank(value: string | null): boolean {
  return value === null || value.trim().length === 0
}

function findFather(personId: string, peopleById: Map<string, Person>, relationships: Relationship[]): Person | null {
  for (const parentId of getParentIds(personId, relationships)) {
    const parent = peopleById.get(parentId)
    if (parent?.gender === 'Male') return parent
  }
  return null
}

export interface LastNameUpdate {
  id: string
  last_name: string
}

// Fills in a blank last_name for anyone whose gender and relationships make
// it unambiguous, per this family's patriarchal naming convention: sons
// inherit their father's last name permanently; daughters inherit their
// father's last name until marriage, then their spouse's. Never touches a
// person who already has any last_name value — that's a load-bearing
// invariant, not an optimization, since the caller treats "already has a
// value" as "a person set this on purpose." Iterates to a fixed point so
// that resolving one person's name in this pass can immediately resolve
// their own children or spouse too (e.g. filling in a root ancestor's name
// for the first time cascades through the whole currently-blank lineage in
// one call).
export function resolveLastNames(people: Person[], relationships: Relationship[]): LastNameUpdate[] {
  const peopleById = new Map(people.map((p) => [p.id, p]))
  const resolved = new Map<string, string | null>(people.map((p) => [p.id, p.last_name]))

  let changed = true
  while (changed) {
    changed = false
    for (const p of people) {
      if (!isBlank(resolved.get(p.id) ?? null)) continue

      if (p.gender === 'Female') {
        const spouseId = getSpouseIds(p.id, relationships)[0]
        const spouseLastName = spouseId ? resolved.get(spouseId) ?? null : null
        if (!isBlank(spouseLastName)) {
          resolved.set(p.id, spouseLastName)
          changed = true
          continue
        }
      }

      if (p.gender === 'Male' || p.gender === 'Female') {
        const father = findFather(p.id, peopleById, relationships)
        const fatherLastName = father ? resolved.get(father.id) ?? null : null
        if (!isBlank(fatherLastName)) {
          resolved.set(p.id, fatherLastName)
          changed = true
        }
      }
    }
  }

  const updates: LastNameUpdate[] = []
  for (const p of people) {
    if (!isBlank(p.last_name)) continue
    const newName = resolved.get(p.id)
    if (newName && !isBlank(newName)) {
      updates.push({ id: p.id, last_name: newName })
    }
  }
  return updates
}
