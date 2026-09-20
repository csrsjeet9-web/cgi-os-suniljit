'use client'
import { useState } from 'react'

// The SECOND lock — clearance for the Investigations register only. The app
// passcode gets you into CGI OS; this one gets you into restricted cases, and
// the cookie it mints expires in 8 hours.
export default function RestrictedGate() {
  const [passcode, setPasscode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/restricted-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode }),
      })
      const body = await res.json().catch(() => ({}))
      if (res.ok && body.ok) {
        window.location.href = '/investigations'
        return
      }
      setError(
        body.reason === 'not_configured'
          ? 'No restricted passcode is set on this deployment, so this register stays closed.'
          : "That code didn't match.",
      )
    } catch {
      setError('Something went wrong reaching the server. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <div className="brand" style={{ marginBottom: 8 }}>🔒 Restricted access</div>
        <h1 className="ph" style={{ fontSize: 18 }}>Investigations passcode</h1>
        <p className="cap" style={{ margin: '4px 0 16px' }}>
          A second lock for investigation cases only. Your clearance lasts 8 hours on this device.
        </p>
        <input
          className="login-input"
          type="password"
          autoComplete="off"
          placeholder="Restricted passcode"
          value={passcode}
          onChange={e => setPasscode(e.target.value)}
          autoFocus
        />
        {error ? <p className="login-error">{error}</p> : null}
        <button className="btn" type="submit" disabled={busy || !passcode} style={{ width: '100%', marginTop: 12 }}>
          {busy ? 'Checking…' : 'Unlock'}
        </button>
      </form>
    </div>
  )
}
