// The agent registry — the ONE place the app learns which robots exist.
//
// Three exports:
//   • AGENTS    — metadata for the "AI Employees" tab (label, emoji, autonomy note).
//   • EXECUTORS — the deterministic run() for each agent. 🔒 These are what
//                 actually write rows. The HITL engine (lib/actions.ts) calls
//                 EXECUTORS[agent_key] AFTER a proposal is approved (or on the 🟢
//                 autopilot path). Nothing here sends to a regulator, deletes a
//                 row, or closes a case without a YES.
//   • SCHEDULED — the daily checks the 08:30 cron sweeps (Overdue chaser, NC tracker).
//
// The Regulatory Watch lives in agents/regwatch.ts and the Report Drafter in
// agents/report.ts — both are called from the same cron on their own cadence.

import { supabase, supabaseConfigured } from '@/lib/supabase'
import { logRun } from '@/lib/runs'
import {
  type Rec, isOpen, isOverdue, daysUntil, needsApproval, catLabel, severityRank,
} from '@/lib/records'

export type AgentMeta = {
  key: string
  label: string
  emoji: string
  autonomyNote: string   // one line describing where its 🟢/🟡 dial sits
}

// Order here = order shown on the AI Employees tab.
export const AGENTS: AgentMeta[] = [
  {
    key: 'overdue-chaser',
    label: 'Overdue Chaser',
    emoji: '⏰',
    autonomyNote:
      'Weekdays 08:30: drafts a reminder to the owner HOD for every overdue risk action, obligation, issue and GBPMS review. ' +
      '🟢 Low/Medium drafts are prepared and you are told; 🟡 High/Critical ask first. It never sends — you do.',
  },
  {
    key: 'nc-tracker',
    label: 'Audit NC Tracker',
    emoji: '🔍',
    autonomyNote:
      'Weekdays: watches audits with open NCs and issues that are Escalated or past due. Proposes status moves (e.g. Closed → Follow-up). ' +
      '🟡 Closing anything always asks first.',
  },
  {
    key: 'regulatory-watch',
    label: 'Regulatory Watch',
    emoji: '📡',
    autonomyNote:
      'Mondays: searches the web (SSM, JPDP, MCMC, LHDN, DOSH, DOE, MACC, NACSA, ISO, CMMI, Bursa NSRF) and reads circulars forwarded to Gmail. ' +
      '🟡 Every new or changed obligation is PROPOSED with its source URL; nothing enters the register until you tap ✅.',
  },
  {
    key: 'report-drafter',
    label: 'Report Drafter',
    emoji: '📝',
    autonomyNote:
      'First working day of the month (or /report any time): builds the management pack — risk heat-map, NC counts, obligations, ESG RAG, training %. ' +
      'Numbers are computed in code, the narrative by Claude. Read-only; it never asks and never writes.',
  },
  {
    key: 'atlas',
    label: 'Atlas (the Telegram bot)',
    emoji: '🤖',
    autonomyNote:
      'Q&A over the registers on Telegram. Can add an action/issue/lesson (🟢, undoable); status changes and new obligations follow the dial; ' +
      'closing a finding or reading a restricted case needs clearance. Never messages a regulator or an HOD on its own.',
  },
]

// ------------------------------------------------------------
// EXECUTORS — deterministic, idempotent action runners.
// 🔒 Don't edit the CALL SHAPE: (payload) => Promise<any>
// ------------------------------------------------------------
export type Executor = (payload: any) => Promise<any>

const nowISO = () => new Date().toISOString()

