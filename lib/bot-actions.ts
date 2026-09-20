import 'server-only'
import { randomUUID } from 'crypto'
import { type Rec, isOpen, needsApproval, approvalLevel, catLabel } from './records'
import { runAutopilot, proposeAndNotify } from './actions'

// 🔒 Don't edit — this keeps your robot safe.
// The Atlas bot's WRITE hands. Where lib/bot-tools.ts only READS, these tools
// ACT — but every one goes through the SAME approval engine the scheduled robots
// use (lib/actions.ts), so the severity dial applies exactly:
//   🟢 small + reversible (add an action / issue / lesson; a Low/Medium status
//      change on something not overdue) → autopilot: runs once, tells you, /undo.
//   🟡 register truth (a new obligation; a High/Critical or overdue status change)
//      → propose: Approve/Reject buttons on Telegram; nothing happens until ✅.
//   🟡 ALWAYS: closing a finding / resolving an issue / completing an obligation.
//   🔴 send to a regulator or HOD / delete / touch a restricted case → NOT a tool.
// Nothing here writes a row directly — it all funnels through runAutopilot /
// proposeAndNotify, the only once-only execution path.

export const BOT_ACTION_TOOLS = [
  {
    name: 'add_action',
    description:
      'Add an open action / to-do to the register (category task). Reversible, so it just does it (🟢) with an /undo. ' +
      'Use for "add action: chase Legal for the PDPA DPO form by Friday", "remind me to book the 27001 audit".',
    input_schema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string', description: 'What the action is.' },
        due_date: { type: 'string', description: 'Optional YYYY-MM-DD deadline.' },
        owner: { type: 'string', description: 'Optional HOD / person responsible.' },
      },
      required: ['title'],
    },
  },
  {
    name: 'add_issue',
    description:
      'Raise a new project or company issue. Low/Medium is 🟢 (added, undoable); High/Critical asks first (🟡). ' +
      'Use for "raise an issue: supplier missed SLA, High, Procurement".',
    input_schema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string' },
        severity: { type: 'string', enum: ['Critical', 'High', 'Medium', 'Low'], description: 'Default Medium.' },
        owner: { type: 'string', description: 'Owner HOD.' },
        type: { type: 'string', enum: ['Project', 'Company'], description: 'Default Company.' },
        due_date: { type: 'string', description: 'Optional YYYY-MM-DD.' },
      },
      required: ['title'],
    },
  },
  {
    name: 'add_lesson',
    description:
      'Capture a lesson learned. Reversible → 🟢 with /undo. Use for "log a lesson: sign baseline scope before kickoff".',
    input_schema: {
      type: 'object' as const,
      properties: {
        lesson: { type: 'string' },
        project: { type: 'string', description: 'Optional project name.' },
        category: { type: 'string', description: 'Optional: Governance, Scope, Quality, Commercial, Stakeholder, Supply Chain, OSH, Security.' },
      },
      required: ['lesson'],
    },
  },
  {
    name: 'add_obligation',
    description:
      'Add a NEW compliance obligation to the register. Register truth → always asks first (🟡 Approve). ' +
      'Use for "add obligation: Cyber Security Act NCII registration, NACSA, due 2026-12-31, owner Information Security".',
    input_schema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string' },
        regulator: { type: 'string', description: 'Regulator / source, e.g. "PDPA 2010 / JPDP".' },
        owner: { type: 'string', description: 'Owner HOD.' },
        due_date: { type: 'string', description: 'YYYY-MM-DD.' },
        source_url: { type: 'string', description: 'Optional URL of the circular / notice.' },
      },
      required: ['title'],
    },
  },
  {
    name: 'update_status',
    description:
      'Change the status of an existing register item (risk action, obligation, issue, audit, GBPMS document, CMMI area). ' +
      'Give the ref (ERM-…, CO-…, PI-…, IA-…, GBPMS-…) or a title fragment; if unclear, I list the matches. ' +
      'Low/Medium and not overdue → 🟢 done with /undo; High/Critical or overdue → 🟡 asks first. ' +
      'To CLOSE / RESOLVE / COMPLETE something use close_finding instead.',
    input_schema: {
      type: 'object' as const,
      properties: {
        item: { type: 'string', description: 'Ref or title fragment.' },
        status: { type: 'string', description: 'The new status word, e.g. In Progress, Follow-up, Fieldwork, Under Review, On Track.' },
        due_date: { type: 'string', description: 'Optional new YYYY-MM-DD due date.' },
      },
      required: ['item', 'status'],
    },
  },
  {
    name: 'close_finding',
    description:
      'Close / resolve / complete a register item (mark an issue Resolved, an obligation Completed, an audit Closed, a risk action Completed). ' +
      'This is register truth → ALWAYS asks first (🟡 Approve). Use for "close PI-004", "mark CO-001 completed".',
    input_schema: {
      type: 'object' as const,
      properties: {
        item: { type: 'string', description: 'Ref or title fragment.' },
        note: { type: 'string', description: 'Optional evidence / closure note.' },
      },
      required: ['item'],
    },
  },
]

