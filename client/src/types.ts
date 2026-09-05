export interface Person {
  id: string
  first_name: string
  last_name: string | null
  gender: string | null
  birth_date: string | null
  death_date: string | null
  birth_place: string | null
  occupation: string | null
  bio: string | null
  created_at: string
  updated_at: string
}

export type PersonFields = Omit<Person, 'id' | 'created_at' | 'updated_at'>

export type RelationshipType = 'parent-child' | 'spouse'

export interface Relationship {
  id: string
  type: RelationshipType
  from_id: string
  to_id: string
}
