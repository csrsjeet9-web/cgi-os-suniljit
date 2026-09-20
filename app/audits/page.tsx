// 👉 Internal audit programme — one row per audit, with its nonconformity counts.
//    category='audit'.
import { getRecords, todayISO } from '@/lib/records'
import { webClearance } from '@/lib/clearance'
import RegisterTable, { type Col } from '@/app/_components/RegisterTable'
import Stat from '@/app/_components/Stat'
import Empty from '@/app/_components/Empty'

export const dynamic = 'force-dynamic'

const cols: Col[] = [
  { key: 'ref', label: 'Audit ID' },
  { key: 'title', label: 'Area' },
  { key: 'standard', label: 'Standard' },
  { key: 'owner', label: 'Auditee (HOD)' },
  { key: 'due', label: 'Audit date' },
  { key: 'Major NC', label: 'Major', align: 'right' },
  { key: 'Minor NC', label: 'Minor', align: 'right' },
  { key: 'OFI', label: 'OFI', align: 'right' },
  { key: 'NCs Closed', label: 'NC closed', align: 'right' },
  { key: 'value', label: 'NC open', align: 'right' },
  { key: 'status', label: 'Status', pill: true },
]

export default async function Audits() {
  const today = todayISO()
  const all = await getRecords(await webClearance())
  const rows = all.filter(r => r.category === 'audit')
  const sum = (k: string) => rows.reduce((s, r) => s + Number(r.meta?.[k] || 0), 0)
  const open = sum('NCs Open')
  const closed = sum('NCs Closed')
  const closure = open + closed ? Math.round((closed / (open + closed)) * 100) : 0
  // A closed audit that still has NCs open is what the NC Tracker robot watches for.
  const inconsistent = rows.filter(r => r.status === 'Closed' && Number(r.value || 0) > 0)
  const sorted = [...rows].sort((a, b) => (b.due_date || '').localeCompare(a.due_date || ''))

  return (
    <>
      <h1 className="ph">Internal Audit 🔍</h1>
      <p className="cap">The audit programme and its nonconformities — how many are still open, and where.</p>

      <div className="grid">
        <Stat label="Audits" value={rows.length} />
        <Stat label="Major NC" value={sum('Major NC')} tone={sum('Major NC') ? 'bad' : 'good'} />
        <Stat label="Minor NC" value={sum('Minor NC')} tone={sum('Minor NC') ? 'warn' : undefined} />
        <Stat label="OFI" value={sum('OFI')} />
        <Stat label="NC open" value={open} tone={open ? 'warn' : 'good'} sub={`${closure}% closure rate`} />
      </div>

      {inconsistent.length ? (
        <div className="banner warn">
          🔍 {inconsistent.length} audit{inconsistent.length > 1 ? 's are' : ' is'} marked <b>Closed</b> but still
          {inconsistent.length > 1 ? ' have' : ' has'} NCs open ({inconsistent.map(r => r.ref).join(', ')}).
          The <b>Audit NC Tracker</b> proposes moving these to Follow-up — approve it on the Approvals tab.
        </div>
      ) : null}

      <p className="rowlabel">The programme — most recent first</p>
      {all.length === 0 ? <Empty /> : <RegisterTable rows={sorted} cols={cols} today={today} flagDates={false} />}
    </>
  )
}
