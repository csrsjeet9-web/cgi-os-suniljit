import 'server-only'
import {
  type Rec, todayISO, isOpen, isDone, isOverdue, isDueSoon, daysUntil, severityRank,
  getHealth, riskHeatmap, openByOwner, catPlural, CATEGORIES,
} from './records'

// 🔒 Don't edit — this keeps your robot safe.
// The Atlas bot's READ hands. Instead of dumping the whole register into the
// prompt, Claude picks ONE of these small tools, the server runs it against the
// rows THIS USER IS CLEARED TO SEE (restricted rows were filtered in the query),
// and the result comes back grounded. Every tool here is READ-ONLY.

export const BOT_TOOLS = [
  {
    name: 'get_overview',
    description:
      'The whole-of-CGI health strip: how many items are overdue, due in the next 7 days, open at High/Critical, ' +
      'and open in total — broken down by register (risks, obligations, audits, issues, GBPMS, training, CMMI, ESG…). ' +
      'Use for "how are we doing?", "status?", "what\'s the picture today?".',
    input_schema: { type: 'object' as const, properties: {} },
  },
  {
    name: 'list_overdue',
    description:
      'Everything past its due date (or flagged Overdue) and still open, worst first, with owner HOD and severity. ' +
      'Optionally limit to one register. Use for "what\'s overdue?", "overdue risk actions?", "late obligations?".',
    input_schema: {
      type: 'object' as const,
      properties: { category: { type: 'string', enum: [...CATEGORIES], description: 'Optional register.' } },
    },
  },
  {
    name: 'due_soon',
    description:
      'Open items due within N days (default 14), soonest first, with owner. Use for "what\'s due this week?", ' +
      '"what\'s coming up?", "obligations due this month?".',
    input_schema: {
      type: 'object' as const,
      properties: {
        days: { type: 'number', description: 'Window in days. Default 14.' },
        category: { type: 'string', enum: [...CATEGORIES], description: 'Optional register.' },
      },
    },
  },
  {
    name: 'list_risks',
    description:
      'Enterprise risks from the ERM register with residual score/level, standard, owner, treatment, action status and due. ' +
      'Filter by residual level, standard (ISO 9001 / ISO/IEC 27001 / ISO 37001 / ISO 45001 / ISO 14001 / CMMI / ESG / Legal Compliance) or owner HOD. ' +
      'Use for "top risks?", "high 27001 risks?", "risks owned by Finance?".',
    input_schema: {
      type: 'object' as const,
      properties: {
        level: { type: 'string', enum: ['High', 'Medium', 'Low'], description: 'Optional residual level.' },
        standard: { type: 'string', description: 'Optional standard substring, e.g. 27001.' },
        owner: { type: 'string', description: 'Optional owner HOD substring.' },
      },
    },
  },
  {
    name: 'risk_heatmap',
    description:
      'The 5×5 residual likelihood × impact heat-map counts for open risks, plus the top-scoring risks. ' +
      'Use for "show the heat map", "where do our risks cluster?".',
    input_schema: { type: 'object' as const, properties: {} },
  },
  {
    name: 'list_obligations',
    description:
      'Compliance obligations (Companies Act/SSM, PDPA/JPDP, MCMC, SST/RMCD, LHDN, DOSH, DOE, MACC, PERKESO, JTK, BOMBA, ' +
      'NACSA, ISO certification bodies…) with regulator, owner, due date, days to due and status. ' +
      'Use for "PDPA obligation?", "what does Legal owe?", "not started obligations?".',
    input_schema: {
      type: 'object' as const,
      properties: {
        status: { type: 'string', description: 'Optional: Not Started | In Progress | On Track | Completed.' },
        query: { type: 'string', description: 'Optional search word (regulator, act, owner, title).' },
      },
    },
  },
  {
    name: 'audit_status',
    description:
      'Internal audit programme: each audit\'s area, standard, auditee, date, status, Major/Minor NCs, OFIs, NCs open/closed; ' +
      'plus totals. Use for "how many NCs are open?", "audit status?", "which audits are planned?".',
    input_schema: { type: 'object' as const, properties: {} },
  },
  {
    name: 'list_issues',
    description:
      'Project and company issues with severity, owner, raised/due dates, status and days open. Filter by severity or status. ' +
      'Use for "critical issues?", "escalated issues?", "what\'s open for Procurement?".',
    input_schema: {
      type: 'object' as const,
      properties: {
        severity: { type: 'string', enum: ['Critical', 'High', 'Medium', 'Low'] },
        status: { type: 'string', description: 'Optional: Open | In Progress | Escalated | Overdue | Resolved.' },
        owner: { type: 'string', description: 'Optional owner HOD substring.' },
      },
    },
  },
  {
    name: 'gbpms_reviews',
    description:
      'GBPMS (process management system) documents: level, owner, version, approval status, BPMN model, last/next review and ' +
      'review status. Use for "which procedures are overdue for review?", "documents under review?", "next reviews?".',
    input_schema: {
      type: 'object' as const,
      properties: { only: { type: 'string', enum: ['overdue', 'due_soon', 'under_review', 'all'], description: 'Default overdue.' } },
    },
  },
  {
    name: 'training_status',
    description:
      'ISO training courses: target headcount, completed, completion %, next session and whether mandatory. ' +
      'Use for "training completion?", "which mandatory courses are behind?".',
    input_schema: { type: 'object' as const, properties: {} },
  },
  {
    name: 'cmmi_status',
    description:
      'CMMI practice areas: category, target level, implementation %, evidence %, status and owner. ' +
      'Use for "how is CMMI going?", "which practice areas are behind?".',
    input_schema: { type: 'object' as const, properties: {} },
  },
  {
    name: 'esg_status',
    description:
      'ESG KPIs by pillar (E/S/G) with unit, 2024 baseline, 2026 target, YTD actual, progress % and RAG. ' +
      'Use for "ESG status?", "which KPIs are red?", "Scope 2 emissions?".',
    input_schema: { type: 'object' as const, properties: {} },
  },
  {
    name: 'lessons',
    description:
      'Lessons learned from projects: category, lesson, captured date, status and whether applied to GBPMS. ' +
      'Use for "lessons not yet applied?", "what did we learn on the SOC project?".',
    input_schema: {
      type: 'object' as const,
      properties: { query: { type: 'string', description: 'Optional search word (project, category, text).' } },
    },
  },
  {
    name: 'investigations',
    description:
      'RESTRICTED. Investigation cases: allegation type, source, opened, stage, priority, days open, target and status. ' +
      'Only returns data for cleared users — otherwise it says so. Use for "open investigations?", "cases over target?".',
    input_schema: { type: 'object' as const, properties: {} },
  },
  {
    name: 'by_owner',
    description:
      'Open and overdue counts per HOD / department, most-loaded first, and the open items for one HOD if named. ' +
      'Use for "who has the most overdue?", "what does Information Security own?".',
    input_schema: {
      type: 'object' as const,
      properties: { owner: { type: 'string', description: 'Optional HOD name substring for the item list.' } },
    },
  },
  {
    name: 'attention_today',
    description:
      'The daily triage in one call: overdue items, due in 7 days, open Critical/High items, and a note about proposals ' +
      'waiting for a YES. Use for "what needs my attention?", "what should I look at today?".',
    input_schema: { type: 'object' as const, properties: {} },
  },
  {
    name: 'draft_reminder',
    description:
      'Pull one register item\'s context (ref, title, owner HOD, due, status, severity) so you can COMPOSE a short, ' +
      'courteous reminder for the OWNER to copy and send themselves. Use for "draft a reminder for CO-002", ' +
      '"write PMO a nudge about ERM-9001-2026-001". You draft the text — you NEVER send it and never claim it was sent.',
    input_schema: {
      type: 'object' as const,
      properties: { ref: { type: 'string', description: 'The register id or a title fragment.' } },
      required: ['ref'],
    },
  },
  {
    name: 'search_records',
    description:
      'Find register items whose ref, title, owner, standard or details match a search word. Optionally one register. ' +
      'Use when the question names a specific item, act, HOD or standard and no other tool fits.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'The word, id or name to look for.' },
        category: { type: 'string', enum: [...CATEGORIES], description: 'Optional register.' },
      },
      required: ['query'],
    },
  },
  {
    name: 'escalate',
    description:
      'Flag the human owner and stop. Use this — instead of guessing — when the user is frustrated, asks for a human, ' +
      'wants something these tools cannot do (send to a regulator, delete, change a policy), or you have tried twice and failed. ' +
      'Never invent a compliance answer you cannot ground in a tool result.',
    input_schema: {
      type: 'object' as const,
      properties: { reason: { type: 'string', description: 'One short line on why you are escalating.' } },
      required: ['reason'],
    },
  },
]

