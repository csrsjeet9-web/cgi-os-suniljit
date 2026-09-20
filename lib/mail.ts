import 'server-only'

// ============================================================
// OUTLOOK MAIL — the second channel, for management.
//
// The bot talks to YOU on Telegram. This sends the same brief to the people who
// do not live in Telegram, through your Outlook account via Composio.
//
// The rule this respects: management updates are internal status reporting, so
// they may send themselves. Anything addressed to a person who owes you work —
// the Overdue Chaser's reminders — is still a DRAFT you send yourself. That code
// path does not exist here, and adding it would need a deliberate decision.
//
// PILOT MODE is on by default. While MAIL_PILOT is not "false", every message
// goes to MAIL_PILOT_TO instead of the real list, with [PILOT] in the subject and
// a banner naming who it would have reached. One env var flips it live.
//
// Fails soft everywhere: a missing key, a broken connection or a Composio error
// is logged and reported, and never takes the morning cron down with it.
// ============================================================

const EXEC = 'https://backend.composio.dev/api/v3.1/tools/execute/OUTLOOK_SEND_EMAIL'

const env = (k: string) => (process.env[k] || '').trim()
const list = (k: string) =>
  env(k).split(',').map(s => s.trim()).filter(s => s.includes('@'))

/** Is the Outlook connection configured at all? */
export function mailConfigured(): boolean {
  return !!env('COMPOSIO_API_KEY') && !!env('COMPOSIO_OUTLOOK_ACCOUNT_ID')
}

/** Is emailing switched on? Off unless MAIL_ENABLED is explicitly "true". */
export function mailEnabled(): boolean {
  return env('MAIL_ENABLED').toLowerCase() === 'true'
}

/** Pilot until you say otherwise — set MAIL_PILOT=false to reach the real list. */
export function mailPilot(): boolean {
  return env('MAIL_PILOT').toLowerCase() !== 'false'
}

/** Who a message actually goes to, and who it was meant for. */
export function audience(): { to: string[]; intended: string[]; pilot: boolean } {
  const intended = list('MAIL_TO')
  const pilot = mailPilot()
  const to = pilot ? (list('MAIL_PILOT_TO').length ? list('MAIL_PILOT_TO') : intended.slice(0, 1)) : intended
  return { to, intended, pilot }
}

// Composio wants the connected account AND its user id. We look the user id up
// once per cold start from the connection, so there is only one id to configure.
let cachedUserId: string | null = null

async function composioUserId(accountId: string): Promise<string> {
  const fromEnv = env('COMPOSIO_USER_ID')
  if (fromEnv) return fromEnv
  if (cachedUserId) return cachedUserId
  const res = await fetch(`https://backend.composio.dev/api/v3/connected_accounts/${accountId}`, {
    headers: { 'x-api-key': env('COMPOSIO_API_KEY') },
    cache: 'no-store',
  })
  const text = await res.text()
  let json: any = null
  try { json = JSON.parse(text) } catch { /* fall through to the raw text */ }
  const acct = json?.data ?? json
  const userId =
    acct?.user_id ?? acct?.userId ?? acct?.entity_id ?? acct?.entityId ??
    text.match(/"(?:user_id|entity_id)"\s*:\s*"([^"]+)"/)?.[1]
  if (!res.ok || !userId) {
    throw new Error(`Could not read the Composio connection ${accountId} (${res.status}): ${text.slice(0, 200)}`)
  }
  cachedUserId = String(userId)
  return cachedUserId
}

export type MailResult = { ok: boolean; to: string[]; pilot: boolean; skipped?: string; error?: string }

/**
 * Send one message. Returns rather than throws — the caller reports it and the
 * morning still runs.
 */
