// 👉 ISO awareness and auditor training. category='training'.
import { getRecords, todayISO } from '@/lib/records'
import { webClearance } from '@/lib/clearance'
import RegisterView, { type Col } from '@/app/_components/RegisterView'
import Stat from '@/app/_components/Stat'
import Bars from '@/app/_components/Bars'
import Empty from '@/app/_components/Empty'

export const dynamic = 'force-dynamic'

const cols: Col[] = [
  { key: 'title', label: 'Course' },
  { key: 'standard', label: 'Standard' },
  { key: 'Mandatory', label: 'Mandatory', pill: true },
  { key: 'Target Headcount', label: 'Target', align: 'right' },
  { key: 'Completed', label: 'Completed', align: 'right' },
  { key: 'value', label: 'Complete %', align: 'right' },
  { key: 'due', label: 'Next session' },
  { key: 'status', label: 'Status', pill: true },
]

export default async function Training() {
  const today = todayISO()
  const all = await getRecords(await webClearance())
  const rows = all.filter(r => r.category === 'training')
  const avg = rows.length ? Math.round(rows.reduce((s, r) => s + Number(r.value || 0), 0) / rows.length) : 0
  const mandatory = rows.filter(r => r.meta?.Mandatory === 'Yes')
  const behind = mandatory.filter(r => Number(r.value || 0) < 85)
  const gap = rows.reduce((s, r) => s + Math.max(0, Number(r.meta?.['Target Headcount'] || 0) - Number(r.meta?.Completed || 0)), 0)
  const sorted = [...rows].sort((a, b) => Number(a.value || 0) - Number(b.value || 0))

  return (
    <>
      <h1 className="ph">ISO Training 🎓</h1>
      <p className="cap">Awareness and internal-auditor courses — who still has to sit them.</p>

      <div className="grid">
        <Stat label="Courses" value={rows.length} />
        <Stat label="Average complete" value={`${avg}%`} tone={avg >= 90 ? 'good' : avg >= 75 ? 'warn' : 'bad'} />
        <Stat label="Mandatory" value={mandatory.length} />
        <Stat label="Mandatory behind 85%" value={behind.length} tone={behind.length ? 'warn' : 'good'} />
        <Stat label="Seats still to fill" value={gap} />
      </div>

      <p className="rowlabel">Completion by course</p>
      <Bars items={sorted.map(r => ({ label: r.title, value: Number(r.value || 0), suffix: '%' }))} max={100} />

      <p className="rowlabel">The register — least complete first</p>
      {all.length === 0 ? <Empty /> : <RegisterView rows={sorted} cols={cols} today={today} flagDates={false} />}
    </>
  )
}
