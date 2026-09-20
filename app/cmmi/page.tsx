// 👉 CMMI practice areas and how far each is implemented. category='cmmi'.
import { getRecords, todayISO } from '@/lib/records'
import { webClearance } from '@/lib/clearance'
import RegisterTable, { type Col } from '@/app/_components/RegisterTable'
import Stat from '@/app/_components/Stat'
import Bars from '@/app/_components/Bars'
import Empty from '@/app/_components/Empty'

export const dynamic = 'force-dynamic'

const cols: Col[] = [
  { key: 'title', label: 'Practice area' },
  { key: 'Category', label: 'Category' },
  { key: 'Target Level', label: 'Target' },
  { key: 'value', label: 'Implemented %', align: 'right' },
  { key: 'Evidence Collected %', label: 'Evidence %', align: 'right' },
  { key: 'owner', label: 'Owner (HOD)' },
  { key: 'status', label: 'Status', pill: true },
]

export default async function Cmmi() {
  const today = todayISO()
  const all = await getRecords(await webClearance())
  const rows = all.filter(r => r.category === 'cmmi')
  const avg = (k: (r: (typeof rows)[number]) => number) => (rows.length ? Math.round(rows.reduce((s, r) => s + k(r), 0) / rows.length) : 0)
  const impl = avg(r => Number(r.value || 0))
  const evid = avg(r => Number(r.meta?.['Evidence Collected %'] || 0))
  const behind = rows.filter(r => r.status === 'Behind')
  const atRisk = rows.filter(r => r.status === 'At Risk')
  const sorted = [...rows].sort((a, b) => Number(a.value || 0) - Number(b.value || 0))

  return (
    <>
      <h1 className="ph">CMMI 📈</h1>
      <p className="cap">Maturity Level 3 readiness — implementation against evidence collected.</p>

      <div className="grid">
        <Stat label="Practice areas" value={rows.length} />
        <Stat label="Average implemented" value={`${impl}%`} tone={impl >= 80 ? 'good' : impl >= 65 ? 'warn' : 'bad'} />
        <Stat label="Average evidence" value={`${evid}%`} tone={evid >= 80 ? 'good' : evid >= 65 ? 'warn' : 'bad'} sub={evid < impl ? `${impl - evid} points behind implementation` : undefined} />
        <Stat label="At risk" value={atRisk.length} tone={atRisk.length ? 'warn' : undefined} />
        <Stat label="Behind" value={behind.length} tone={behind.length ? 'bad' : 'good'} />
      </div>

      <p className="rowlabel">Implementation by practice area</p>
      <Bars items={sorted.map(r => ({ label: r.title, value: Number(r.value || 0), suffix: '%' }))} max={100} />

      <p className="rowlabel">The register — least implemented first</p>
      {all.length === 0 ? <Empty /> : <RegisterTable rows={sorted} cols={cols} today={today} flagDates={false} />}
    </>
  )
}
