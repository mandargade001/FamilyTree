import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { setPassphrase } from '../../lib/passphrase'
import { Icon } from '../shared/Icon'
import { Button } from '../shared/Button'

interface PassphraseGateProps {
  onUnlocked: () => void
  onCancel: () => void
}

// How long the "stitch closes" flourish plays on a correct passphrase before
// the gate actually hands off — same beat as PersonForm's Save flourish.
const UNLOCK_FLOURISH_MS = 220

export function PassphraseGate({ onUnlocked, onCancel }: PassphraseGateProps) {
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)
  const [unlocking, setUnlocking] = useState(false)
  // Increments on every failed attempt so the shake animation re-triggers
  // even on back-to-back wrong guesses (setting `error` to the same string
  // twice in a row wouldn't, by itself, re-run a class-driven CSS animation).
  const [shakeSeed, setShakeSeed] = useState(0)
  const [isShaking, setIsShaking] = useState(false)

  useEffect(() => {
    if (shakeSeed === 0) return
    setIsShaking(true)
    const timer = setTimeout(() => setIsShaking(false), 300)
    return () => clearTimeout(timer)
  }, [shakeSeed])

  async function submit() {
    setChecking(true)
    setError(null)
    const { data, error: rpcError } = await supabase.rpc('verify_passphrase', { p_passphrase: value })
    setChecking(false)
    if (rpcError || !data) {
      setError('Incorrect passphrase.')
      setShakeSeed((s) => s + 1)
      return
    }
    setPassphrase(value)
    setUnlocking(true)
    window.setTimeout(onUnlocked, UNLOCK_FLOURISH_MS)
  }

  return (
    <div className={['gate-shell', checking ? 'checking' : ''].filter(Boolean).join(' ')}>
      <div className="gate-icon"><Icon name="lock" size={20} /></div>
      <div className="gate-title">Enter the family passphrase</div>
      <div className="gate-sub">Needed once to add or edit people on this device.</div>
      <input
        className={['field', 'gate-input', isShaking ? 'shaking' : ''].filter(Boolean).join(' ')}
        type="password"
        placeholder="Passphrase"
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      {error && <div className="gate-error" role="alert">{error}</div>}
      <Button
        variant="primary"
        className={unlocking ? 'stitching' : ''}
        onClick={submit}
        disabled={checking || unlocking}
        style={{ width: '100%', justifyContent: 'center' }}
      >
        {checking ? 'Unlocking…' : 'Unlock editing'}
      </Button>
      <button className="gate-cancel" onClick={onCancel}>Cancel</button>
    </div>
  )
}
