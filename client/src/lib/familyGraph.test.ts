import { getParentIds, getChildIds, getSpouseIds, getSiblingIds, computeImmediateFamily, buildAncestorRows, getDescendantIds } from './familyGraph'
import type { Relationship } from '../types'

// Anna & Ravi are Meera, Sanjay, and Deepak's parents. Sanjay married Priya.
// Meera's child is Rohan.
const relationships: Relationship[] = [
  { id: 'r1', type: 'spouse', from_id: 'anna', to_id: 'ravi' },
  { id: 'r2', type: 'parent-child', from_id: 'anna', to_id: 'meera' },
  { id: 'r3', type: 'parent-child', from_id: 'ravi', to_id: 'meera' },
  { id: 'r4', type: 'parent-child', from_id: 'anna', to_id: 'sanjay' },
  { id: 'r5', type: 'parent-child', from_id: 'ravi', to_id: 'sanjay' },
  { id: 'r6', type: 'parent-child', from_id: 'anna', to_id: 'deepak' },
  { id: 'r7', type: 'parent-child', from_id: 'ravi', to_id: 'deepak' },
  { id: 'r8', type: 'spouse', from_id: 'sanjay', to_id: 'priya' },
  { id: 'r9', type: 'parent-child', from_id: 'meera', to_id: 'rohan' },
]

test('getParentIds returns both recorded parents', () => {
  expect(getParentIds('meera', relationships).sort()).toEqual(['anna', 'ravi'])
})

test('getParentIds returns an empty array for a root ancestor', () => {
  expect(getParentIds('anna', relationships)).toEqual([])
})

test('getChildIds returns every child regardless of which parent is queried', () => {
  expect(getChildIds('anna', relationships).sort()).toEqual(['deepak', 'meera', 'sanjay'])
  expect(getChildIds('ravi', relationships).sort()).toEqual(['deepak', 'meera', 'sanjay'])
})

test('getSpouseIds returns the other side of a spouse edge either direction', () => {
  expect(getSpouseIds('sanjay', relationships)).toEqual(['priya'])
  expect(getSpouseIds('priya', relationships)).toEqual(['sanjay'])
})

test('getSpouseIds returns an empty array when no spouse is recorded', () => {
  expect(getSpouseIds('rohan', relationships)).toEqual([])
})

test('getSiblingIds returns everyone sharing a parent, excluding self', () => {
  expect(getSiblingIds('meera', relationships).sort()).toEqual(['deepak', 'sanjay'])
})

test('getSiblingIds returns an empty array for someone with no recorded parents', () => {
  expect(getSiblingIds('anna', relationships)).toEqual([])
})

test('computeImmediateFamily gathers parents, spouse, children, and siblings', () => {
  const family = computeImmediateFamily('sanjay', relationships)
  expect(family.parents.sort()).toEqual(['anna', 'ravi'])
  expect(family.spouse).toBe('priya')
  expect(family.children).toEqual([])
  expect(family.siblings.sort()).toEqual(['deepak', 'meera'])
})

test('computeImmediateFamily handles someone with no spouse and no siblings', () => {
  const family = computeImmediateFamily('rohan', relationships)
  expect(family.parents).toEqual(['meera'])
  expect(family.spouse).toBeNull()
  expect(family.children).toEqual([])
  expect(family.siblings).toEqual([])
})

test('buildAncestorRows returns the focal person alone at depth 0', () => {
  const rows = buildAncestorRows('meera', relationships)
  expect(rows[0]).toEqual({ depth: 0, units: [{ id: '0:root:meera', personId: 'meera', spouseId: null, childId: null }] })
})

test('buildAncestorRows walks up through recorded parent couples', () => {
  const rows = buildAncestorRows('meera', relationships)
  // depth 1: Meera's parents, Anna & Ravi, as one couple unit
  const depth1 = rows.find((r) => r.depth === 1)!
  expect(depth1.units).toEqual([{ id: '1:meera:anna', personId: 'anna', spouseId: 'ravi', childId: 'meera' }])
})

test('buildAncestorRows stops at a generation with no recorded parents', () => {
  const rows = buildAncestorRows('meera', relationships)
  // Anna and Ravi have no recorded parents, so there is no depth 2 row
  expect(rows.some((r) => r.depth === 2)).toBe(false)
})

