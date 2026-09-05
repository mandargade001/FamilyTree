interface FieldProps {
  label: string
  required?: boolean
  type?: 'text' | 'textarea'
  value: string
  placeholder?: string
  onChange: (value: string) => void
}

export function Field({ label, required, type = 'text', value, placeholder, onChange }: FieldProps) {
  return (
    <div className="form-row">
      <label>
        {label} {required && <span className="req">*</span>}
      </label>
      {type === 'textarea' ? (
        <textarea className="field" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input className="field" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      )}
    </div>
  )
}
