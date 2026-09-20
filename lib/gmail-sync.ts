import 'server-only'
import Anthropic from '@anthropic-ai/sdk'
import { supabase, supabaseConfigured } from './supabase'
import { runAutopilot, proposeAndNotify } from './actions'
import { type Rec } from './records'
import { BOT_MODEL } from './model'

// Gmail → CGI OS daily sync (via Composio).
//
// Reads the watched inbox (minus Promotions/Social) and lets Claude pick out
// COMPLIANCE CIRCULARS (a regulator / certification body / standards body
// announcing or changing a requirement) and ACTIONS the CGI team is asked to do.
// Everything is filed through the SAME approval engine the robots use:
//   🟡 circular → a proposed obligation, with the sender and subject as its source
//   🟢 action   → an open action in the register, with /undo
// Idempotency key = `gmail:<messageId>` (UNIQUE), so an email can only ever be
// imported once, however many times this runs.
//
// It NEVER sends, replies to, labels or deletes email — read-only on Gmail.
// Login / verification-code emails are never classified, imported or forwarded.

const COMPOSIO_URL = 'https://backend.composio.dev/api/v3.1/tools/execute/GMAIL_FETCH_EMAILS'
const MAX_FETCH = 200          // safety cap per run
const BODY_CHARS = 1500        // how much of each email Claude sees
const PING_MAX = 15            // Telegram list cap

export type Email = {
  id: string
  from: string
  subject: string
  text: string
  at: string          // ISO timestamp
  labels: string[]
  url?: string
}

export type Classified = {
  id: string
  type: 'circular' | 'action' | 'skip'
  title?: string
  regulator?: string          // circular: who issued it
  summary?: string
  effective_date?: string | null
  owner?: string | null       // action: which HOD, if the email names one
  due_date?: string | null
}

export type SyncReport = {
  fetched: number
  alreadyImported: number
  sensitiveHidden: number
  classified: Classified[]
  filed: { id: string; what: string; undo?: string }[]
  proposed: { id: string; what: string }[]
  skipped: { id: string; why: string }[]
  primary: Email[]    // last-24h Primary emails, for the ping
  errors: string[]
}

// ---- config ---------------------------------------------------------------

export function composioConfigured(): boolean {
  return !!process.env.COMPOSIO_API_KEY?.trim() &&
    !!(process.env.COMPOSIO_CONNECTED_ACCOUNT_ID?.trim() || process.env.COMPOSIO_USER_ID?.trim())
}

// ---- safety: login / verification-code emails -----------------------------

const SENSITIVE = /\b(your code|verification code|security code|confirmation code|log[- ]?in code|sign[- ]?in code|auth(entication)? code|one[- ]time (pass)?code|one[- ]time password|otp|passcode|2fa|two[- ]factor|password reset|reset your password|magic link|new sign[- ]?in|sign[- ]?in attempt|verify your (email|identity|account))\b/i
export const isSensitive = (e: Email) => SENSITIVE.test(`${e.subject} ${e.text.slice(0, 300)}`)

// ---- fetch ---------------------------------------------------------------

// Composio wants BOTH the connected account and its user id. We only ask you for
// the ca_… id in Vercel and look the user id up once per cold start (cached).
let cachedUserId: string | null = null

