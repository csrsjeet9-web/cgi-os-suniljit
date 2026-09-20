// 🔒 Don't edit — this keeps your robot safe.
// Clearance: who may see RESTRICTED rows (the Investigations register).
//
// Two front doors, one rule:
//   • The web app: a second cookie (`cgi_restricted`) minted by /api/restricted-login
//     when the visitor enters RESTRICTED_PASSCODE. No cookie → 'internal'.
//   • Telegram: the sender's numeric id must be in RESTRICTED_USER_IDS.
// Either way the answer feeds getRecords(clearance), which filters IN THE QUERY —
// restricted rows never reach a page, a tool result, or the model otherwise.

import { cookies } from 'next/headers'
import { createHmac, timingSafeEqual } from 'crypto'

export type Clearance = 'internal' | 'restricted'

export const restrictedPasscode = () => (process.env.RESTRICTED_PASSCODE ?? '').trim()

// The cookie is `nonce.HMAC(nonce, passcode)` — opaque, never the passcode itself.
export function mintRestrictedToken(): string {
  const nonce = crypto.randomUUID()
  const sig = createHmac('sha256', restrictedPasscode()).update(nonce).digest('hex')
  return `${nonce}.${sig}`
}

export function verifyRestrictedToken(token: string | undefined): boolean {
  const pass = restrictedPasscode()
  if (!pass || !token) return false
  const [nonce, sig] = token.split('.')
  if (!nonce || !sig) return false
  const expect = createHmac('sha256', pass).update(nonce).digest('hex')
  if (expect.length !== sig.length) return false
  return timingSafeEqual(Buffer.from(expect), Buffer.from(sig))
}

// Server components + route handlers: what may THIS request see?
export async function webClearance(): Promise<Clearance> {
  if (!restrictedPasscode()) return 'internal'   // no second lock configured → restricted stays hidden
  const jar = await cookies()
  return verifyRestrictedToken(jar.get('cgi_restricted')?.value) ? 'restricted' : 'internal'
}

// Telegram: is this numeric user id cleared for restricted rows?
const RESTRICTED_IDS = () =>
  (process.env.RESTRICTED_USER_IDS || '').split(',').map(s => s.trim()).filter(Boolean)

export function telegramClearance(userId: unknown): Clearance {
  return RESTRICTED_IDS().includes(String(userId)) ? 'restricted' : 'internal'
}
