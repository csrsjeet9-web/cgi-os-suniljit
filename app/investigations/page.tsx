// 🔒 RESTRICTED register. Every row here is classified 'restricted', so
//    getRecords('internal') never returns one — the filter is in the SQL query,
//    not in this page. Without the second passcode you see the locked card below
//    and no case data of any kind.
import Link from 'next/link'
import { getRecords, isOpen, todayISO, severityRank } from '@/lib/records'
import { webClearance, restrictedPasscode } from '@/lib/clearance'
import RegisterTable, { type Col } from '@/app/_components/RegisterTable'
import Stat from '@/app/_components/Stat'
import Empty from '@/app/_components/Empty'

export const dynamic = 'force-dynamic'

const cols: Col[] = [
  { key: 'ref', label: 'Case ID' },
  { key: 'Allegation Type', label: 'Allegation' },
  { key: 'Source', label: 'Source' },
  { key: 'Opened', label: 'Opened' },
  { key: 'Stage', label: 'Stage', pill: true },
  { key: 'severity', label: 'Priority', pill: true },
  { key: 'value', label: 'Days open', align: 'right' },
  { key: 'Target Closure (days)', label: 'Target (days)', align: 'right' },
  { key: 'status', label: 'Status', pill: true },
]

export default async function Investigations() {
  const clearance = await webClearance()

  if (clearance !== 'restricted') {
    return (
      <>
        <h1 className="ph">Investigations 🔒</h1>
        <p className="cap">This register is restricted.</p>
        <div className="locked">
          <p className="lk-ico" aria-hidden="true">🔒</p>
          <p className="lk-title">Restricted — second passcode required</p>
          <p className="lk-body">
            Investigation cases are not shown on this device. Nothing about them — not a count, not an allegation
            type, not a name — is loaded into this page.
          </p>
          {restrictedPasscode() ? (
            <Link className="btn" href="/restricted">Enter the restricted passcode</Link>
          ) : (
            <p className="lk-body">
              No <code>RESTRICTED_PASSCODE</code> is set, so this register stays closed to everyone. Set one in your
              environment and redeploy to open it to cleared people.
            </p>
          )}
          <p className="lk-foot">The Telegram bot follows the same rule: only ids in <code>RESTRICTED_USER_IDS</code> get an answer here.</p>
        </div>
      </>
    )
  }

  const today = todayISO()
  const all = await getRecords(clearance)
  const rows = all.filter(r => r.category === 'investigation')
  const open = rows.filter(isOpen)
  const overTarget = rows.filter(r => r.status === 'Over Target')
  const high = open.filter(r => r.severity === 'High')
  const whistle = rows.filter(r => r.meta?.Source === 'Whistleblowing Channel')
  const sorted = [...rows].sort(
    (a, b) => Number(isOpen(b)) - Number(isOpen(a)) || severityRank(b.severity) - severityRank(a.severity) || Number(b.value || 0) - Number(a.value || 0),
  )

  return (
    <>
      <h1 className="ph">Investigations 🔒</h1>
      <p className="cap">Restricted register — you are viewing it with the second passcode.</p>

      <div className="banner info">
        🔒 Restricted view. Close this tab when you are done; the clearance cookie lasts 8 hours.
        The robots never propose changes to a case, and the bot answers here only for ids on the restricted list.
      </div>

      <div className="grid">
        <Stat label="Cases" value={rows.length} />
        <Stat label="Open" value={open.length} />
        <Stat label="High priority open" value={high.length} tone={high.length ? 'warn' : undefined} />
        <Stat label="Over target" value={overTarget.length} tone={overTarget.length ? 'bad' : 'good'} />
        <Stat label="From whistleblowing" value={whistle.length} />
      </div>

      <p className="rowlabel">The register</p>
      {rows.length === 0 ? <Empty label="cases" /> : <RegisterTable rows={sorted} cols={cols} today={today} flagDates={false} />}
    </>
  )
}