async function composioUserId(connectedAccountId: string): Promise<string> {
  const fromEnv = process.env.COMPOSIO_USER_ID?.trim()
  if (fromEnv) return fromEnv
  if (cachedUserId) return cachedUserId
  const res = await fetch(`https://backend.composio.dev/api/v3/connected_accounts/${connectedAccountId}`, {
    headers: { 'x-api-key': process.env.COMPOSIO_API_KEY!.trim() },
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
    throw new Error(`Could not read the Composio connection ${connectedAccountId} (${res.status}): ${text.slice(0, 300)}`)
  }
  cachedUserId = String(userId)
  return cachedUserId
}

async function composioFetch(args: Record<string, any>): Promise<any> {
  const body: Record<string, any> = { arguments: args }
  const ca = process.env.COMPOSIO_CONNECTED_ACCOUNT_ID?.trim()
  if (ca) {
    body.connected_account_id = ca
    body.user_id = await composioUserId(ca)
  } else {
    body.user_id = process.env.COMPOSIO_USER_ID?.trim()
  }
  const res = await fetch(COMPOSIO_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': process.env.COMPOSIO_API_KEY!.trim() },
    body: JSON.stringify(body),
    cache: 'no-store',
  })
  const text = await res.text()
  let json: any = null
  try { json = JSON.parse(text) } catch { /* not JSON — the raw text is the detail */ }
  if (!res.ok || !json?.successful) {
    const detail = json ? JSON.stringify(json.error ?? json.message ?? json).slice(0, 400) : text.slice(0, 400)
    throw new Error(`Composio Gmail fetch failed (${res.status}): ${detail}`)
  }
  return json.data
}

const ymd = (d: Date) => `${d.getUTCFullYear()}/${d.getUTCMonth() + 1}/${d.getUTCDate()}`

export function toEmail(m: any): Email {
  return {
    id: String(m?.messageId || ''),
    from: String(m?.sender || ''),
    subject: String(m?.subject || m?.preview?.subject || ''),
    text: String(m?.messageText || m?.preview?.body || '').replace(/\s+/g, ' ').trim(),
    at: String(m?.messageTimestamp || ''),
    labels: Array.isArray(m?.labelIds) ? m.labelIds.map(String) : [],
    url: m?.display_url,
  }
}

// Inbox minus Promotions/Social since `since`. Gmail's date operator is day-granular,
// so we over-fetch by a day and filter on the timestamp ourselves.
export async function fetchInbox(since: Date, until?: Date): Promise<Email[]> {
  const dayBefore = new Date(since.getTime() - 24 * 3600 * 1000)
  const dayAfter = until ? new Date(until.getTime() + 24 * 3600 * 1000) : null
  const query = `in:inbox -category:promotions -category:social after:${ymd(dayBefore)}` + (dayAfter ? ` before:${ymd(dayAfter)}` : '')
  const out: Email[] = []
  let page: string | undefined
  do {
    const data = await composioFetch({ query, max_results: 50, verbose: true, include_payload: false, ...(page ? { page_token: page } : {}) })
    for (const m of data?.messages || []) out.push(toEmail(m))
    page = data?.nextPageToken || undefined
  } while (page && out.length < MAX_FETCH)
  return out
    .filter(e => e.id && Date.parse(e.at) >= since.getTime() && (!until || Date.parse(e.at) <= until.getTime()))
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
}

// ---- classify ------------------------------------------------------------

const CLASSIFY_PROMPT = `You sort a Malaysian ICT company's CGI (Compliance, Governance and Integrity) mailbox.
For EACH email return one object:
- "circular": a REGULATOR, government agency, certification body or standards body announcing a NEW or CHANGED
  requirement, deadline, guideline or filing duty. Typical senders: SSM, JPDP/PDPA, MCMC, RMCD (SST), LHDN,
  DOSH, DOE, MACC/SPRM, PERKESO, EPF, JTK, BOMBA, NACSA, Bursa, a certification body (SIRIM, BSI, TUV), ISO, CMMI.
  Fields: title (short, what the requirement IS, max 100 chars), regulator, summary (max 300 chars),
  effective_date (YYYY-MM-DD or null).
- "action": the email clearly asks the CGI team to DO something with a deadline (submit, respond, attend,
  provide evidence, close a finding). Fields: title (short imperative, max 80 chars), owner (the HOD named, or null),
  due_date (YYYY-MM-DD or null).
- "skip": everything else — newsletters, marketing, vendor pitches, internal chatter, notifications,
  account/security notices, anything without a concrete requirement or ask.
Be strict: when unsure, "skip". Never invent a date or a regulator.
Reply with ONLY a JSON array: [{"id":"...","type":"circular|action|skip", ...fields}]`

