import { supabase, supabaseConfigured } from '@/lib/supabase'
import { sendMessage } from '@/lib/telegram'
import {
  getRecords, getHealth, todayISO, isOverdue, isDueSoon, isOpen, severityRank,
  approvalLevel, catPlural, type Rec,
} from '@/lib/records'
import { propose, proposeAndNotify, runAutopilot } from '@/lib/actions'
import { SCHEDULED, type ProposalDraft } from '@/agents/registry'
import { runRegulatoryWatch, watchSummary } from '@/agents/regwatch'
import { runReport } from '@/agents/report'
import { runSvp, svpQuietText } from '@/agents/svp'

// 🔒 Don't edit — this keeps your robot safe.
// THE weekday cron — 08:30 Malaysia time (vercel.json: "30 0 * * 1-5").
// It runs four things in order:
//   ① the morning brief — overdue · due this week · open High/Critical · needs your YES,
//   ② a sweep of the scheduled robots (Overdue Chaser, NC Tracker) — they only
//      CREATE proposals; nothing is executed here except 🟢 graduated ones,
//   ③ on MONDAY, the Regulatory Watch (web search → 🟡 proposals with source URLs),
//   ④ on the FIRST WORKING DAY of the month, the management pack.
//
// AUTH FAILS CLOSED: this endpoint spends credit + creates proposals, so with no
// CRON_SECRET set it returns 401 to everyone. Vercel Cron sends the Bearer token
// automatically once you set the same value in your Vercel env.

export const dynamic = 'force-dynamic'
export const maxDuration = 300

// Who receives the brief: your team's numeric Telegram ids, or OWNER_CHAT_ID as
// the solo fallback. None set = nobody (the brief just no-ops).
function recipients(): string[] {
  const team = (process.env.TELEGRAM_TEAM_CHAT_IDS || '').split(',').map(s => s.trim()).filter(s => /^-?\d+$/.test(s))
  const list = team.length ? team : ([process.env.OWNER_CHAT_ID?.trim()].filter(Boolean) as string[])
  return Array.from(new Set(list))
}

const esc = (s: string) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// Is `today` the first working day (Mon-Fri) of its month? True when today is a
// weekday and every earlier day this month was a weekend — so the pack lands on
// the 1st, or on Monday when the 1st fell on a Saturday or Sunday.
function isFirstWorkingDay(today: string): boolean {
  const d = new Date(today + 'T00:00:00Z')
  const dow = d.getUTCDay()
  if (dow === 0 || dow === 6) return false
  for (let day = 1; day < d.getUTCDate(); day++) {
    const earlier = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), day)).getUTCDay()
    if (earlier !== 0 && earlier !== 6) return false   // an earlier weekday exists
  }
  return true
}

export async function GET(req: Request) {
  // ---- FAIL-CLOSED Bearer. Unset secret ⇒ 401 (never open). ----
  const secret = process.env.CRON_SECRET?.trim()
  const authed = !!secret && req.headers.get('authorization') === `Bearer ${secret}`
  if (!authed) return new Response('forbidden', { status: 401 })

  const url = new URL(req.url)
  const force = url.searchParams.get('force') || ''     // "watch" | "report" — for testing
  // ?only=svp|brief|sweep|watch|report — run ONE section. For testing a single
  // robot without firing the whole morning. Still behind the same Bearer secret.
  const only = url.searchParams.get('only') || ''
  const run = (section: string) => !only || only === section
  const today = todayISO()
  const dow = new Date(today + 'T00:00:00Z').getUTCDay()
  const owner = process.env.OWNER_CHAT_ID?.trim() || ''

  // The cron itself is never cleared for restricted rows; investigation counts are
  // reported only as a number, never with case detail (see buildBrief).
  const rows = await getRecords('internal')

  // ① THE BRIEF
  let proposed: { agent_key: string; payload: any }[] = []
  if (supabaseConfigured) {
    const { data } = await supabase.from('agent_actions').select('agent_key, payload').eq('status', 'proposed').gt('expires_at', new Date().toISOString())
    proposed = (data ?? []) as any[]
  }
  const to = recipients()
  let sent = 0
  if (run('brief')) {
    const brief = buildBrief(rows, proposed, today)
    const sends = await Promise.allSettled(to.map(id => sendMessage(id, brief)))
    sent = sends.filter(r => r.status === 'fulfilled').length
  }

  // ② SWEEP the scheduled robots — CREATE proposals (🟡) or run graduated ones (🟢).
  let created = 0
  for (const agent of (run('sweep') ? SCHEDULED : [])) {
    let drafts: ProposalDraft[] = []
    try {
      drafts = agent.check(rows, today)
    } catch (e) {
      console.error(`[CGI] scheduled check "${agent.key}" threw:`, e)
      continue
    }
    for (const d of drafts) {
      if (d.auto) {
        const done = await runAutopilot(agent.key, d.payload)
        if (done) {
          created++
          if (owner) await sendMessage(owner, `🟢 <b>${agent.label}</b> handled this: ${d.text}\nReply <code>/undo-${done.row.id}</code> within 24h to reverse.`)
        }
        continue
      }
      const row = owner
        ? await proposeAndNotify({ agentKey: agent.key, idempotencyKey: d.idempotencyKey, payload: d.payload, chatId: owner, text: d.text })
        : await propose({ agentKey: agent.key, idempotencyKey: d.idempotencyKey, payload: d.payload })
      if (row) created++
    }
  }

  // ③ THE SVP — the department head's one recommendation for the day. Reads the
  //    restricted register too, so the card goes only to the owner, never to a
  //    team group. Recommend-only: it proposes, it never writes.
  let svp: any = { ran: false }
  if (owner && run('svp')) {
    try {
      const svpRows = await getRecords('restricted')
      const r = await runSvp({ rows: svpRows, ownerChatId: owner })
      svp = { ran: true, candidates: r.candidates.length, ref: r.candidates[0]?.ref ?? null, proposed: r.proposed, narrative: r.narrative, verified: r.verified }
      if (!r.proposed) await sendMessage(owner, svpQuietText(r))
    } catch (e: any) {
      console.error('[CGI] svp failed:', e)
      svp = { ran: false, error: String(e?.message || e).slice(0, 200) }
    }
  }

  // ④ MONDAY — the Regulatory Watch. Proposals only; every one carries its source URL.
  let watch: any = { ran: false }
  if (run('watch') && (dow === 1 || force === 'watch')) {
    try {
      const r = await runRegulatoryWatch({ rows, ownerChatId: owner })
      watch = { ran: r.ran, searched: r.searched, findings: r.findings.length, proposed: r.proposed.length, error: r.error }
      if (owner) await sendMessage(owner, watchSummary(r))
    } catch (e: any) {
      console.error('[CGI] regulatory watch failed:', e)
      watch = { ran: false, error: String(e?.message || e).slice(0, 200) }
    }
  }

  // ⑤ FIRST WORKING DAY — the management pack.
  let report = false
  if (run('report') && (isFirstWorkingDay(today) || force === 'report')) {
    try {
      const text = await runReport(rows)
      await Promise.allSettled(to.map(id => sendMessage(id, text)))
      report = true
    } catch (e) {
      console.error('[CGI] report failed:', e)
    }
  }

  return Response.json({ ok: true, today, only: only || 'all', sent, recipients: to.length, needs_yes: proposed.length, proposals_created: created, svp, watch, report })
}

