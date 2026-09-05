import { useRef, useState } from 'react'
import type { Person, Relationship } from '../../types'
import { computeImmediateFamily } from '../../lib/familyGraph'
import { Icon } from '../shared/Icon'
import { Button } from '../shared/Button'

type UploadResult = { ok: true } | { ok: false; message: string }

interface PersonProfileProps {
  person: Person
  people: Person[]
  relationships: Relationship[]
  onEdit: () => void
  onAddRelationship: () => void
  onOpenPerson: (id: string) => void
  onCenterHere: () => void
  onDelete: () => void
  onUploadPhoto: (file: File) => Promise<UploadResult>
}

export function PersonProfile({
  person,
  people,
  relationships,
  onEdit,
  onAddRelationship,
  onOpenPerson,
  onCenterHere,
  onDelete,
  onUploadPhoto,
}: PersonProfileProps) {
  const byId = new Map(people.map((p) => [p.id, p]))
  const family = computeImmediateFamily(person.id, relationships)
  const name = [person.first_name, person.last_name].filter(Boolean).join(' ')
  const meta = [person.birth_date && `b. ${person.birth_date}`, person.birth_place, person.occupation].filter(Boolean).join(' · ')

  const [uploadStatus, setUploadStatus] = useState<{ state: 'idle' | 'uploading' | 'success' | 'error'; message?: string }>({ state: 'idle' })
  const fileInputRef = useRef<HTMLInputElement>(null)

  const chips: { role: string; personId: string }[] = [
    ...family.parents.map((id) => ({ role: 'Parent', personId: id })),
    ...(family.spouse ? [{ role: 'Spouse', personId: family.spouse }] : []),
    ...family.children.map((id) => ({ role: 'Child', personId: id })),
  ]

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploadStatus({ state: 'uploading' })
    void onUploadPhoto(file).then((result) => {
      if (result.ok) {
        setUploadStatus({ state: 'success' })
      } else {
        setUploadStatus({ state: 'error', message: result.message })
      }
    })
  }

  function handleDeleteClick() {
    // Count relationships involving this person from the already-loaded
    // relationships array — no new RPC needed.
    const count = relationships.filter((r) => r.from_id === person.id || r.to_id === person.id).length
    const relText = count === 1 ? '1 relationship' : `${count} relationships`
    const confirmed = window.confirm(
      `Delete ${name || 'this person'}? This will also remove ${relText} involving them. This cannot be undone.`,
    )
    if (confirmed) onDelete()
  }

  return (
    <div className="profile-layout">
      <div>
        <div className="profile-photo"><Icon name="photo" size={28} /></div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/heic"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
        <Button variant="ghost" onClick={() => fileInputRef.current?.click()} disabled={uploadStatus.state === 'uploading'}>
          <Icon name="photo" size={14} /> {uploadStatus.state === 'uploading' ? 'Uploading…' : 'Upload photo'}
        </Button>
        {uploadStatus.state === 'success' && <div className="upload-status upload-status-ok">Photo uploaded.</div>}
        {uploadStatus.state === 'error' && <div className="upload-status upload-status-error">{uploadStatus.message}</div>}
      </div>
      <div>
        <div className="profile-name">{name}</div>
        {meta && <div className="profile-meta">{meta}</div>}
        <div className="profile-actions">
          <Button variant="ghost" onClick={onEdit}><Icon name="edit" size={14} /> Edit Profile</Button>
          <Button variant="ghost" onClick={onCenterHere}>Center tree here</Button>
          <Button variant="ghost" onClick={handleDeleteClick}>Delete</Button>
        </div>

        <div className="section-title">Relationships</div>
        <div>
          {chips.map(({ role, personId }) => {
            const related = byId.get(personId)
            if (!related) return null
            return (
              <span className="rel-chip" key={personId} onClick={() => onOpenPerson(personId)}>
                {role} · {related.first_name}
              </span>
            )
          })}
          <span className="rel-chip add" onClick={onAddRelationship}>
            <Icon name="plus" size={12} /> Add relationship
          </span>
        </div>

        {person.bio && (
          <>
            <div className="section-title">Life events &amp; bio</div>
            <p className="bio-text">{person.bio}</p>
          </>
        )}
      </div>
    </div>
  )
}
