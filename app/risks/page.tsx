// 👉 Enterprise risk register (ISO 31000 style). Reads the ONE `records` table,
//    filtered to category='risk'. Safe to edit the columns below.
import { getRecords, isOpen, isOverdue, riskHeatmap, todayISO } from '@/lib/records'
import { webClearance } from '@/lib/clearance'
import RegisterView, { type Col } from '@/app/_components/RegisterView'
import Stat from '@/app/_components/Stat'
import Heatmap from '@/app/_components/Heatmap'
import Empty from '@/app/_components/Empty'

export const dynamic = 'force-dynamic'

const cols: Col[] = [
  { key: 'ref', label: 'Risk ID' },
  { key: 'title', label: 'Risk' },
  { key: 'standard', label: 'Standard' },
  { key: 'Category', label: 'Category' },
  { key: 'owner', label: 'Owner (HOD)' },
  { key: 'Inherent Score', label: 'Inherent', align: 'right' },
  { key: 'value', label: 'Residual', align: 'right' },
  { key: 'severity', label: 'Level', pill: true },
  { key: 'Treatment', label: 'Treatment' },
  { key: 'due', label: 'Action due' },
  { key: 'status', label: 'Action', pill: true },
]

export default async function Risks() {
  const today = todayISO()
  const all = await getRecords(await webClearance())
  const rows = all.filter(r => r.category === 'risk')
  const open = rows.filter(isOpen)
  const high = open.filter(r => r.severity === 'High')
  const overdue = rows.filter(r => isOverdue(r, today))
  const unacknowledged = rows.filter(r => (r.meta?.['HOD Acknowledged'] || '') === 'No')
  const sorted = [...rows].sort((a, b) => Number(b.value || 0) - Number(a.value || 0))

  return (
    <>
      <h1 className="ph">Risks ⚠️</h1>
      <p className="cap">The enterprise risk register — residual score after treatment, and whose action is late.</p>

      <div className="grid">
        <Stat label="Risks" value={rows.length} />
        <Stat label="Open actions" value={open.length} />
        <Stat label="High residual" value={high.length} tone={high.length ? 'warn' : undefined} />
        <Stat label="Actions overdue" value={overdue.length} tone={overdue.length ? 'bad' : 'good'} />
        <Stat label="HOD not acknowledged" value={unacknowledged.length} tone={unacknowledged.length ? 'warn' : 'good'} />
      </div>

      <p className="rowlabel">Residual heat map — open risks</p>
      <Heatmap grid={riskHeatmap(rows)} />

      <p className="rowlabel">The register — highest residual first</p>
      {all.length === 0 ? <Empty /> : <RegisterView rows={sorted} cols={cols} today={today} />}
    </>
  )
}
