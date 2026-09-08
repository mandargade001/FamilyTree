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
  expect(rows[0]).toEqual({ depth: 0, units: [{ personId: 'meera', spouseId: null, childId: null }] })
})

test('buildAncestorRows walks up through recorded parent couples', () => {
  const rows = buildAncestorRows('meera', relationships)
  // depth 1: Meera's parents, Anna & Ravi, as one couple unit
  const depth1 = rows.find((r) => r.depth === 1)!
  expect(depth1.units).toEqual([{ personId: 'anna', spouseId: 'ravi', childId: 'meera' }])
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
  expect(depth1.units).toEqual([{ personId: 'solo-parent', spouseId: null, childId: 'solo-child' }])
})

test('getDescendantIds returns only direct children, not grandchildren', () => {
  expect(getDescendantIds('meera', relationships)).toEqual(['rohan'])
  expect(getDescendantIds('rohan', relationships)).toEqual([])
})
