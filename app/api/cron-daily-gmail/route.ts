import { supabase, supabaseConfigured } from '@/lib/supabase'
import { logRun } from '@/lib/runs'
import { sendMessage } from '@/lib/telegram'
import { syncGmail, pingText, composioConfigured, esc } from '@/lib/gmail-sync'
import { getRecords } from '@/lib/records'

// The 8am (Malaysia) mailbox sync + ping — Vercel's 2nd free cron slot.
// vercel.json: "0 0 * * *" = 00:00 UTC = 08:00 MYT (Hobby fires within that hour).
// It reads the watched mailbox for compliance circulars (🟡 proposed obligations,
// they need your YES) and asks (🟢 open actions, undoable). Read-only on Gmail.
//
// Path note: it lives at /api/cron-daily-gmail ON PURPOSE — proxy.ts's passcode gate
// already exempts every path starting with "api/cron-daily", so Vercel Cron (which
// has no login cookie) can reach it without editing that locked file.
//
// AUTH FAILS CLOSED, same as /api/cron-daily: no CRON_SECRET ⇒ 401 for everyone.
//
// Query params (for testing; still need the Bearer token):
//   ?dry=1    fetch + sort only — no records written, no Telegram message
//   ?days=N   look back N days (default: 30 on the very first run, then 1)

export const dynamic = 'force-dynamic'
export const maxDuration = 60

async function isFirstRun(): Promise<boolean> {
  if (!supabaseConfigured) return false
  const { count } = await supabase
    .from('agent_actions')
    .select('id', { count: 'exact', head: true })
    .like('idempotency_key', 'gmail:%')
  return (count ?? 0) === 0
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET?.trim()
  const authed = !!secret && req.headers.get('authorization') === `Bearer ${secret}`
  if (!authed) return new Response('forbidden', { status: 401 })

  const owner = process.env.OWNER_CHAT_ID?.trim() || ''
  const url = new URL(req.url)
  const dryRun = url.searchParams.get('dry') === '1'

  if (!composioConfigured()) {
    // Name the missing one(s) — never the values.
    const missing = [
      process.env.COMPOSIO_API_KEY?.trim() ? null : 'COMPOSIO_API_KEY',
      (process.env.COMPOSIO_CONNECTED_ACCOUNT_ID?.trim() || process.env.COMPOSIO_USER_ID?.trim())
        ? null : 'COMPOSIO_CONNECTED_ACCOUNT_ID',
    ].filter(Boolean)
    const msg = `Mailbox sync is not set up: add ${missing.join(' and ')} in Vercel (Production), then redeploy.`
    if (owner && !dryRun) await sendMessage(owner, `⚠️ ${msg}`)
    return Response.json({ ok: false, error: msg }, { status: 500 })
  }

  // `skip` shifts the window back in time, so a long backfill can be run in
  // chunks that each fit the function's time limit:
  //   ?days=30&skip=30  → the month before last month.
  const skipParam = Number(url.searchParams.get('skip'))
  const skipDays = Number.isFinite(skipParam) && skipParam > 0 ? Math.min(skipParam, 400) : 0

  const daysParam = Number(url.searchParams.get('days'))
  const days = Number.isFinite(daysParam) && daysParam > 0
    ? Math.min(daysParam, 400)
    // 2 days, not 1: the sorting model is not identical run to run, so every email
    // gets a second chance the next morning. Re-imports are impossible (gmail:<id>).
    : (await isFirstRun()) ? 30 : 2

  try {
    // The register is read FIRST so the classifier can say "this looks like CO-014"
    // instead of proposing a duty you already track.
    const rows = await getRecords('internal')
    const report = await syncGmail({ days, dryRun, ownerChatId: owner, rows, skipDays })
    // Every run leaves a trace in agent_runs, even a quiet one that files nothing —
    // otherwise "did the 8am cron fire?" is unanswerable after the fact.
    if (!dryRun) {
      await logRun('gmail-watch', 'ok', {
        days, fetched: report.fetched, filed: report.filed.length,
        proposed: report.proposed.length, already: report.alreadyImported,
        ua: req.headers.get('user-agent')?.slice(0, 60) || null,
      })
    }
    if (!dryRun && owner) await sendMessage(owner, pingText(report))
    return Response.json({
      ok: true, dryRun, days,
      fetched: report.fetched,
      alreadyImported: report.alreadyImported,
      sensitiveHidden: report.sensitiveHidden,
      primaryLast24h: report.primary.length,
      classified: report.classified,
      filed: report.filed,
      proposed: report.proposed,
      skipped: report.skipped,
      errors: report.errors,
      ...(dryRun ? { ping_preview: pingText(report) } : {}),
    })
  } catch (err: any) {
    const message = err?.message || String(err)
    console.error('[CGI] gmail sync failed:', message)
    if (!dryRun) await logRun('gmail-watch', 'failed', { days, error: message.slice(0, 300) })
    if (owner && !dryRun) await sendMessage(owner, `⚠️ 8am mailbox sync failed: ${esc(message.slice(0, 300))}`)
    return Response.json({ ok: false, error: message }, { status: 500 })
  }
}
