import { useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { setPassphrase } from '../../lib/passphrase'
import { Icon } from '../shared/Icon'
import { Button } from '../shared/Button'

interface PassphraseGateProps {
  onUnlocked: () => void
  onCancel: () => void
}

export function PassphraseGate({ onUnlocked, onCancel }: PassphraseGateProps) {
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)

  async function submit() {
    setChecking(true)
    setError(null)
    const { data, error: rpcError } = await supabase.rpc('verify_passphrase', { p_passphrase: value })
    setChecking(false)
    if (rpcError || !data) {
      setError('Incorrect passphrase.')
      return
    }
    setPassphrase(value)
    onUnlocked()
  }

  return (
    <div className="gate-shell">
      <div className="gate-icon"><Icon name="lock" size={20} /></div>
      <div className="gate-title">Enter the family passphrase</div>
      <div className="gate-sub">Needed once to add or edit people on this device.</div>
      <input
        className="field gate-input"
        type="password"
        placeholder="Passphrase"
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      {error && <div className="gate-error">{error}</div>}
      <Button variant="primary" onClick={submit} disabled={checking} style={{ width: '100%', justifyContent: 'center' }}>
        Unlock editing
      </Button>
      <button className="gate-cancel" onClick={onCancel}>Cancel</button>
    </div>
  )
}