export async function sendMail(args: { subject: string; html: string }): Promise<MailResult> {
  const { to, intended, pilot } = audience()

  if (!mailEnabled()) return { ok: false, to: [], pilot, skipped: 'MAIL_ENABLED is not true' }
  if (!mailConfigured()) return { ok: false, to: [], pilot, skipped: 'COMPOSIO_API_KEY or COMPOSIO_OUTLOOK_ACCOUNT_ID missing' }
  if (!to.length) return { ok: false, to: [], pilot, skipped: pilot ? 'MAIL_PILOT_TO is empty' : 'MAIL_TO is empty' }

  const subject = (pilot ? '[PILOT] ' : '') + args.subject
  const banner = pilot
    ? `<p style="margin:0 0 18px;padding:10px 14px;background:#FFF4E0;border:1px solid #D8A44D;border-radius:8px;font:13px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:#6E521A">
         <b>Pilot.</b> This went only to you. Live, it would reach: ${intended.length ? intended.join(', ') : '(MAIL_TO is empty)'}.
       </p>`
    : ''

  const accountId = env('COMPOSIO_OUTLOOK_ACCOUNT_ID')
  try {
    const body = {
      connected_account_id: accountId,
      user_id: await composioUserId(accountId),
      arguments: {
        to: to.join(', '),
        subject,
        body: banner + args.html,
        is_html: true,
        save_to_sent_items: true,
      },
    }
    const res = await fetch(EXEC, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': env('COMPOSIO_API_KEY') },
      body: JSON.stringify(body),
      cache: 'no-store',
    })
    const text = await res.text()
    let json: any = null
    try { json = JSON.parse(text) } catch { /* not JSON — the raw text is the detail */ }
    if (!res.ok || !json?.successful) {
      const detail = json ? JSON.stringify(json.error ?? json.message ?? json).slice(0, 300) : text.slice(0, 300)
      console.error('[CGI] Outlook send failed:', detail)
      return { ok: false, to, pilot, error: `Outlook send failed (${res.status}): ${detail}` }
    }
    return { ok: true, to, pilot }
  } catch (e: any) {
    const msg = String(e?.message || e).slice(0, 300)
    console.error('[CGI] Outlook send threw:', msg)
    return { ok: false, to, pilot, error: msg }
  }
}

// ------------------------------------------------------------
// The email shell.
//
// The brief is written once, in Telegram HTML (<b>, <i>, <code> and newlines),
// so management reads exactly what you read — no second version to drift. This
// wraps it in an email-safe layout: a table, inline styles, no flexbox, no
// external CSS, since Outlook's renderer supports very little.
// ------------------------------------------------------------
export function emailShell(title: string, telegramHtml: string, footer?: string): string {
  const bodyHtml = telegramHtml
    .replace(/<code>/g, '<span style="font-family:Consolas,Menlo,monospace;font-size:13px">')
    .replace(/<\/code>/g, '</span>')
    .replace(/\n/g, '<br>')

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EFF3F7;padding:24px 0;margin:0">
  <tr><td align="center">
    <table role="presentation" width="640" cellpadding="0" cellspacing="0" style="width:640px;max-width:100%;background:#FFFFFF;border:1px solid rgba(15,23,32,.12);border-radius:12px;overflow:hidden">
      <tr><td style="background:#1E3A5F;padding:18px 24px">
        <div style="font:700 17px/1.2 -apple-system,Segoe UI,Roboto,sans-serif;color:#FFFFFF">CGI OS</div>
        <div style="font:500 11px/1.4 -apple-system,Segoe UI,Roboto,sans-serif;color:#9DB6D2;letter-spacing:.06em;text-transform:uppercase;margin-top:3px">Compliance · Governance · Integrity</div>
      </td></tr>
      <tr><td style="padding:24px">
        <h1 style="margin:0 0 16px;font:700 19px/1.3 -apple-system,Segoe UI,Roboto,sans-serif;color:#0F1720">${title}</h1>
        <div style="font:400 14px/1.65 -apple-system,Segoe UI,Roboto,sans-serif;color:#1F2A38">${bodyHtml}</div>
      </td></tr>
      <tr><td style="padding:16px 24px;border-top:1px solid rgba(15,23,32,.10);font:400 12px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;color:#7C8CA0">
        ${footer || 'Sent by CGI OS. Nothing in this message has been actioned — every change to a register still waits for a human YES.'}
      </td></tr>
    </table>
  </td></tr>
</table>`
}
