import { getParentIds, getChildIds, getSpouseIds, getSiblingIds } from './familyGraph'
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
