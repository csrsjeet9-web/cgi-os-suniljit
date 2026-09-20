import { getRecords, todayISO, approvalLevel } from '@/lib/records'
import { webClearance } from '@/lib/clearance'
import { supabase, supabaseConfigured } from '@/lib/supabase'
import DashboardView from '@/app/_components/DashboardView'

// The dashboard's data is read here, on the server, with the viewer's clearance.
// Everything interactive — the filtering boxes, the drill-down heat map, the
// clickable bars — lives in DashboardView, which never touches the database.

export const dynamic = 'force-dynamic'

// Proposals still waiting on a human YES — the 🙋 number.
async function proposedCount(): Promise<number> {
  if (!supabaseConfigured) return 0
  const { count, error } = await supabase
    .from('agent_actions')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'proposed')
    .gt('expires_at', new Date().toISOString())
  if (error) return 0
  return count ?? 0
}

export default async function Dashboard() {
  const clearance = await webClearance()
  const [rows, pending] = await Promise.all([getRecords(clearance), proposedCount()])
  return (
    <DashboardView
      rows={rows}
      pending={pending}
      approvalLevel={approvalLevel()}
      today={todayISO()}
      restricted={clearance === 'restricted'}
    />
  )
}
