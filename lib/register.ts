// The register model — PURE. No database, no server-only imports, so both the
// server pages and the interactive client components can use it.
//
// lib/records.ts re-exports everything here, so `import { … } from '@/lib/records'`
// keeps working everywhere it already did.

export type Rec = {
  id: number
  ref: string | null
  title: string
  category: string
  status: string
  severity: string | null        // Critical | High | Medium | Low
  owner: string | null           // HOD / department
  due_date: string | null
  value: number | null
  classification: string         // internal | restricted
  standard: string | null
  notes: string | null
  meta: Record<string, any>
  created_at: string
  updated_at: string
}

// The 10 registers (one tab each) + 'task' for to-dos the bot or the mailbox adds.
export const CATEGORIES = [
  'risk', 'audit', 'issue', 'lesson', 'cmmi', 'training',
  'investigation', 'esg', 'obligation', 'gbpms', 'task',
] as const
export type Category = (typeof CATEGORIES)[number]

export const CATEGORY_INFO: Record<Category, { label: string; plural: string; href: string; emoji: string }> = {
  risk:          { label: 'Risk',            plural: 'Risks',                  href: '/risks',          emoji: '⚠️' },
  audit:         { label: 'Audit',           plural: 'Internal Audits',        href: '/audits',         emoji: '🔍' },
  issue:         { label: 'Issue',           plural: 'Issues',                 href: '/issues',         emoji: '🧯' },
  lesson:        { label: 'Lesson',          plural: 'Lessons Learned',        href: '/lessons',        emoji: '💡' },
  cmmi:          { label: 'CMMI area',       plural: 'CMMI',                   href: '/cmmi',           emoji: '📈' },
  training:      { label: 'Course',          plural: 'ISO Training',           href: '/training',       emoji: '🎓' },
  investigation: { label: 'Case',            plural: 'Investigations',         href: '/investigations', emoji: '🔒' },
  esg:           { label: 'ESG KPI',         plural: 'ESG',                    href: '/esg',            emoji: '🌱' },
  obligation:    { label: 'Obligation',      plural: 'Compliance Obligations', href: '/compliance',     emoji: '📜' },
  gbpms:         { label: 'GBPMS document',  plural: 'GBPMS Documents',        href: '/gbpms',          emoji: '📚' },
  task:          { label: 'Action',          plural: 'Actions',                href: '/',               emoji: '✅' },
}

export const catLabel = (c: string) => (CATEGORY_INFO as any)[c]?.label ?? c
export const catPlural = (c: string) => (CATEGORY_INFO as any)[c]?.plural ?? c

// ------------------------------------------------------------
// Status vocabulary. Each register uses its own words; these sets say which
// words mean "nothing more to do" so overdue / open maths is consistent.
// ------------------------------------------------------------
export const DONE_STATUSES = new Set([
  'closed', 'completed', 'resolved', 'done', 'implemented', 'current', 'green',
  'on track', 'within target', 'withdrawn', 'reversed', 'approved',
])
export const isDone = (r: Pick<Rec, 'status'>) => DONE_STATUSES.has((r.status || '').toLowerCase())
export const isOpen = (r: Pick<Rec, 'status'>) => !isDone(r)

// Today as YYYY-MM-DD (UTC; the register dates are day-granular).
export const todayISO = () => new Date().toISOString().slice(0, 10)

// Whole days from today to a date (negative = past).
export function daysUntil(date: string | null, today = todayISO()): number | null {
  if (!date) return null
  return Math.round((Date.parse(date) - Date.parse(today)) / 86_400_000)
}

// Overdue = still open AND (the register says Overdue OR the due date has passed).
export function isOverdue(r: Rec, today = todayISO()): boolean {
  if (isDone(r)) return false
  const s = (r.status || '').toLowerCase()
  if (s === 'overdue' || s === 'over target') return true
  return !!r.due_date && r.due_date < today
}

// Due within N days (and not yet overdue, not done).
export function isDueSoon(r: Rec, days = 7, today = todayISO()): boolean {
  if (isDone(r) || !r.due_date) return false
  const n = daysUntil(r.due_date, today)
  return n !== null && n >= 0 && n <= days
}

// ------------------------------------------------------------
// SEVERITY. Critical > High > Medium > Low.
// ------------------------------------------------------------
export const SEVERITIES = ['Critical', 'High', 'Medium', 'Low'] as const
const SEV_RANK: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 }
export const severityRank = (s: string | null | undefined) => SEV_RANK[(s || '').toLowerCase()] ?? 0