// ------------------------------------------------------------
// The mandated brief — deterministic, always available (no API key required).
// ------------------------------------------------------------
function buildBrief(rows: Rec[], proposed: { agent_key: string; payload: any }[], today: string): string {
  const h = getHealth(rows, today)

  const worst = (list: Rec[]) =>
    list.sort((a, b) => severityRank(b.severity) - severityRank(a.severity) || (a.due_date || '').localeCompare(b.due_date || '')).slice(0, 3)

  const line = (r: Rec) =>
    `• <b>${esc(r.ref || r.title)}</b> ${esc(r.ref ? r.title.slice(0, 48) : '')} — ${esc(r.severity || 'unrated')}` +
    `${r.due_date ? ` · due ${r.due_date}` : ''}${r.owner ? ` · ${esc(r.owner)}` : ''}`

  const overdue = rows.filter(r => isOverdue(r, today))
  const soon = rows.filter(r => isDueSoon(r, 7, today))
  const high = rows.filter(r => isOpen(r) && severityRank(r.severity) >= 3 && !isOverdue(r, today))

  // Which registers the overdue items sit in, as a one-line spread.
  const spread = Object.entries(h.byCategory)
    .filter(([, b]) => b.overdue > 0)
    .sort((a, b) => b[1].overdue - a[1].overdue)
    .map(([c, b]) => `${catPlural(c)} ${b.overdue}`)
    .join(' · ')

  const L: string[] = []
  L.push(`☀️ <b>CGI OS — morning brief</b> · ${today}`)
  L.push('')
  L.push(`<b>The picture</b>`)
  L.push(`🔴 ${h.overdue} overdue · 🟠 ${h.dueSoon} due in 7 days · ⚠️ ${h.openHigh} open High/Critical · ${h.open} open in total`)
  if (spread) L.push(`<i>Overdue sits in: ${esc(spread)}</i>`)
  L.push('')
  L.push(`<b>Overdue</b>${overdue.length > 3 ? ` (worst 3 of ${overdue.length})` : ''}`)
  L.push(overdue.length ? worst(overdue).map(line).join('\n') : '✅ Nothing overdue.')
  L.push('')
  L.push(`<b>Due this week</b>${soon.length > 3 ? ` (next 3 of ${soon.length})` : ''}`)
  L.push(soon.length ? soon.sort((a, b) => (a.due_date || '').localeCompare(b.due_date || '')).slice(0, 3).map(line).join('\n') : '✅ Nothing due in 7 days.')
  L.push('')
  L.push(`<b>Open High / Critical</b>${high.length > 3 ? ` (top 3 of ${high.length})` : ''}`)
  L.push(high.length ? worst(high).map(line).join('\n') : '✅ None open above your line.')
  L.push('')
  let ask = `🙋 <b>${proposed.length}</b> waiting on your YES (dial: ${esc(approvalLevel())}).`
  if (proposed.length) {
    ask += '\n' + proposed.slice(0, 5).map(a => {
      const p = a.payload || {}
      const what = p.ref || p.title || (p.note ? String(p.note).slice(0, 48) : a.agent_key)
      return `• ${esc(a.agent_key)}: ${esc(String(what).slice(0, 60))}`
    }).join('\n')
    if (proposed.length > 5) ask += `\n…and ${proposed.length - 5} more`
  }
  L.push(`<b>Needs you</b>`)
  L.push(ask)
  return L.join('\n')
}