// A compact projection of one row for the model. Includes the workbook columns
// (meta) so the sheet's own fields are available without a second call.
function slim(r: Rec, today: string) {
  const dd = daysUntil(r.due_date, today)
  return {
    ref: r.ref, title: r.title, register: r.category, status: r.status, severity: r.severity,
    owner: r.owner, due: r.due_date, days_to_due: dd, overdue: isOverdue(r, today),
    value: r.value, standard: r.standard, ...r.meta,
  }
}

const inc = (hay: string, q: string) => hay.toLowerCase().includes(q.toLowerCase().trim())

// ------------------------------------------------------------
// runBotTool() — execute ONE tool against the already-fetched (clearance-filtered)
// rows. Returns a compact JSON string the caller wraps in <<<DATA…DATA>>>.
// `escalate` returns a sentinel the loop watches for. Never throws.
// ------------------------------------------------------------
export function runBotTool(name: string, input: any, rows: Rec[], opts: { clearance: 'internal' | 'restricted' }): string {
  const today = todayISO()
  try {
    if (name === 'escalate') {
      return JSON.stringify({ escalated: true, reason: String(input?.reason || 'flagged') })
    }

    if (name === 'get_overview') {
      const h = getHealth(rows, today)
      const by = Object.fromEntries(Object.entries(h.byCategory).map(([k, v]) => [catPlural(k), v]))
      return JSON.stringify({ today, overdue: h.overdue, due_7_days: h.dueSoon, open_high_or_critical: h.openHigh, open: h.open, by_register: by })
    }

    if (name === 'list_overdue') {
      const cat = input?.category
      const out = rows
        .filter(r => (!cat || r.category === cat) && isOverdue(r, today))
        .sort((a, b) => severityRank(b.severity) - severityRank(a.severity) || (a.due_date || '').localeCompare(b.due_date || ''))
        .slice(0, 30).map(r => slim(r, today))
      return JSON.stringify({ count: out.length, overdue: out })
    }

    if (name === 'due_soon') {
      const days = Number.isFinite(Number(input?.days)) && Number(input?.days) > 0 ? Number(input.days) : 14
      const cat = input?.category
      const out = rows
        .filter(r => (!cat || r.category === cat) && isDueSoon(r, days, today))
        .sort((a, b) => (a.due_date || '').localeCompare(b.due_date || ''))
        .slice(0, 30).map(r => slim(r, today))
      return JSON.stringify({ window_days: days, count: out.length, due: out })
    }

    if (name === 'list_risks') {
      let pick = rows.filter(r => r.category === 'risk')
      if (input?.level) pick = pick.filter(r => (r.severity || '').toLowerCase() === String(input.level).toLowerCase())
      if (input?.standard) pick = pick.filter(r => inc(r.standard || '', input.standard))
      if (input?.owner) pick = pick.filter(r => inc(r.owner || '', input.owner))
      pick.sort((a, b) => Number(b.value || 0) - Number(a.value || 0))
      return JSON.stringify({ count: pick.length, risks: pick.slice(0, 25).map(r => slim(r, today)) })
    }

    if (name === 'risk_heatmap') {
      const grid = riskHeatmap(rows)
      const top = rows.filter(r => r.category === 'risk' && isOpen(r))
        .sort((a, b) => Number(b.value || 0) - Number(a.value || 0)).slice(0, 5).map(r => slim(r, today))
      return JSON.stringify({ note: 'rows = likelihood 5 (top) to 1 (bottom); columns = impact 1..5; cells = open risk count', grid, top_risks: top })
    }

    if (name === 'list_obligations') {
      let pick = rows.filter(r => r.category === 'obligation')
      if (input?.status) pick = pick.filter(r => (r.status || '').toLowerCase() === String(input.status).toLowerCase())
      if (input?.query) pick = pick.filter(r => inc(`${r.ref} ${r.title} ${r.standard} ${r.owner}`, input.query))
      pick.sort((a, b) => (a.due_date || '9999').localeCompare(b.due_date || '9999'))
      return JSON.stringify({ count: pick.length, obligations: pick.slice(0, 25).map(r => slim(r, today)) })
    }

    if (name === 'audit_status') {
      const audits = rows.filter(r => r.category === 'audit')
      const n = (k: string) => audits.reduce((s, r) => s + Number(r.meta?.[k] || 0), 0)
      return JSON.stringify({
        totals: { audits: audits.length, major_nc: n('Major NC'), minor_nc: n('Minor NC'), ofi: n('OFI'), ncs_open: n('NCs Open'), ncs_closed: n('NCs Closed') },
        by_status: Object.fromEntries(['Planned', 'Fieldwork', 'Follow-up', 'Closed'].map(s => [s, audits.filter(r => r.status === s).length])),
        audits: audits.map(r => slim(r, today)),
      })
    }

    if (name === 'list_issues') {
      let pick = rows.filter(r => r.category === 'issue')
      if (input?.severity) pick = pick.filter(r => (r.severity || '').toLowerCase() === String(input.severity).toLowerCase())
      if (input?.status) pick = pick.filter(r => (r.status || '').toLowerCase() === String(input.status).toLowerCase())
      if (input?.owner) pick = pick.filter(r => inc(r.owner || '', input.owner))
      pick.sort((a, b) => severityRank(b.severity) - severityRank(a.severity) || Number(b.value || 0) - Number(a.value || 0))
      return JSON.stringify({ count: pick.length, issues: pick.slice(0, 25).map(r => slim(r, today)) })
    }

    if (name === 'gbpms_reviews') {
      const only = String(input?.only || 'overdue')
      const docs = rows.filter(r => r.category === 'gbpms')
      const pick = only === 'all' ? docs
        : only === 'under_review' ? docs.filter(r => (r.meta?.Status || '') === 'Under Review')
        : only === 'due_soon' ? docs.filter(r => isDueSoon(r, 60, today) || (r.status || '').toLowerCase() === 'due soon')
        : docs.filter(r => isOverdue(r, today))
      pick.sort((a, b) => (a.due_date || '9999').localeCompare(b.due_date || '9999'))
      return JSON.stringify({ filter: only, count: pick.length, total_documents: docs.length, documents: pick.slice(0, 30).map(r => slim(r, today)) })
    }

    if (name === 'training_status') {
      const pick = rows.filter(r => r.category === 'training').sort((a, b) => Number(a.value || 0) - Number(b.value || 0))
      const avg = pick.length ? Math.round(pick.reduce((s, r) => s + Number(r.value || 0), 0) / pick.length) : 0
      return JSON.stringify({ average_completion_pct: avg, courses: pick.map(r => slim(r, today)) })
    }

    if (name === 'cmmi_status') {
      const pick = rows.filter(r => r.category === 'cmmi').sort((a, b) => Number(a.value || 0) - Number(b.value || 0))
      const avg = pick.length ? Math.round(pick.reduce((s, r) => s + Number(r.value || 0), 0) / pick.length) : 0
      return JSON.stringify({
        average_implementation_pct: avg,
        by_status: Object.fromEntries(['On Track', 'At Risk', 'Behind'].map(s => [s, pick.filter(r => r.status === s).length])),
        practice_areas: pick.map(r => slim(r, today)),
      })
    }

    if (name === 'esg_status') {
      const pick = rows.filter(r => r.category === 'esg')
      return JSON.stringify({
        rag: Object.fromEntries(['Red', 'Amber', 'Green'].map(s => [s, pick.filter(r => r.status === s).length])),
        kpis: pick.map(r => slim(r, today)),
      })
    }

    if (name === 'lessons') {
      let pick = rows.filter(r => r.category === 'lesson')
      if (input?.query) pick = pick.filter(r => inc(`${r.title} ${JSON.stringify(r.meta)}`, input.query))
      return JSON.stringify({
        count: pick.length,
        not_applied_to_gbpms: pick.filter(r => (r.meta?.['Applied to GBPMS'] || '') !== 'Yes').length,
        lessons: pick.slice(0, 25).map(r => slim(r, today)),
      })
    }

    if (name === 'investigations') {
      if (opts.clearance !== 'restricted') {
        return JSON.stringify({ restricted: true, note: 'This user is not cleared for the Investigations register. Say so plainly; do not guess at case details.' })
      }
      const pick = rows.filter(r => r.category === 'investigation')
      return JSON.stringify({
        count: pick.length,
        open: pick.filter(isOpen).length,
        over_target: pick.filter(r => (r.status || '').toLowerCase() === 'over target').length,
        cases: pick.map(r => slim(r, today)),
      })
    }

    if (name === 'by_owner') {
      const table = openByOwner(rows, today)
      const who = String(input?.owner || '').trim()
      const items = who
        ? rows.filter(r => r.owner && inc(r.owner, who) && isOpen(r))
            .sort((a, b) => Number(isOverdue(b, today)) - Number(isOverdue(a, today)) || severityRank(b.severity) - severityRank(a.severity))
            .slice(0, 25).map(r => slim(r, today))
        : undefined
      return JSON.stringify({ by_owner: table, ...(items ? { owner: who, items } : {}) })
    }

    if (name === 'attention_today') {
      const overdue = rows.filter(r => isOverdue(r, today))
        .sort((a, b) => severityRank(b.severity) - severityRank(a.severity)).slice(0, 10).map(r => slim(r, today))
      const soon = rows.filter(r => isDueSoon(r, 7, today))
        .sort((a, b) => (a.due_date || '').localeCompare(b.due_date || '')).slice(0, 10).map(r => slim(r, today))
      const high = rows.filter(r => isOpen(r) && severityRank(r.severity) >= 3 && !isOverdue(r, today)).slice(0, 10).map(r => slim(r, today))
      return JSON.stringify({
        overdue, due_7_days: soon, open_high_or_critical: high,
        note: 'Proposals waiting for a YES are in the Approvals tab and the 08:30 brief.',
        counts: { overdue: overdue.length, due_7_days: soon.length, open_high: high.length },
      })
    }

    if (name === 'draft_reminder') {
      const q = String(input?.ref || '').trim()
      const item = rows.find(r => inc(`${r.ref || ''}`, q)) || rows.find(r => inc(r.title, q))
      if (!item) return JSON.stringify({ found: false, note: `No register item matching "${q}". Ask the owner which one they mean.` })
      return JSON.stringify({
        found: true, ...slim(item, today),
        instruction:
          'Compose a SHORT, courteous reminder (3-4 sentences) addressed to the owner HOD, for the OWNER to copy and send. ' +
          'Name the ref, what is due and by when, and ask for a status + revised date. No placeholders. ' +
          'NEVER say it has been sent — end making clear it is a draft for them to send.',
      })
    }

    if (name === 'search_records') {
      const q = String(input?.query || '').trim()
      const cat = input?.category
      const hits = rows
        .filter(r => !cat || r.category === cat)
        .filter(r => !q || inc(`${r.ref} ${r.title} ${r.owner} ${r.standard} ${r.status} ${JSON.stringify(r.meta)}`, q))
        .slice(0, 25).map(r => slim(r, today))
      return JSON.stringify({ count: hits.length, results: hits })
    }

    return JSON.stringify({ error: `unknown tool "${name}"` })
  } catch (e: any) {
    console.error('[CGI] bot tool failed:', e)
    return JSON.stringify({ error: 'that lookup failed — try rephrasing' })
  }
}

export { isDone }
