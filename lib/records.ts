import { supabase, supabaseConfigured } from './supabase'
import type { Clearance } from './clearance'
import { type Rec, SEVERITIES, severityRank, DONE_STATUSES, todayISO } from './register'

// The database side of the register. Everything PURE (the model, the date maths,
// the severity ladder, the health aggregations, the view filter) lives in
// lib/register.ts so client components can use it too — and is re-exported here,
// so `import { … } from '@/lib/records'` keeps working exactly as before.
export * from './register'

// ------------------------------------------------------------
// THE AUTONOMY DIAL. APPROVAL_LEVEL (default High) is the line: anything AT or
// ABOVE it — or anything overdue — asks first (🟡). Below it the robot just does
// it and tells you (🟢), with /undo. Server-only: it reads the environment.
// ------------------------------------------------------------
export function approvalLevel(): string {
  const v = (process.env.APPROVAL_LEVEL || 'High').trim()
  return SEVERITIES.find(s => s.toLowerCase() === v.toLowerCase()) ?? 'High'
}

// true = 🟡 ask first; false = 🟢 autopilot.
export function needsApproval(r: Pick<Rec, 'severity' | 'status' | 'due_date'>, today = todayISO()): boolean {
  if (severityRank(r.severity) >= severityRank(approvalLevel())) return true
  const overdue =
    (r.status || '').toLowerCase() === 'overdue' ||
    (!!r.due_date && r.due_date < today && !DONE_STATUSES.has((r.status || '').toLowerCase()))
  return overdue
}

// ------------------------------------------------------------
// getRecords(clearance) — the ONE read. Restricted rows (Investigations) are
// filtered HERE, in the query, before they reach any page, tool or model. A caller
// with 'internal' clearance never even receives them.
// ------------------------------------------------------------
export async function getRecords(clearance: Clearance = 'internal'): Promise<Rec[]> {
  if (!supabaseConfigured) return []
  let q = supabase.from('records').select('*').order('category').order('ref')
  if (clearance !== 'restricted') q = q.eq('classification', 'internal')
  const { data, error } = await q
  if (error) console.warn('[CGI] could not read records:', error.message)
  return (data ?? []).map(r => ({ ...r, meta: r.meta ?? {}, value: r.value == null ? null : Number(r.value) })) as Rec[]
}

// How many proposals are waiting for a YES right now (status 'proposed', unexpired).
export async function getPendingCount(): Promise<number> {
  if (!supabaseConfigured) return 0
  const { count, error } = await supabase
    .from('agent_actions')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'proposed')
    .gt('expires_at', new Date().toISOString())
  if (error) return 0
  return count ?? 0
}