export const ACTION_TOOL_NAMES = new Set(BOT_ACTION_TOOLS.map(t => t.name))

export type BotActionCtx = { chatId: number; rows: Rec[] }

const esc = (s: string) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// The word each register uses for "done".
const CLOSE_WORD: Record<string, string> = {
  issue: 'Resolved', obligation: 'Completed', audit: 'Closed', risk: 'Completed',
  gbpms: 'Current', task: 'Completed', cmmi: 'On Track', training: 'On Track', lesson: 'Implemented',
}

// Find candidate rows by ref (exact-ish) first, then by title fragment. Never restricted.
function matchRows(rows: Rec[], q: string, openOnly = true): Rec[] {
  const needle = q.toLowerCase().trim()
  if (!needle) return []
  const pool = rows.filter(r => r.classification !== 'restricted' && (!openOnly || isOpen(r)))
  const byRef = pool.filter(r => (r.ref || '').toLowerCase() === needle)
  if (byRef.length) return byRef
  const refPart = pool.filter(r => (r.ref || '').toLowerCase().includes(needle))
  if (refPart.length) return refPart
  return pool.filter(r => r.title.toLowerCase().includes(needle))
}

const candidates = (m: Rec[]) => m.slice(0, 5).map(r => ({ id: r.id, ref: r.ref, title: r.title, register: r.category, status: r.status, owner: r.owner }))

