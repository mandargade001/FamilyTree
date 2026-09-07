export function parentRoleLabel(gender: string | null): string {
  if (gender === 'Male') return 'Father'
  if (gender === 'Female') return 'Mother'
  return 'Parent'
}

export function spouseRoleLabel(gender: string | null): string {
  if (gender === 'Male') return 'Husband'
  if (gender === 'Female') return 'Wife'
  return 'Spouse'
}