// ---- writeRecord: insert a register row, or flip a status on one -------------
// op:'insert' → a new records row; result carries record_id (so /undo can mark it
//               Withdrawn — never deleted).
// op:'update' → changes status (+ optional meta merge) on an existing row; result
//               carries previous_status so /undo can put it back.
async function writeRecord(agentKey: string, payload: any): Promise<any> {
  if (!supabaseConfigured) throw new Error('Supabase not configured — cannot write this yet.')
  const op = String(payload?.op || 'insert')

  if (op === 'update') {
    const recordId = Number(payload?.record_id)
    if (!Number.isFinite(recordId)) throw new Error('update needs a numeric record_id')
    const { data: before } = await supabase.from('records').select('id, ref, title, status, category, meta').eq('id', recordId)
    const orig = before?.[0]
    if (!orig) throw new Error(`no record #${recordId} to update`)
    const patch: Record<string, any> = { updated_at: nowISO() }
    if (payload?.status != null) patch.status = String(payload.status)
    if (payload?.due_date !== undefined) patch.due_date = payload.due_date
    if (payload?.meta && typeof payload.meta === 'object') patch.meta = { ...(orig.meta || {}), ...payload.meta }
    const { data, error } = await supabase.from('records').update(patch).eq('id', recordId).select()
    if (error) throw new Error(`could not update the record: ${error.message}`)
    const row = data?.[0]
    const result = {
      kind: 'record_updated',
      record_id: recordId,
      ref: row.ref,
      title: row.title,
      category: row.category,
      status: row.status,
      previous_status: orig.status,
    }
    await logRun(agentKey, 'ok', result)
    return result
  }

  // op:'insert' — a new register row (obligation / issue / lesson / task).
  const title = String(payload?.title || '').trim() || 'Untitled'
  const category = String(payload?.category || 'task')
  const { data, error } = await supabase
    .from('records')
    .insert({
      ref: payload?.ref || null,
      title,
      category,
      status: String(payload?.status || 'Open'),
      severity: payload?.severity || null,
      owner: payload?.owner || null,
      due_date: payload?.due_date || null,
      value: payload?.value ?? null,
      classification: 'internal',            // the robot can never create a restricted row
      standard: payload?.standard || null,
      notes: payload?.note || `Added by ${agentKey} 🤖`,
      meta: { ...(payload?.meta || {}), source: payload?.source || agentKey },
    })
    .select()
  if (error) throw new Error(`could not add the ${category}: ${error.message}`)
  const recordId = data?.[0]?.id ?? null
  const result = { kind: 'record_created', record_id: recordId, title, category, ref: payload?.ref || null }
  await logRun(agentKey, 'ok', result)
  return result
}

// ---- draftOnly: the chaser -------------------------------------------------
// Produces a DRAFT the human reads and sends. There is deliberately no send here —
// messages to HODs, auditors or regulators are 🔴 NEVER-zone. Returns the draft.
async function draftOnly(agentKey: string, payload: any): Promise<any> {
  const result = {
    kind: 'draft' as const,
    ref: payload?.ref || null,
    to: payload?.owner || null,
    channel: payload?.channel || 'email',
    text: (payload?.text || '').toString().trim() || '(no draft text was provided)',
    ready_to_send: false as const, // always false — the robot never sends. You do.
    drafted_at: nowISO(),
  }
  await logRun(agentKey, 'ok', { drafted: true, ref: result.ref, to: result.to })
  return result
}

export const EXECUTORS: Record<string, Executor> = {
  // The scheduled robots.
  'overdue-chaser':   (p) => draftOnly('overdue-chaser', p),
  'nc-tracker':       (p) => writeRecord('nc-tracker', p),
  'regulatory-watch': (p) => writeRecord('regulatory-watch', p),
  // The Atlas bot ACTION tools — all write through writeRecord, all pass the same
  // CAS/approval funnel. 🟢 add-task/add-issue/add-lesson autopilot; the rest follow the dial.
  'add-task':         (p) => writeRecord('add-task', p),
  'add-issue':        (p) => writeRecord('add-issue', p),
  'add-lesson':       (p) => writeRecord('add-lesson', p),
  'add-obligation':   (p) => writeRecord('add-obligation', p),
  'update-status':    (p) => writeRecord('update-status', p),
  'close-finding':    (p) => writeRecord('close-finding', p),
}

// ============================================================
// SCHEDULED CHECKS — swept by /api/cron-daily (weekdays 08:30 MYT) and by the
// /<agent-key> Telegram command. A check() reads today's rows and returns a list
// of proposals to CREATE — it NEVER executes anything itself. A stable
// idempotency_key (row + day) means re-running never duplicates a proposal.
// `auto: true` = 🟢 (run it, then tell me). Omitted = 🟡 ask first.
// ============================================================
export type ProposalDraft = { idempotencyKey: string; payload: any; text: string; auto?: boolean }
export type ScheduledCheck = {
  key: string
  label: string
  check: (rows: Rec[], today: string) => ProposalDraft[]
}

const esc = (s: string) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// What an overdue item is called in a reminder, per register.
const NOUN: Record<string, string> = {
  risk: 'risk treatment action', obligation: 'compliance obligation', issue: 'issue',
  gbpms: 'GBPMS document review', audit: 'audit follow-up', task: 'action',
}

