import { useState } from 'react'
import type { PersonFields } from '../../types'
import { Button } from '../shared/Button'

interface PersonFormProps {
  initial: PersonFields | null
  onSave: (fields: PersonFields) => void
  onCancel: () => void
}

const EMPTY: PersonFields = {
  first_name: '', last_name: null, gender: null, birth_date: null,
  death_date: null, birth_place: null, occupation: null, bio: null,
}

export function PersonForm({ initial, onSave, onCancel }: PersonFormProps) {
  const [fields, setFields] = useState<PersonFields>(initial ?? EMPTY)

  function set<K extends keyof PersonFields>(key: K, value: string) {
    // first_name must never be null (it's required), always keep it as string
    const finalValue = key === 'first_name' ? value : (value === '' ? null : value)
    setFields((prev) => ({ ...prev, [key]: finalValue }))
  }

  const canSave = fields.first_name.trim().length > 0

  return (
    <div className="modal-shell">
      <div className="profile-name" style={{ fontSize: 19, marginBottom: 18 }}>
        {initial ? 'Edit Person' : 'Add Person'}
      </div>

      <div className="form-row">
        <label htmlFor="first_name">First name <span className="req">*</span></label>
        <input id="first_name" className="field" value={fields.first_name} onChange={(e) => set('first_name', e.target.value)} placeholder="e.g. Meera" />
      </div>
      <div className="two-col">
        <div className="form-row">
          <label htmlFor="last_name">Last name</label>
          <input id="last_name" className="field" value={fields.last_name ?? ''} onChange={(e) => set('last_name', e.target.value)} placeholder="optional" />
        </div>
        <div className="form-row">
          <label htmlFor="gender">Gender</label>
          <input id="gender" className="field" value={fields.gender ?? ''} onChange={(e) => set('gender', e.target.value)} placeholder="optional" />
        </div>
      </div>
      <div className="two-col">
        <div className="form-row">
          <label htmlFor="birth_date">Birth date</label>
          <input id="birth_date" className="field" value={fields.birth_date ?? ''} onChange={(e) => set('birth_date', e.target.value)} placeholder='"1955" or "circa 1950s"' />
        </div>
        <div className="form-row">
          <label htmlFor="death_date">Death date</label>
          <input id="death_date" className="field" value={fields.death_date ?? ''} onChange={(e) => set('death_date', e.target.value)} placeholder="leave blank if living" />
        </div>
      </div>
      <div className="form-row">
        <label htmlFor="birth_place">Birthplace</label>
        <input id="birth_place" className="field" value={fields.birth_place ?? ''} onChange={(e) => set('birth_place', e.target.value)} placeholder="optional" />
      </div>
      <div className="form-row">
        <label htmlFor="occupation">Occupation</label>
        <input id="occupation" className="field" value={fields.occupation ?? ''} onChange={(e) => set('occupation', e.target.value)} placeholder="optional" />
      </div>
      <div className="form-row">
        <label htmlFor="bio">Bio / life story</label>
        <textarea id="bio" className="field" value={fields.bio ?? ''} onChange={(e) => set('bio', e.target.value)} placeholder="Free text — anecdotes, notable events…" />
      </div>

      <div className="form-actions">
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button variant="primary" disabled={!canSave} onClick={() => onSave(fields)}>Save</Button>
      </div>
    </div>
  )
}
