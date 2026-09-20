// 👉 ESG KPIs by pillar, against the 2026 target. category='esg'.
import { getRecords, todayISO } from '@/lib/records'
import { webClearance } from '@/lib/clearance'
import RegisterView, { type Col } from '@/app/_components/RegisterView'
import Stat from '@/app/_components/Stat'
import Empty from '@/app/_components/Empty'

export const dynamic = 'force-dynamic'

const cols: Col[] = [
  { key: 'Pillar', label: 'Pillar' },
  { key: 'title', label: 'KPI' },
  { key: 'Unit', label: 'Unit' },
  { key: 'Baseline 2024', label: 'Baseline 2024', align: 'right' },
  { key: 'Target 2026', label: 'Target 2026', align: 'right' },
  { key: 'Actual YTD 2026', label: 'Actual YTD', align: 'right' },
  { key: 'value', label: 'Progress %', align: 'right' },
  { key: 'status', label: 'RAG', pill: true },
]

const PILLARS: Record<string, string> = { E: 'Environmental', S: 'Social', G: 'Governance' }

export default async function Esg() {
  const today = todayISO()
  const all = await getRecords(await webClearance())
  const rows = all.filter(r => r.category === 'esg')
  const n = (rag: string) => rows.filter(r => r.status === rag).length
  const avg = rows.length ? Math.round(rows.reduce((s, r) => s + Number(r.value || 0), 0) / rows.length) : 0
  const sorted = [...rows].sort((a, b) => String(a.meta?.Pillar).localeCompare(String(b.meta?.Pillar)) || Number(a.value || 0) - Number(b.value || 0))

  return (
    <>
      <h1 className="ph">ESG 🌱</h1>
      <p className="cap">Environmental, social and governance KPIs against the 2026 targets.</p>

      <div className="grid">
        <Stat label="KPIs" value={rows.length} />
        <Stat label="Average progress" value={`${avg}%`} tone={avg >= 75 ? 'good' : avg >= 50 ? 'warn' : 'bad'} />
        <Stat label="🔴 Red" value={n('Red')} tone={n('Red') ? 'bad' : 'good'} />
        <Stat label="🟠 Amber" value={n('Amber')} tone={n('Amber') ? 'warn' : undefined} />
        <Stat label="🟢 Green" value={n('Green')} tone="good" />
      </div>

      <p className="rowlabel">By pillar</p>
      <div className="grid">
        {Object.entries(PILLARS).map(([k, label]) => {
          const pill = rows.filter(r => r.meta?.Pillar === k)
          const p = pill.length ? Math.round(pill.reduce((s, r) => s + Number(r.value || 0), 0) / pill.length) : 0
          return <Stat key={k} label={label} value={`${p}%`} sub={`${pill.length} KPIs`} tone={p >= 75 ? 'good' : p >= 50 ? 'warn' : 'bad'} />
        })}
      </div>

      <p className="rowlabel">The KPIs</p>
      {all.length === 0 ? <Empty /> : <RegisterView rows={sorted} cols={cols} today={today} flagDates={false} />}
    </>
  )
}