// The CSS pill class for any status / severity / RAG word (see globals.css).
export function pill(word: string | null | undefined): string {
  const w = (word || '').toLowerCase()
  if (['overdue', 'over target', 'red', 'critical', 'escalated', 'failed', 'rejected', 'expired', 'behind'].includes(w)) return 'bad'
  if (['high', 'amber', 'at risk', 'due soon', 'pending', 'proposed', 'draft', 'not started', 'under review', 'planned', 'captured'].includes(w)) return 'warn'
  if (['closed', 'completed', 'resolved', 'green', 'low', 'on track', 'current', 'implemented', 'approved', 'executed', 'ok', 'done', 'within target'].includes(w)) return 'good'
  if (['open', 'in progress', 'medium', 'fieldwork', 'follow-up', 'reviewed', 'shared', 'intake', 'investigation'].includes(w)) return 'info'
  if (['withdrawn', 'reversed', 'undone'].includes(w)) return 'muted'
  return 'muted'
}

// Read one field out of a record's meta bag, with a dash fallback for display.
export const m = (r: Rec, k: string) => {
  const v = r.meta?.[k]
  return v === undefined || v === null || v === '' ? '—' : String(v)
}

// ------------------------------------------------------------
// THE HEALTH STRIP — the whole-of-CGI picture the Dashboard + the brief show.
// ------------------------------------------------------------
export type Health = {
  overdue: number
  dueSoon: number
  openHigh: number       // open items at High or Critical
  open: number
  byCategory: Record<string, { open: number; overdue: number; dueSoon: number; high: number; total: number }>
}

export function getHealth(rows: Rec[], today = todayISO()): Health {
  const h: Health = { overdue: 0, dueSoon: 0, openHigh: 0, open: 0, byCategory: {} }
  for (const r of rows) {
    const b = (h.byCategory[r.category] ||= { open: 0, overdue: 0, dueSoon: 0, high: 0, total: 0 })
    b.total++
    if (isOpen(r)) { h.open++; b.open++ }
    if (isOverdue(r, today)) { h.overdue++; b.overdue++ }
    if (isDueSoon(r, 7, today)) { h.dueSoon++; b.dueSoon++ }
    if (isOpen(r) && severityRank(r.severity) >= 3) { h.openHigh++; b.high++ }
  }
  return h
}

// Risk heat-map cells: residual Likelihood × Impact counts (1..5 each).
export function riskHeatmap(rows: Rec[]): number[][] {
  const grid = Array.from({ length: 5 }, () => Array(5).fill(0))
  for (const r of rows) {
    if (r.category !== 'risk' || isDone(r)) continue
    const L = Number(r.meta?.['Residual L']), I = Number(r.meta?.['Residual I'])
    if (L >= 1 && L <= 5 && I >= 1 && I <= 5) grid[5 - L][I - 1]++
  }
  return grid
}

// Open items per HOD, most-loaded first (for the dashboard bars + the brief).
export function openByOwner(rows: Rec[], today = todayISO()): { owner: string; open: number; overdue: number }[] {
  const acc: Record<string, { open: number; overdue: number }> = {}
  for (const r of rows) {
    if (!r.owner || !isOpen(r)) continue
    const a = (acc[r.owner] ||= { open: 0, overdue: 0 })
    a.open++
    if (isOverdue(r, today)) a.overdue++
  }
  return Object.entries(acc).map(([owner, v]) => ({ owner, ...v })).sort((a, b) => b.overdue - a.overdue || b.open - a.open)
}

// ------------------------------------------------------------
// THE VIEW FILTER — one shared definition of "what am I looking at", used by the
// interactive table AND by the deep links the dashboard cards point at, so a card
// and the filter chip it lands on can never disagree.
// ------------------------------------------------------------
export const VIEWS = ['all', 'overdue', 'due', 'open', 'high', 'done'] as const
export type View = (typeof VIEWS)[number]

export const VIEW_LABEL: Record<View, string> = {
  all: 'All',
  overdue: 'Overdue',
  due: 'Due in 30 days',
  open: 'Open',
  high: 'High + Critical',
  done: 'Closed',
}

export function matchesView(r: Rec, view: View, today = todayISO()): boolean {
  switch (view) {
    case 'overdue': return isOverdue(r, today)
    case 'due': return isDueSoon(r, 30, today)
    case 'open': return isOpen(r)
    case 'high': return isOpen(r) && severityRank(r.severity) >= 3
    case 'done': return isDone(r)
    default: return true
  }
}

export const asView = (v: string | null | undefined): View =>
  (VIEWS as readonly string[]).includes(String(v)) ? (v as View) : 'all'
