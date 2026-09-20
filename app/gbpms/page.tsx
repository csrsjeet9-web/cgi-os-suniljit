// 👉 GBPMS — the process management system's document register: policies,
//    processes, procedures and forms, and when each is next due for review.
//    category='gbpms'.
import { getRecords, isOverdue, isDueSoon, todayISO } from '@/lib/records'
import { webClearance } from '@/lib/clearance'
import RegisterView, { type Col } from '@/app/_components/RegisterView'
import Stat from '@/app/_components/Stat'
import Empty from '@/app/_components/Empty'

export const dynamic = 'force-dynamic'

const cols: Col[] = [
  { key: 'ref', label: 'Doc ID' },
  { key: 'title', label: 'Title' },
  { key: 'standard', label: 'Level' },
  { key: 'owner', label: 'Process owner (HOD)' },
  { key: 'Version', label: 'Ver', align: 'right' },
  { key: 'Status', label: 'Approval', pill: true },
  { key: 'BPMN Model', label: 'BPMN' },
  { key: 'Last Review', label: 'Last review' },
  { key: 'due', label: 'Next review' },
  { key: 'status', label: 'Review', pill: true },
]

const LEVELS = ['L1 Process Group', 'L2 Process', 'L3 Procedure', 'Policy', 'Form / Template']

export default async function Gbpms() {
  const today = todayISO()
  const all = await getRecords(await webClearance())
  const rows = all.filter(r => r.category === 'gbpms')
  const overdue = rows.filter(r => isOverdue(r, today))
  const soon = rows.filter(r => isDueSoon(r, 60, today))
  const underReview = rows.filter(r => r.meta?.Status === 'Under Review')
  const noBpmn = rows.filter(r => (r.meta?.['BPMN Model'] || '') === 'No')
  // Overdue reviews first, then soonest.
  const sorted = [...rows].sort(
    (a, b) => Number(isOverdue(b, today)) - Number(isOverdue(a, today)) || (a.due_date || '9999').localeCompare(b.due_date || '9999'),
  )

  return (
    <>
      <h1 className="ph">GBPMS Documents 📚</h1>
      <p className="cap">The controlled document set — what is approved, what is under review, and what is overdue for review.</p>

      <div className="grid">
        <Stat label="Documents" value={rows.length} />
        <Stat label="Review overdue" value={overdue.length} tone={overdue.length ? 'bad' : 'good'} />
        <Stat label="Review due in 60 days" value={soon.length} tone={soon.length ? 'warn' : undefined} />
        <Stat label="Under review" value={underReview.length} />
        <Stat label="No BPMN model" value={noBpmn.length} />
      </div>

      <p className="rowlabel">By level</p>
      <div className="grid">
        {LEVELS.map(l => (
          <Stat key={l} label={l} value={rows.filter(r => r.standard === l).length} />
        ))}
      </div>

      <p className="rowlabel">The register — overdue reviews first</p>
      {all.length === 0 ? <Empty /> : <RegisterView rows={sorted} cols={cols} today={today} />}
    </>
  )
}