export async function classify(emails: Email[]): Promise<Classified[]> {
  if (!emails.length) return []
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const batches: Email[][] = []
  for (let i = 0; i < emails.length; i += 15) batches.push(emails.slice(i, i + 15))

  const results = await Promise.all(batches.map(async b => {
    const res = await client.messages.create({
      model: BOT_MODEL(),
      max_tokens: 4000,
      system: CLASSIFY_PROMPT,
      messages: [{
        role: 'user',
        content: JSON.stringify(b.map(e => ({ id: e.id, from: e.from, subject: e.subject, date: e.at.slice(0, 10), body: e.text.slice(0, BODY_CHARS) }))),
      }],
    })
    const text = res.content.map((c: any) => (c.type === 'text' ? c.text : '')).join('')
    try {
      const arr = JSON.parse(text.slice(text.indexOf('['), text.lastIndexOf(']') + 1))
      return Array.isArray(arr) ? (arr.filter((c: any) => c?.id && c?.type) as Classified[]) : []
    } catch {
      throw new Error('Claude returned unreadable JSON while sorting emails.')
    }
  }))
  return results.flat()
}

// ---- dedupe --------------------------------------------------------------

const keyFor = (id: string) => `gmail:${id}`

async function alreadyImported(ids: string[]): Promise<Set<string>> {
  if (!supabaseConfigured || !ids.length) return new Set()
  const { data, error } = await supabase.from('agent_actions').select('idempotency_key').in('idempotency_key', ids.map(keyFor))
  if (error) throw new Error(`could not check for already-imported emails: ${error.message}`)
  return new Set((data || []).map((r: any) => String(r.idempotency_key).slice('gmail:'.length)))
}

// Does the register already carry this obligation? Cheap title/regulator overlap —
// enough to stop the same circular being proposed as a brand-new duty every week.
function looksKnown(c: Classified, rows: Rec[]): string | null {
  const words = String(c.title || '').toLowerCase().split(/\W+/).filter(w => w.length > 4)
  if (!words.length) return null
  for (const r of rows) {
    if (r.category !== 'obligation') continue
    const hay = `${r.title} ${r.standard || ''}`.toLowerCase()
    const hits = words.filter(w => hay.includes(w)).length
    if (hits >= 2) return r.ref
  }
  return null
}

// ---- the run -------------------------------------------------------------

