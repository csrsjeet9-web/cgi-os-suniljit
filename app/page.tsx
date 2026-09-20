import Link from 'next/link'
import {
  getRecords, getHealth, riskHeatmap, openByOwner, isOverdue, isDueSoon, isOpen,
  severityRank, todayISO, approvalLevel, CATEGORY_INFO, catPlural, type Rec,
} from '@/lib/records'
import { webClearance } from '@/lib/clearance'
import { supabase, supabaseConfigured } from '@/lib/supabase'
import Stat from '@/app/_components/Stat'
import Bars from '@/app/_components/Bars'
import Heatmap from '@/app/_components/Heatmap'

export const dynamic = 'force-dynamic'

// Count of proposals still waiting on a human YES — the 🙋 number.
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

// One line in the "needs you" lists. Clicking it opens that register with the
// matching filter chip already selected, so the item is on screen when you land.
function Item({ r, today, view }: { r: Rec; today: string; view: string }) {
  const info = (CATEGORY_INFO as any)[r.category]
  const href = `${info?.href || '/'}${view === 'all' ? '' : `?view=${view}`}`
  return (
    <Link href={href} className="item">
      <span className="it-ref">{r.ref || '—'}</span>
      <span className="it-title">{r.title}</span>
      <span className={`pill ${r.severity === 'Critical' || r.severity === 'High' ? 'bad' : 'warn'}`}>{r.severity || 'unrated'}</span>
      <span className="it-meta">{r.owner || '—'}{r.due_date ? ` · due ${r.due_date}` : ''}</span>
    </Link>
  )
}

export default async function Dashboard() {
  const today = todayISO()
  const clearance = await webClearance()
  const [rows, waiting] = await Promise.all([getRecords(clearance), proposedCount()])
  const h = getHealth(rows, today)

  const worst = (list: Rec[]) =>
    [...list].sort((a, b) => severityRank(b.severity) - severityRank(a.severity) || (a.due_date || '9999').localeCompare(b.due_date || '9999'))

  const overdue = worst(rows.filter(r => isOverdue(r, today)))
  const soon = [...rows.filter(r => isDueSoon(r, 7, today))].sort((a, b) => (a.due_date || '').localeCompare(b.due_date || ''))
  const high = worst(rows.filter(r => isOpen(r) && severityRank(r.severity) >= 3 && !isOverdue(r, today)))

  const owners = openByOwner(rows, today).slice(0, 8)
  const registers = Object.entries(h.byCategory)
    .filter(([c]) => c !== 'task')
    .sort((a, b) => b[1].overdue - a[1].overdue || b[1].open - a[1].open)

  return (
    <>
      <h1 className="ph">Dashboard</h1>
      <p className="cap">The whole of CGI in one screen — what is late, what is coming, and what needs your YES.</p>

      {/* Row 1 — the health strip */}
      <div className="grid">
        <Stat label="Overdue" value={h.overdue} tone={h.overdue ? 'bad' : 'good'} />
        <Stat label="Due in 7 days" value={h.dueSoon} tone={h.dueSoon ? 'warn' : undefined} />
        <Stat label="Open High / Critical" value={h.openHigh} tone={h.openHigh ? 'warn' : 'good'} />
        <Stat label="Open items" value={h.open} />
        <Stat label="🙋 Needs your YES" value={waiting} tone={waiting ? 'warn' : undefined} href="/approvals" sub={`dial: ${approvalLevel()}`} />
      </div>

      {/* Row 2 — the three lists that matter this morning */}
      <p className="rowlabel">Overdue{overdue.length > 6 ? ` — worst 6 of ${overdue.length}` : ''}</p>
      {overdue.length ? (
        <div className="items">{overdue.slice(0, 6).map(r => <Item key={r.id} r={r} today={today} view="overdue" />)}</div>
      ) : (
        <div className="empty">Nothing is overdue. 🎉</div>
      )}

      <p className="rowlabel">Due this week{soon.length > 5 ? ` — next 5 of ${soon.length}` : ''}</p>
      {soon.length ? (
        <div className="items">{soon.slice(0, 5).map(r => <Item key={r.id} r={r} today={today} view="due" />)}</div>
      ) : (
        <div className="empty">Nothing falls due in the next 7 days.</div>
      )}

      <p className="rowlabel">Open at High or Critical{high.length > 5 ? ` — top 5 of ${high.length}` : ''}</p>
      {high.length ? (
        <div className="items">{high.slice(0, 5).map(r => <Item key={r.id} r={r} today={today} view="high" />)}</div>
      ) : (
        <div className="empty">Nothing open above your line.</div>
      )}

      {/* Row 3 — the pictures */}
      <p className="rowlabel">Residual risk heat map</p>
      <Heatmap grid={riskHeatmap(rows)} />

      <p className="rowlabel">Open items by HOD</p>
      <Bars items={owners.map(o => ({ label: o.owner, value: o.open, sub: o.overdue ? `(${o.overdue} overdue)` : undefined, tone: o.overdue ? 'bad' : 'good' }))} />

      {/* Row 4 — every register at a glance */}
      <p className="rowlabel">The registers</p>
      <p className="chart-note" style={{ margin: '0 0 10px' }}>Every number below opens that register, already filtered.</p>
      <table className="tbl">
        <thead>
          <tr><th>Register</th><th className="r">Items</th><th className="r">Open</th><th className="r">Overdue</th><th className="r">Due 7d</th><th className="r">High+</th></tr>
        </thead>
        <tbody>
          {registers.map(([cat, b]) => {
            const info = (CATEGORY_INFO as any)[cat]
            const base = info?.href || '/'
            return (
              <tr key={cat}>
                <td data-label="Register"><Link href={base}>{info?.emoji} {catPlural(cat)}</Link></td>
                <td data-label="Items" className="r"><Link href={base}>{b.total}</Link></td>
                <td data-label="Open" className="r"><Link href={`${base}?view=open`}>{b.open}</Link></td>
                <td data-label="Overdue" className="r">
                  {b.overdue ? <Link href={`${base}?view=overdue`}><span className="pill bad">{b.overdue}</span></Link> : '—'}
                </td>
                <td data-label="Due 7d" className="r">
                  {b.dueSoon ? <Link href={`${base}?view=due`}><span className="pill warn">{b.dueSoon}</span></Link> : '—'}
                </td>
                <td data-label="High+" className="r">
                  {b.high ? <Link href={`${base}?view=high`}>{b.high}</Link> : '—'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {clearance !== 'restricted' ? (
        <p className="chart-note">🔒 Investigations are not included in these numbers on this device. They need the second passcode.</p>
      ) : null}
    </>
  )
}