// ---- Overdue Chaser ---------------------------------------------------------
// Every open item past its date (or flagged Overdue) in the chaseable registers →
// a reminder draft addressed to the owner HOD. Dial: Low/Medium drafts are 🟢
// (prepared + you're told); High/Critical are 🟡 (ask before drafting).
const overdueChaser: ScheduledCheck = {
  key: 'overdue-chaser',
  label: 'Overdue Chaser',
  check: (rows, today) =>
    rows
      .filter(r => ['risk', 'obligation', 'issue', 'gbpms', 'task'].includes(r.category) && isOverdue(r, today))
      .sort((a, b) => severityRank(b.severity) - severityRank(a.severity))
      .slice(0, 12)   // never flood the chat: worst 12 per day
      .map(r => {
        const late = r.due_date ? Math.abs(daysUntil(r.due_date, today) ?? 0) : null
        const who = r.owner || 'the owner'
        const noun = NOUN[r.category] || catLabel(r.category).toLowerCase()
        const when = r.due_date ? `was due on ${r.due_date}${late ? ` (${late} days ago)` : ''}` : 'is marked overdue'
        const text =
          `Hi ${who} team, the ${noun} ${r.ref ? `${r.ref} ` : ''}"${r.title}" ${when} and is still ${r.status}. ` +
          `Could you share the current status and a revised date by end of week? Thank you — CGI`
        return {
          idempotencyKey: `overdue-chaser:${r.id}:${today}`,
          auto: !needsApproval(r, today),
          payload: { ref: r.ref, record_id: r.id, owner: r.owner, severity: r.severity, channel: 'email', text,
                     note: `${r.severity || 'Unrated'} ${noun} overdue — reminder to ${who}` },
          text:
            `⏰ <b>${esc(r.ref || r.title)}</b> — ${esc(noun)} ${esc(when)} · ${esc(r.severity || '')} · owner ${esc(who)}.\n` +
            `Draft a reminder to ${esc(who)} for you to send?`,
        }
      }),
}

// ---- Audit NC Tracker ---------------------------------------------------------
// (a) A CLOSED audit that still has NCs open → propose moving it to Follow-up.
// (b) An issue that is Escalated for 30+ days with no due date change → propose
//     re-baselining it (status In Progress, due +14 days) so it is chased again.
// Everything here is a status write → follows the dial; anything High+ asks.
const ncTracker: ScheduledCheck = {
  key: 'nc-tracker',
  label: 'Audit NC Tracker',
  check: (rows, today) => {
    const out: ProposalDraft[] = []
    for (const r of rows) {
      if (r.category === 'audit' && (r.status || '').toLowerCase() === 'closed' && Number(r.value || 0) > 0) {
        out.push({
          idempotencyKey: `nc-tracker:reopen:${r.id}:${today.slice(0, 7)}`,   // once a month per audit
          payload: { op: 'update', record_id: r.id, status: 'Follow-up', ref: r.ref,
                     note: `${r.value} NC(s) still open on a closed audit` },
          text:
            `🔍 <b>${esc(r.ref || '')}</b> ${esc(r.title)} is marked Closed but has <b>${r.value}</b> NC(s) open ` +
            `(auditee ${esc(r.owner || '—')}). Move it to <b>Follow-up</b> so the NCs are tracked?`,
        })
      }
      if (r.category === 'issue' && (r.status || '').toLowerCase() === 'escalated' && isOpen(r)) {
        const open = Number(r.value || 0)
        if (open >= 30) {
          out.push({
            idempotencyKey: `nc-tracker:rebaseline:${r.id}:${today.slice(0, 7)}`,
            payload: { op: 'update', record_id: r.id, status: 'In Progress', ref: r.ref,
                       due_date: new Date(Date.parse(today) + 14 * 86_400_000).toISOString().slice(0, 10),
                       note: `Escalated ${open} days — re-baselined for chasing` },
            text:
              `🧯 <b>${esc(r.ref || '')}</b> ${esc(r.title)} has been Escalated for <b>${open}</b> days ` +
              `(${esc(r.severity || '')}, owner ${esc(r.owner || '—')}). Re-baseline to In Progress with a new due date 14 days out?`,
          })
        }
      }
    }
    return out.slice(0, 8)
  },
}

export const SCHEDULED: ScheduledCheck[] = [overdueChaser, ncTracker]