export async function syncGmail(opts: {
  days: number
  dryRun: boolean
  ownerChatId: string
  rows: Rec[]
  skipDays?: number
}): Promise<SyncReport> {
  const report: SyncReport = {
    fetched: 0, alreadyImported: 0, sensitiveHidden: 0, classified: [],
    filed: [], proposed: [], skipped: [], primary: [], errors: [],
  }
  const now = Date.now()
  const skip = (opts.skipDays || 0) * 24 * 3600 * 1000
  const until = skip ? new Date(now - skip) : undefined
  const since = new Date(now - skip - opts.days * 24 * 3600 * 1000)
  const emails = await fetchInbox(since, until)
  report.fetched = emails.length

  const dayAgo = now - 24 * 3600 * 1000
  report.primary = emails.filter(e => e.labels.includes('CATEGORY_PERSONAL') && Date.parse(e.at) >= dayAgo)

  const safe = emails.filter(e => !isSensitive(e))
  report.sensitiveHidden = emails.length - safe.length
  const done = await alreadyImported(safe.map(e => e.id))
  report.alreadyImported = done.size
  const fresh = safe.filter(e => !done.has(e.id))

  report.classified = await classify(fresh)
  if (opts.dryRun) return report

  const byId = new Map(fresh.map(e => [e.id, e]))

  for (const c of report.classified) {
    const email = byId.get(c.id)
    if (!email) continue
    try {
      // ---- 🟡 CIRCULAR → a proposed obligation (never written without a YES) ----
      if (c.type === 'circular' && c.title) {
        const known = looksKnown(c, opts.rows)
        const payload = {
          op: 'insert', category: 'obligation', title: String(c.title).slice(0, 140),
          status: 'Not Started', severity: 'High', standard: c.regulator || null,
          due_date: c.effective_date || null, owner: null, source: 'gmail-watch',
          note: (c.summary || '').slice(0, 400),
          meta: {
            'Regulator / Source': c.regulator || '', source_email: email.subject.slice(0, 140),
            source_from: email.from.slice(0, 120), source_url: email.url || '',
            matches_existing_ref: known || '', found_on: email.at.slice(0, 10),
          },
          idempotencyKey: keyFor(c.id),
        }
        const row = await proposeAndNotify({
          agentKey: 'regulatory-watch', idempotencyKey: payload.idempotencyKey, payload, chatId: opts.ownerChatId,
          expiresInH: 24 * 7,
          text:
            `📧📡 Circular in the mailbox: <b>${esc(String(c.title).slice(0, 120))}</b>\n` +
            `${esc(c.regulator || senderName(email.from))}${c.effective_date ? ` · effective ${esc(c.effective_date)}` : ''}\n` +
            `<i>${esc((c.summary || email.subject).slice(0, 250))}</i>\n` +
            (known ? `Looks related to ${esc(known)}.\n` : '') +
            `Add it to the obligation register as Not Started?`,
        })
        if (row) report.proposed.push({ id: c.id, what: `${c.title} (${c.regulator || 'circular'})` })
        else report.skipped.push({ id: c.id, why: 'already proposed' })

      // ---- 🟢 ACTION → an open action in the register, undoable ----
      } else if (c.type === 'action' && c.title) {
        const r = await runAutopilot('add-task', {
          op: 'insert', category: 'task', title: String(c.title).slice(0, 80), status: 'Open', severity: 'Medium',
          owner: c.owner || null, due_date: c.due_date || null, source: 'gmail',
          note: `From the mailbox: "${email.subject.slice(0, 120)}"`,
          meta: { gmail_id: c.id, source_from: email.from.slice(0, 120) },
          idempotencyKey: keyFor(c.id),
        })
        if (r) report.filed.push({ id: c.id, what: `Action: ${c.title}`, undo: `/undo-${r.row.id}` })
      }
    } catch (err: any) {
      report.errors.push(`${email.subject.slice(0, 40)}: ${err?.message || err}`)
    }
  }
  return report
}

// ---- the morning Telegram message ---------------------------------------

export const esc = (s: string) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const myTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-MY', { timeZone: 'Asia/Kuala_Lumpur', hour: 'numeric', minute: '2-digit' })

const senderName = (from: string) => from.replace(/<.*>/, '').replace(/"/g, '').trim() || from

export function pingText(r: SyncReport): string {
  const lines: string[] = ['📬 <b>CGI mailbox — last 24 hours</b> (Primary)', '']
  if (!r.primary.length) lines.push('No new Primary email. 🎉')
  for (const e of r.primary.slice(0, PING_MAX)) {
    const subject = isSensitive(e) ? '🔒 login / verification email (hidden)' : esc(e.subject.slice(0, 90) || '(no subject)')
    lines.push(`• <b>${esc(senderName(e.from).slice(0, 40))}</b> — ${subject} <i>(${myTime(e.at)})</i>`)
  }
  if (r.primary.length > PING_MAX) lines.push(`…+${r.primary.length - PING_MAX} more`)

  lines.push('', '📥 <b>From the mailbox</b>')
  if (!r.filed.length && !r.proposed.length) lines.push('Nothing new to file.')
  for (const f of r.filed) lines.push(`🟢 ${esc(f.what)}${f.undo ? `  ${f.undo}` : ''}`)
  for (const p of r.proposed) lines.push(`🟡 ${esc(p.what)} — tap ✅ on the message above`)
  if (r.errors.length) lines.push(`⚠️ ${r.errors.length} error(s) — check the Vercel logs.`)
  return lines.join('\n')
}
