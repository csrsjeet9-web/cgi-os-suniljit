// 👉 Lessons learned from projects, and whether each has been folded back into
//    the GBPMS document set. category='lesson'.
import { getRecords, todayISO } from '@/lib/records'
import { webClearance } from '@/lib/clearance'
import RegisterTable, { type Col } from '@/app/_components/RegisterTable'
import Stat from '@/app/_components/Stat'
import Empty from '@/app/_components/Empty'

export const dynamic = 'force-dynamic'

const cols: Col[] = [
  { key: 'ref', label: 'LL ID' },
  { key: 'Project', label: 'Project' },
  { key: 'Category', label: 'Category' },
  { key: 'title', label: 'Lesson' },
  { key: 'Captured', label: 'Captured' },
  { key: 'status', label: 'Status', pill: true },
  { key: 'Applied to GBPMS', label: 'Applied to GBPMS', pill: true },
]

export default async function Lessons() {
  const today = todayISO()
  const all = await getRecords(await webClearance())
  const rows = all.filter(r => r.category === 'lesson')
  const applied = rows.filter(r => r.meta?.['Applied to GBPMS'] === 'Yes')
  const pending = rows.filter(r => r.meta?.['Applied to GBPMS'] === 'Pending')
  const notApplied = rows.filter(r => r.meta?.['Applied to GBPMS'] === 'No')
  const sorted = [...rows].sort((a, b) => String(b.meta?.Captured || '').localeCompare(String(a.meta?.Captured || '')))

  return (
    <>
      <h1 className="ph">Lessons Learned 💡</h1>
      <p className="cap">What projects taught us — and whether the process actually changed as a result.</p>

      <div className="grid">
        <Stat label="Lessons" value={rows.length} />
        <Stat label="Applied to GBPMS" value={applied.length} tone="good" />
        <Stat label="Pending" value={pending.length} tone={pending.length ? 'warn' : undefined} />
        <Stat label="Not applied" value={notApplied.length} tone={notApplied.length ? 'warn' : 'good'} />
      </div>

      <p className="rowlabel">The register — most recent first</p>
      {all.length === 0 ? <Empty /> : <RegisterTable rows={sorted} cols={cols} today={today} flagDates={false} />}
    </>
  )
}