test('buildAncestorRows handles someone with only one recorded parent', () => {
  const oneParent: Relationship[] = [
    { id: 'x1', type: 'parent-child', from_id: 'solo-parent', to_id: 'solo-child' },
  ]
  const rows = buildAncestorRows('solo-child', oneParent)
  const depth1 = rows.find((r) => r.depth === 1)!
  expect(depth1.units).toEqual([{ id: '1:solo-child:solo-parent', personId: 'solo-parent', spouseId: null, childId: 'solo-child' }])
})

test('buildAncestorRows keeps a shared ancestor reachable via two different lineages at the same depth', () => {
  // Priya and a second person, Kunal, are first cousins: both are children
  // of siblings Ila and Om, who share a parent, Grandma. Priya's parent is
  // Ila; Kunal's parent is Om; Ila and Om's shared parent is Grandma —
  // a pedigree collapse one generation further up from Priya and Kunal.
  const cousinRelationships: Relationship[] = [
    { id: 'c1', type: 'parent-child', from_id: 'grandma', to_id: 'ila' },
    { id: 'c2', type: 'parent-child', from_id: 'grandma', to_id: 'om' },
    { id: 'c3', type: 'parent-child', from_id: 'ila', to_id: 'priya' },
    { id: 'c4', type: 'parent-child', from_id: 'om', to_id: 'kunal' },
    { id: 'c5', type: 'parent-child', from_id: 'ila', to_id: 'kunal' },
  ]
  // Kunal's recorded parents are Om and Ila (both), so at depth 1 from
  // Kunal's own focal view the currentIds become [ila, om] (via the
  // depth-1 units' personId/spouseId). At depth 2, both ila's and om's
  // searches reach 'grandma' — the pedigree collapse this test targets.
  const rows = buildAncestorRows('kunal', cousinRelationships)
  const depth2 = rows.find((r) => r.depth === 2)!
  // grandma must appear as a depth-2 parent for BOTH ila and om, not be
  // dropped for the second one processed.
  const grandmaUnits = depth2.units.filter((u) => u.personId === 'grandma')
  expect(grandmaUnits.length).toBe(2)
  expect(grandmaUnits.map((u) => u.childId).sort()).toEqual(['ila', 'om'])
})

test('buildAncestorRows still merges one persons own two parents into a single unit', () => {
  // Regression guard: the seenParentIds fix must not reintroduce two
  // separate units for one recorded couple.
  const rows = buildAncestorRows('meera', relationships)
  const depth1 = rows.find((r) => r.depth === 1)!
  expect(depth1.units.length).toBe(1)
  expect(depth1.units[0]).toMatchObject({ personId: 'anna', spouseId: 'ravi', childId: 'meera' })
})

test('buildAncestorRows assigns each unit a stable id unique per occurrence', () => {
  const rows = buildAncestorRows('meera', relationships)
  expect(rows[0].units[0].id).toBe('0:root:meera')
  const depth1 = rows.find((r) => r.depth === 1)!
  expect(depth1.units[0].id).toBe('1:meera:anna')
})

test('buildAncestorRows gives two units sharing a personId distinct ids', () => {
  const cousinRelationships: Relationship[] = [
    { id: 'c1', type: 'parent-child', from_id: 'grandma', to_id: 'ila' },
    { id: 'c2', type: 'parent-child', from_id: 'grandma', to_id: 'om' },
    { id: 'c3', type: 'parent-child', from_id: 'ila', to_id: 'priya' },
    { id: 'c4', type: 'parent-child', from_id: 'om', to_id: 'kunal' },
    { id: 'c5', type: 'parent-child', from_id: 'ila', to_id: 'kunal' },
  ]
  const rows = buildAncestorRows('kunal', cousinRelationships)
  const depth2 = rows.find((r) => r.depth === 2)!
  const grandmaUnits = depth2.units.filter((u) => u.personId === 'grandma')
  const ids = grandmaUnits.map((u) => u.id)
  expect(new Set(ids).size).toBe(2)
  expect(ids.sort()).toEqual(['2:ila:grandma', '2:om:grandma'])
})

test('getDescendantIds returns only direct children, not grandchildren', () => {
  expect(getDescendantIds('meera', relationships)).toEqual(['rohan'])
  expect(getDescendantIds('rohan', relationships)).toEqual([])
})
