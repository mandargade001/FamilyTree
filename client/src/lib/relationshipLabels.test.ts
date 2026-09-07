import { parentRoleLabel, spouseRoleLabel } from './relationshipLabels'

test('parentRoleLabel maps gender to Father/Mother/Parent', () => {
  expect(parentRoleLabel('Male')).toBe('Father')
  expect(parentRoleLabel('Female')).toBe('Mother')
  expect(parentRoleLabel('Other')).toBe('Parent')
  expect(parentRoleLabel(null)).toBe('Parent')
})

test('spouseRoleLabel maps gender to Husband/Wife/Spouse', () => {
  expect(spouseRoleLabel('Male')).toBe('Husband')
  expect(spouseRoleLabel('Female')).toBe('Wife')
  expect(spouseRoleLabel('Other')).toBe('Spouse')
  expect(spouseRoleLabel(null)).toBe('Spouse')
})
