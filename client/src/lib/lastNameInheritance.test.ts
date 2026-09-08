import { describe, expect, test } from 'vitest'
import type { Person, Relationship } from '../types'
import { resolveLastNames } from './lastNameInheritance'

function person(overrides: Partial<Person> & { id: string }): Person {
  return {
    first_name: overrides.id,
    last_name: null,
    gender: null,
    birth_date: null,
    death_date: null,
    birth_place: null,
    occupation: null,
    bio: null,
    created_at: '',
    updated_at: '',
    ...overrides,
  }
}

function parentChild(from_id: string, to_id: string): Relationship {
  return { id: `${from_id}-${to_id}`, type: 'parent-child', from_id, to_id }
}

function spouse(from_id: string, to_id: string): Relationship {
  return { id: `${from_id}-${to_id}-spouse`, type: 'spouse', from_id, to_id }
}

describe('resolveLastNames', () => {
  test('a son inherits his father\'s last name', () => {
    const father = person({ id: 'father', last_name: 'Gade', gender: 'Male' })
    const son = person({ id: 'son', last_name: null, gender: 'Male' })
    const updates = resolveLastNames([father, son], [parentChild('father', 'son')])
    expect(updates).toEqual([{ id: 'son', last_name: 'Gade' }])
  })

  test('an unmarried daughter inherits her father\'s last name', () => {
    const father = person({ id: 'father', last_name: 'Gade', gender: 'Male' })
    const daughter = person({ id: 'daughter', last_name: null, gender: 'Female' })
    const updates = resolveLastNames([father, daughter], [parentChild('father', 'daughter')])
    expect(updates).toEqual([{ id: 'daughter', last_name: 'Gade' }])
  })

  test('a married daughter inherits her spouse\'s last name, not her father\'s', () => {
    const father = person({ id: 'father', last_name: 'Gade', gender: 'Male' })
    const husband = person({ id: 'husband', last_name: 'Khandgaonkar', gender: 'Male' })
    const daughter = person({ id: 'daughter', last_name: null, gender: 'Female' })
    const updates = resolveLastNames(
      [father, husband, daughter],
      [parentChild('father', 'daughter'), spouse('daughter', 'husband')],
    )
    expect(updates).toEqual([{ id: 'daughter', last_name: 'Khandgaonkar' }])
  })

  test('unknown gender is never resolved', () => {
    const father = person({ id: 'father', last_name: 'Gade', gender: 'Male' })
    const child = person({ id: 'child', last_name: null, gender: null })
    const updates = resolveLastNames([father, child], [parentChild('father', 'child')])
    expect(updates).toEqual([])
  })

  test('"Other" gender is never resolved', () => {
    const father = person({ id: 'father', last_name: 'Gade', gender: 'Male' })
    const child = person({ id: 'child', last_name: null, gender: 'Other' })
    const updates = resolveLastNames([father, child], [parentChild('father', 'child')])
    expect(updates).toEqual([])
  })

  test('no resolvable source leaves the name blank', () => {
    const father = person({ id: 'father', last_name: null, gender: 'Male' })
    const son = person({ id: 'son', last_name: null, gender: 'Male' })
    const updates = resolveLastNames([father, son], [parentChild('father', 'son')])
    expect(updates).toEqual([])
  })

  test('an existing last name is never overwritten, even if the graph implies a different one', () => {
    const father = person({ id: 'father', last_name: 'Gade', gender: 'Male' })
    const son = person({ id: 'son', last_name: 'Deshmukh', gender: 'Male' })
    const updates = resolveLastNames([father, son], [parentChild('father', 'son')])
    expect(updates).toEqual([])
  })

  test('a three-generation chain resolves fully in one call from only the root\'s name', () => {
    const grandfather = person({ id: 'grandfather', last_name: 'Gade', gender: 'Male' })
    const father = person({ id: 'father', last_name: null, gender: 'Male' })
    const son = person({ id: 'son', last_name: null, gender: 'Male' })
    const updates = resolveLastNames(
      [grandfather, father, son],
      [parentChild('grandfather', 'father'), parentChild('father', 'son')],
    )
    expect(updates).toEqual(
      expect.arrayContaining([
        { id: 'father', last_name: 'Gade' },
        { id: 'son', last_name: 'Gade' },
      ]),
    )
    expect(updates).toHaveLength(2)
  })

  test('a married-in daughter-in-law resolves in the same pass as her husband, when he only resolves via this call', () => {
    const grandfather = person({ id: 'grandfather', last_name: 'Gade', gender: 'Male' })
    const father = person({ id: 'father', last_name: null, gender: 'Male' })
    const wife = person({ id: 'wife', last_name: null, gender: 'Female' })
    const updates = resolveLastNames(
      [grandfather, father, wife],
      [parentChild('grandfather', 'father'), spouse('father', 'wife')],
    )
    expect(updates).toEqual(
      expect.arrayContaining([
        { id: 'father', last_name: 'Gade' },
        { id: 'wife', last_name: 'Gade' },
      ]),
    )
    expect(updates).toHaveLength(2)
  })

  test('a married daughter resolves via her spouse regardless of array order (order-independence)', () => {
    const brideFather = person({ id: 'brideFather', last_name: 'Deshmukh', gender: 'Male' })
    const groomFather = person({ id: 'groomFather', last_name: 'Khandgaonkar', gender: 'Male' })
    const bride = person({ id: 'bride', last_name: null, gender: 'Female' })
    const groom = person({ id: 'groom', last_name: null, gender: 'Male' })
    const relationships = [
      parentChild('brideFather', 'bride'),
      parentChild('groomFather', 'groom'),
      spouse('bride', 'groom'),
    ]

    const brideFirstUpdates = resolveLastNames(
      [bride, brideFather, groom, groomFather],
      relationships,
    )
    const groomFirstUpdates = resolveLastNames(
      [groom, groomFather, bride, brideFather],
      relationships,
    )

    const expected = expect.arrayContaining([
      { id: 'bride', last_name: 'Khandgaonkar' },
      { id: 'groom', last_name: 'Khandgaonkar' },
    ])
    expect(brideFirstUpdates).toEqual(expected)
    expect(brideFirstUpdates).toHaveLength(2)
    expect(groomFirstUpdates).toEqual(expected)
    expect(groomFirstUpdates).toHaveLength(2)
  })
})
