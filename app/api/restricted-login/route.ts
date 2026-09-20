import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { restrictedPasscode, mintRestrictedToken } from '@/lib/clearance'

// 🔒 Don't edit — this keeps your robot safe.
// The SECOND lock: clearance for the Investigations register. Same construction
// as the app passcode — a timing-safe compare of SHA-256 digests, and an opaque
// `nonce.HMAC(nonce)` cookie that never contains the passcode. Shorter life
// (8 hours) because it guards more sensitive rows.

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const passcode = restrictedPasscode()
  if (!passcode) {
    return NextResponse.json({ ok: false, reason: 'not_configured' }, { status: 200 })
  }

  let submitted = ''
  try {
    const body = await req.json().catch(() => null)
    if (body && typeof body.passcode === 'string') submitted = body.passcode
  } catch {
    submitted = ''
  }

  const a = crypto.createHash('sha256').update(submitted.trim()).digest()
  const b = crypto.createHash('sha256').update(passcode).digest()
  if (!crypto.timingSafeEqual(a, b)) {
    return NextResponse.json({ ok: false, reason: 'wrong_passcode' }, { status: 401 })
  }

  const res = NextResponse.json({ ok: true })
  res.cookies.set('cgi_restricted', mintRestrictedToken(), {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 8, // 8 hours — clearance should not linger
  })
  return res
}

// Hand the clearance back (sign out of the restricted view without losing the app session).
export async function DELETE() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set('cgi_restricted', '', { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 0 })
  return res
}