// ------------------------------------------------------------
// runBotAction — execute ONE action tool. Returns a compact JSON string the loop
// feeds back to Claude (so Claude can phrase the reply, including any /undo id or
// "tap Approve above"). Every write goes through the CAS engine. Never throws.
// ------------------------------------------------------------
export async function runBotAction(name: string, input: any, ctx: BotActionCtx): Promise<string> {
  const { chatId, rows } = ctx
  const level = approvalLevel()
  try {
    // ---- 🟢 add_action ----
    if (name === 'add_action') {
      const title = String(input?.title || '').trim()
      if (!title) return JSON.stringify({ status: 'error', message: 'What is the action?' })
      const done = await runAutopilot('add-task', {
        op: 'insert', category: 'task', title, status: 'Open', severity: 'Low',
        owner: input?.owner || null, due_date: input?.due_date || null,
        source: 'atlas', idempotencyKey: randomUUID(),
      })
      if (!done) return JSON.stringify({ status: 'noop', message: 'Already added.' })
      return JSON.stringify({ status: 'added', zone: 'green', record_id: done.row.id, action: title,
        due_date: input?.due_date || null, undo: `/undo-${done.row.id}`, tell_user: 'Added it (autopilot, reversible). Offer the /undo id.' })
    }

    // ---- 🟢/🟡 add_issue — dial on severity ----
    if (name === 'add_issue') {
      const title = String(input?.title || '').trim()
      if (!title) return JSON.stringify({ status: 'error', message: 'What is the issue?' })
      const severity = ['Critical', 'High', 'Medium', 'Low'].includes(input?.severity) ? input.severity : 'Medium'
      const payload = {
        op: 'insert', category: 'issue', title, status: 'Open', severity, owner: input?.owner || null,
        due_date: input?.due_date || null, source: 'atlas',
        meta: { Type: input?.type || 'Company', Raised: new Date().toISOString().slice(0, 10) },
        idempotencyKey: randomUUID(),
      }
      if (!needsApproval({ severity, status: 'Open', due_date: null })) {
        const done = await runAutopilot('add-issue', payload)
        if (!done) return JSON.stringify({ status: 'noop', message: 'Already raised.' })
        return JSON.stringify({ status: 'added', zone: 'green', record_id: done.row.id, issue: title, severity,
          undo: `/undo-${done.row.id}`, tell_user: 'Raised it (autopilot, reversible). Offer the /undo id.' })
      }
      const row = await proposeAndNotify({
        agentKey: 'add-issue', idempotencyKey: payload.idempotencyKey, payload, chatId,
        text: `🧯 Raise a <b>${esc(severity)}</b> issue: <b>${esc(title)}</b>${input?.owner ? ` · owner ${esc(input.owner)}` : ''}? (${esc(severity)} is at/above your ${esc(level)} line.)`,
      })
      return JSON.stringify(row
        ? { status: 'proposed', zone: 'yellow', sent_buttons: true, tell_user: `Proposed the ${severity} issue — Approve/Reject buttons sent. Tell them to tap ✅.` }
        : { status: 'noop', message: 'Already waiting on your YES for this one.' })
    }

    // ---- 🟢 add_lesson ----
    if (name === 'add_lesson') {
      const lesson = String(input?.lesson || '').trim()
      if (!lesson) return JSON.stringify({ status: 'error', message: 'What is the lesson?' })
      const done = await runAutopilot('add-lesson', {
        op: 'insert', category: 'lesson', title: lesson, status: 'Captured', source: 'atlas',
        meta: { Project: input?.project || '', Category: input?.category || '', Captured: new Date().toISOString().slice(0, 10), 'Applied to GBPMS': 'No' },
        idempotencyKey: randomUUID(),
      })
      if (!done) return JSON.stringify({ status: 'noop', message: 'Already captured.' })
      return JSON.stringify({ status: 'added', zone: 'green', record_id: done.row.id, lesson, undo: `/undo-${done.row.id}`,
        tell_user: 'Captured the lesson (autopilot). Offer the /undo id.' })
    }

    // ---- 🟡 add_obligation — always ask ----
    if (name === 'add_obligation') {
      const title = String(input?.title || '').trim()
      if (!title) return JSON.stringify({ status: 'error', message: 'What is the obligation?' })
      const payload = {
        op: 'insert', category: 'obligation', title, status: 'Not Started', severity: 'High',
        owner: input?.owner || null, due_date: input?.due_date || null, standard: input?.regulator || null, source: 'atlas',
        meta: { 'Regulator / Source': input?.regulator || '', source_url: input?.source_url || '' },
        idempotencyKey: randomUUID(),
      }
      const row = await proposeAndNotify({
        agentKey: 'add-obligation', idempotencyKey: payload.idempotencyKey, payload, chatId,
        text: `📜 Add obligation <b>${esc(title)}</b>${input?.regulator ? ` · ${esc(input.regulator)}` : ''}${input?.due_date ? ` · due ${esc(input.due_date)}` : ''}${input?.owner ? ` · owner ${esc(input.owner)}` : ''}? (Register truth — needs your YES.)`,
      })
      return JSON.stringify(row
        ? { status: 'proposed', zone: 'yellow', sent_buttons: true, tell_user: 'Proposed the new obligation — buttons sent. Tell them to tap ✅.' }
        : { status: 'noop', message: 'Already proposed.' })
    }

    // ---- 🟢/🟡 update_status — resolve, then dial ----
    if (name === 'update_status') {
      const status = String(input?.status || '').trim()
      if (!status) return JSON.stringify({ status: 'error', message: 'Which status?' })
      if (/^(closed|resolved|completed|done)$/i.test(status)) {
        return JSON.stringify({ status: 'redirect', message: 'Closing something must go through close_finding (it always asks first). Call close_finding.' })
      }
      const matches = matchRows(rows, String(input?.item || ''))
      if (matches.length === 0) return JSON.stringify({ status: 'not_found', message: `No open register item matching "${input?.item}".` })
      if (matches.length > 1) return JSON.stringify({ status: 'ambiguous', message: 'Which one?', candidates: candidates(matches) })
      const it = matches[0]
      const payload = { op: 'update', record_id: it.id, ref: it.ref, status, ...(input?.due_date ? { due_date: input.due_date } : {}), idempotencyKey: randomUUID() }
      if (!needsApproval(it)) {
        const done = await runAutopilot('update-status', payload)
        if (!done) return JSON.stringify({ status: 'noop', message: 'Already handled.' })
        return JSON.stringify({ status: 'updated', zone: 'green', record_id: done.row.id, ref: it.ref, from: it.status, to: status,
          undo: `/undo-${done.row.id}`, tell_user: 'Updated (autopilot, reversible). Offer the /undo id.' })
      }
      const row = await proposeAndNotify({
        agentKey: 'update-status', idempotencyKey: payload.idempotencyKey, payload, chatId,
        text: `✏️ Move <b>${esc(it.ref || it.title)}</b> (${esc(catLabel(it.category))}, ${esc(it.severity || 'unrated')}) from <b>${esc(it.status)}</b> to <b>${esc(status)}</b>${input?.due_date ? `, due ${esc(input.due_date)}` : ''}? (At/above your ${esc(level)} line or overdue — needs your YES.)`,
      })
      return JSON.stringify(row
        ? { status: 'proposed', zone: 'yellow', sent_buttons: true, ref: it.ref, tell_user: `Proposed moving ${it.ref || it.title} to ${status} — buttons sent. Tell them to tap ✅.` }
        : { status: 'noop', message: 'Already proposed.' })
    }

    // ---- 🟡 close_finding — always ask ----
    if (name === 'close_finding') {
      const matches = matchRows(rows, String(input?.item || ''))
      if (matches.length === 0) return JSON.stringify({ status: 'not_found', message: `No open register item matching "${input?.item}".` })
      if (matches.length > 1) return JSON.stringify({ status: 'ambiguous', message: 'Which one?', candidates: candidates(matches) })
      const it = matches[0]
      const closeWord = CLOSE_WORD[it.category] || 'Closed'
      const payload = { op: 'update', record_id: it.id, ref: it.ref, status: closeWord,
        meta: input?.note ? { closure_note: String(input.note).slice(0, 300) } : undefined, idempotencyKey: randomUUID() }
      const row = await proposeAndNotify({
        agentKey: 'close-finding', idempotencyKey: payload.idempotencyKey, payload, chatId,
        text: `✅ Mark <b>${esc(it.ref || it.title)}</b> (${esc(catLabel(it.category))}, owner ${esc(it.owner || '—')}) as <b>${esc(closeWord)}</b>?${input?.note ? `\n<i>${esc(String(input.note).slice(0, 200))}</i>` : ''}\nClosing always needs your YES.`,
      })
      return JSON.stringify(row
        ? { status: 'proposed', zone: 'yellow', sent_buttons: true, ref: it.ref, tell_user: `Proposed closing ${it.ref || it.title} — buttons sent. Tell them to tap ✅.` }
        : { status: 'noop', message: 'Already proposed.' })
    }

    return JSON.stringify({ status: 'error', message: `unknown action "${name}"` })
  } catch (e: any) {
    console.error('[CGI] bot action failed:', e)
    return JSON.stringify({ status: 'error', message: 'that action failed — try again or do it in the app' })
  }
}
