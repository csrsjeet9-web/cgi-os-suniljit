// 👉 Compliance obligation register — statutory and certification duties, who owns
//    each one and when it falls due. category='obligation'.
import { getRecords, isOverdue, isDueSoon, isDone, todayISO } from '@/lib/records'
import { webClearance } from '@/lib/clearance'
import RegisterTable, { type Col } from '@/app/_components/RegisterTable'
import Stat from '@/app/_components/Stat'
import Empty from '@/app/_components/Empty'

export const dynamic = 'force-dynamic'

const cols: Col[] = [
  { key: 'ref', label: 'ID' },
  { key: 'title', label: 'Obligation' },
  { key: 'standard', label: 'Regulator / Source' },
  { key: 'owner', label: 'Owner (HOD)' },
  { key: 'due', label: 'Due' },
  { key: 'value', label: 'Days to due', align: 'right' },
  { key: 'status', label: 'Status', pill: true },
]

export default async function Compliance() {
  const today = todayISO()
  const all = await getRecords(await webClearance())
  const rows = all.filter(r => r.category === 'obligation')
  const overdue = rows.filter(r => isOverdue(r, today))
  const soon = rows.filter(r => isDueSoon(r, 30, today))
  const notStarted = rows.filter(r => r.status === 'Not Started')
  const done = rows.filter(isDone)
  const sorted = [...rows].sort((a, b) => (a.due_date || '9999').localeCompare(b.due_date || '9999'))

  return (
    <>
      <h1 className="ph">Compliance 📜</h1>
      <p className="cap">Statutory, regulatory and certification obligations — soonest due first.</p>

      <div className="grid">
        <Stat label="Obligations" value={rows.length} />
        <Stat label="Overdue" value={overdue.length} tone={overdue.length ? 'bad' : 'good'} />
        <Stat label="Due in 30 days" value={soon.length} tone={soon.length ? 'warn' : undefined} />
        <Stat label="Not started" value={notStarted.length} tone={notStarted.length ? 'warn' : undefined} />
        <Stat label="Completed" value={done.length} tone="good" />
      </div>

      <p className="rowlabel">The register</p>
      {all.length === 0 ? <Empty /> : <RegisterTable rows={sorted} cols={cols} today={today} />}

      <p className="chart-note">
        📡 The Regulatory Watch proposes new obligations here every Monday, each with its source.
        Nothing is added until you approve it on the Approvals tab.
      </p>
    </>
  )
}
