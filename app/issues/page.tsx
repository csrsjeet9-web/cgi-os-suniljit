// 👉 Project and company issues. category='issue'.
import { getRecords, isOpen, isOverdue, todayISO, severityRank } from '@/lib/records'
import { webClearance } from '@/lib/clearance'
import RegisterView, { type Col } from '@/app/_components/RegisterView'
import Stat from '@/app/_components/Stat'
import Empty from '@/app/_components/Empty'

export const dynamic = 'force-dynamic'

const cols: Col[] = [
  { key: 'ref', label: 'Issue ID' },
  { key: 'Type', label: 'Type' },
  { key: 'title', label: 'Title' },
  { key: 'Project / Department', label: 'Project / Dept' },
  { key: 'severity', label: 'Severity', pill: true },
  { key: 'owner', label: 'Owner (HOD)' },
  { key: 'Raised', label: 'Raised' },
  { key: 'due', label: 'Due' },
  { key: 'value', label: 'Days open', align: 'right' },
  { key: 'status', label: 'Status', pill: true },
]

export default async function Issues() {
  const today = todayISO()
  const all = await getRecords(await webClearance())
  const rows = all.filter(r => r.category === 'issue')
  const open = rows.filter(isOpen)
  const critical = open.filter(r => r.severity === 'Critical')
  const escalated = rows.filter(r => r.status === 'Escalated')
  const overdue = rows.filter(r => isOverdue(r, today))
  const sorted = [...rows].sort(
    (a, b) =>
      Number(isOpen(b)) - Number(isOpen(a)) ||
      severityRank(b.severity) - severityRank(a.severity) ||
      Number(b.value || 0) - Number(a.value || 0),
  )

  return (
    <>
      <h1 className="ph">Issues 🧯</h1>
      <p className="cap">Everything raised and not yet resolved — worst and oldest at the top.</p>

      <div className="grid">
        <Stat label="Issues" value={rows.length} />
        <Stat label="Open" value={open.length} />
        <Stat label="Critical open" value={critical.length} tone={critical.length ? 'bad' : 'good'} />
        <Stat label="Escalated" value={escalated.length} tone={escalated.length ? 'warn' : undefined} />
        <Stat label="Overdue" value={overdue.length} tone={overdue.length ? 'bad' : 'good'} />
      </div>

      <p className="rowlabel">The register</p>
      {all.length === 0 ? <Empty /> : <RegisterView rows={sorted} cols={cols} today={today} />}
    </>
  )
}
