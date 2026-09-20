'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  type Rec, type View, matchesView, isOverdue, isDueSoon, isOpen, isDone,
  severityRank, pill, CATEGORY_INFO, catPlural, VIEW_LABEL,
} from '@/lib/register'
import Heatmap, { type Cell } from './Heatmap'
import Bars from './Bars'

// 👉 THE DASHBOARD — one lens, four ways to set it.
//
// Every element here both REFLECTS the current filter and can SET it:
//   • the stat boxes pick a state (overdue, due this week, high, open)
//   • a heat-map cell drills into one likelihood × impact square
//   • a bar drills into one owner HOD
//   • a register row drills into one register
//
// Cross-filtering rule: each chart is drawn from the rows matching every OTHER
// selection but not its own, so the heat map still shows you the squares you
// haven't picked and the bars still show the owners you haven't picked. Picking
// two things narrows; picking the same thing twice clears it.
//
// Pure presentation. It filters rows already fetched on the server, and the
// links out carry the lens into the register pages.

type Lens = { view: View; owner: string | null; cell: Cell | null; register: string | null }
const CLEAR: Lens = { view: 'all', owner: null, cell: null, register: null }

const cellOf = (r: Rec) => ({ l: Number(r.meta?.['Residual L']), i: Number(r.meta?.['Residual I']) })

export default function DashboardView({
  rows,
  pending,
  approvalLevel,
  today,
  restricted,
}: {
  rows: Rec[]
  pending: number
  approvalLevel: string
  today: string
  restricted: boolean
}) {
  const [lens, setLens] = useState<Lens>(CLEAR)
  const set = (patch: Partial<Lens>) => setLens(l => ({ ...l, ...patch }))

  // Rows matching every part of the lens EXCEPT the one named — so each control
  // keeps showing you the options you have not chosen yet.
  const sel = useMemo(() => (except?: keyof Lens) => rows.filter(r => {
    if (except !== 'view' && lens.view !== 'all' && !matchesView(r, lens.view, today)) return false
    if (except !== 'owner' && lens.owner && r.owner !== lens.owner) return false
    if (except !== 'register' && lens.register && r.category !== lens.register) return false
    if (except !== 'cell' && lens.cell) {
      if (r.category !== 'risk' || isDone(r)) return false
      const c = cellOf(r)
      if (c.l !== lens.cell.l || c.i !== lens.cell.i) return false
    }
    return true
  }), [rows, lens, today])

  const shown = useMemo(() => sel(), [sel])
  const forStats = useMemo(() => sel('view'), [sel])       // boxes count without their own pick
  const forHeat = useMemo(() => sel('cell'), [sel])
  const forBars = useMemo(() => sel('owner'), [sel])
  const forRegisters = useMemo(() => sel('register'), [sel])

  const n = {
    overdue: forStats.filter(r => isOverdue(r, today)).length,
    due: forStats.filter(r => isDueSoon(r, 7, today)).length,
    high: forStats.filter(r => isOpen(r) && severityRank(r.severity) >= 3).length,
    open: forStats.filter(isOpen).length,
  }

  const heat = useMemo(() => {
    const g = Array.from({ length: 5 }, () => Array(5).fill(0))
    for (const r of forHeat) {
      if (r.category !== 'risk' || isDone(r)) continue
      const { l, i } = cellOf(r)
      if (l >= 1 && l <= 5 && i >= 1 && i <= 5) g[5 - l][i - 1]++
    }
    return g
  }, [forHeat])

  const owners = useMemo(() => {
    const acc: Record<string, { open: number; overdue: number }> = {}
    for (const r of forBars) {
      if (!r.owner || !isOpen(r)) continue
      const a = (acc[r.owner] ||= { open: 0, overdue: 0 })
      a.open++
      if (isOverdue(r, today)) a.overdue++
    }
    return Object.entries(acc).map(([owner, v]) => ({ owner, ...v }))
      .sort((a, b) => b.overdue - a.overdue || b.open - a.open).slice(0, 8)
  }, [forBars, today])

  const registers = useMemo(() => {
    const acc: Record<string, { open: number; overdue: number; dueSoon: number; high: number; total: number }> = {}
    for (const r of forRegisters) {
      if (r.category === 'task') continue
      const b = (acc[r.category] ||= { open: 0, overdue: 0, dueSoon: 0, high: 0, total: 0 })
      b.total++
      if (isOpen(r)) b.open++
      if (isOverdue(r, today)) b.overdue++
      if (isDueSoon(r, 7, today)) b.dueSoon++
      if (isOpen(r) && severityRank(r.severity) >= 3) b.high++
    }
    return Object.entries(acc).sort((a, b) => b[1].overdue - a[1].overdue || b[1].open - a[1].open)
  }, [forRegisters, today])

  const worst = (list: Rec[]) =>
    [...list].sort((a, b) => severityRank(b.severity) - severityRank(a.severity) || (a.due_date || '9999').localeCompare(b.due_date || '9999'))
  const overdue = worst(shown.filter(r => isOverdue(r, today)))
  const soon = [...shown.filter(r => isDueSoon(r, 7, today))].sort((a, b) => (a.due_date || '').localeCompare(b.due_date || ''))
  const high = worst(shown.filter(r => isOpen(r) && severityRank(r.severity) >= 3 && !isOverdue(r, today)))

  const on = lens.view !== 'all' || !!lens.owner || !!lens.cell || !!lens.register

  // A row in the "needs you" lists, deep-linked into its register carrying the lens.
  const Item = ({ r, view }: { r: Rec; view: string }) => {
    const info = (CATEGORY_INFO as any)[r.category]
    const qs = new URLSearchParams()
    if (view !== 'all') qs.set('view', view)
    if (lens.owner) qs.set('owner', lens.owner)
    return (
      <Link href={`${info?.href || '/'}${qs.toString() ? `?${qs}` : ''}`} className="item">
        <span className="it-ref">{r.ref || '—'}</span>
        <span className="it-title">{r.title}</span>
        <span className={`pill ${pill(r.severity)}`}>{r.severity || 'unrated'}</span>
        <span className="it-meta">{r.owner || '—'}{r.due_date ? ` · due ${r.due_date}` : ''}</span>
      </Link>
    )
  }

  const Box = ({ k, label, value, tone, sub }: { k: View; label: string; value: number; tone?: string; sub?: string }) => (
    <button
      type="button"
      className={`stat live${tone ? ' ' + tone : ''}${lens.view === k ? ' picked' : ''}`}
      aria-pressed={lens.view === k}
      onClick={() => set({ view: lens.view === k ? 'all' : k })}
    >
      <p className="l">{label}</p>
      <p className="v">{value}</p>
      <p className="s">{lens.view === k ? 'filtering · click to clear' : sub || 'click to filter'}</p>
    </button>
  )

  return (
    <>
      <h1 className="ph">Dashboard</h1>
      <p className="cap">The whole of CGI in one screen — what is late, what is coming, and what needs your YES.</p>

      {/* the lens */}
      {on ? (
        <div className="lens">
          <span className="lens-k">Filtering</span>
          {lens.view !== 'all' ? (
            <button type="button" className="apill" onClick={() => set({ view: 'all' })}>
              <span className="apill-k">State</span>{VIEW_LABEL[lens.view]}<span className="apill-x">×</span>
            </button>
          ) : null}
          {lens.owner ? (
            <button type="button" className="apill" onClick={() => set({ owner: null })}>
              <span className="apill-k">Owner</span>{lens.owner}<span className="apill-x">×</span>
            </button>
          ) : null}
          {lens.cell ? (
            <button type="button" className="apill" onClick={() => set({ cell: null })}>
              <span className="apill-k">Risk</span>L{lens.cell.l} × I{lens.cell.i}<span className="apill-x">×</span>
            </button>
          ) : null}
          {lens.register ? (
            <button type="button" className="apill" onClick={() => set({ register: null })}>
              <span className="apill-k">Register</span>{catPlural(lens.register)}<span className="apill-x">×</span>
            </button>
          ) : null}
          <span className="lens-n"><b>{shown.length}</b> of {rows.length} items</span>
          <button type="button" className="rv-clear" onClick={() => setLens(CLEAR)}>Clear all</button>
        </div>
      ) : null}

      {/* Row 1 — the boxes, each one a filter */}
      <div className="grid">
        <Box k="overdue" label="Overdue" value={n.overdue} tone={n.overdue ? 'bad' : 'good'} />
        <Box k="due" label="Due in 7 days" value={n.due} tone={n.due ? 'warn' : undefined} />
        <Box k="high" label="Open High / Critical" value={n.high} tone={n.high ? 'warn' : 'good'} />
        <Box k="open" label="Open items" value={n.open} />
        <Link href="/approvals" className="stat-link">
          <div className={`stat${pending ? ' warn' : ''}`}>
            <p className="l">🙋 Needs your YES</p>
            <p className="v">{pending}</p>
            <p className="s">dial: {approvalLevel}</p>
          </div>
        </Link>
      </div>

      {/* Row 2 — the three lists */}
      <p className="rowlabel">Overdue{overdue.length > 6 ? ` — worst 6 of ${overdue.length}` : ''}</p>
      {overdue.length ? (
        <div className="items">{overdue.slice(0, 6).map(r => <Item key={r.id} r={r} view="overdue" />)}</div>
      ) : <div className="empty">Nothing overdue here. 🎉</div>}

      <p className="rowlabel">Due this week{soon.length > 5 ? ` — next 5 of ${soon.length}` : ''}</p>
      {soon.length ? (
        <div className="items">{soon.slice(0, 5).map(r => <Item key={r.id} r={r} view="due" />)}</div>
      ) : <div className="empty">Nothing falls due in the next 7 days.</div>}

      <p className="rowlabel">Open at High or Critical{high.length > 5 ? ` — top 5 of ${high.length}` : ''}</p>
      {high.length ? (
        <div className="items">{high.slice(0, 5).map(r => <Item key={r.id} r={r} view="high" />)}</div>
      ) : <div className="empty">Nothing open above your line.</div>}

      {/* Row 3 — the charts, both clickable */}
      <p className="rowlabel">Residual risk heat map</p>
      <Heatmap grid={heat} selected={lens.cell} onSelect={c => set({ cell: c })} />

      <p className="rowlabel">Open items by HOD</p>
      <Bars
        items={owners.map(o => ({ label: o.owner, value: o.open, sub: o.overdue ? `(${o.overdue} overdue)` : undefined, tone: o.overdue ? 'bad' : 'good' }))}
        selected={lens.owner}
        onSelect={o => set({ owner: o })}
      />

      {/* Row 4 — every register, each row a filter */}
      <p className="rowlabel">The registers</p>
      <p className="chart-note" style={{ margin: '0 0 10px' }}>Click a register name to narrow this page to it, or a number to open that register already filtered.</p>
      <table className="tbl">
        <thead>
          <tr><th>Register</th><th className="r">Items</th><th className="r">Open</th><th className="r">Overdue</th><th className="r">Due 7d</th><th className="r">High+</th></tr>
        </thead>
        <tbody>
          {registers.map(([cat, b]) => {
            const info = (CATEGORY_INFO as any)[cat]
            const base = info?.href || '/'
            const picked = lens.register === cat
            return (
              <tr key={cat} className={picked ? 'row-picked' : undefined}>
                <td data-label="Register">
                  <button type="button" className="reglink" aria-pressed={picked} onClick={() => set({ register: picked ? null : cat })}>
                    {info?.emoji} {catPlural(cat)}
                  </button>
                </td>
                <td data-label="Items" className="r"><Link href={base}>{b.total}</Link></td>
                <td data-label="Open" className="r"><Link href={`${base}?view=open`}>{b.open}</Link></td>
                <td data-label="Overdue" className="r">{b.overdue ? <Link href={`${base}?view=overdue`}><span className="pill bad">{b.overdue}</span></Link> : '—'}</td>
                <td data-label="Due 7d" className="r">{b.dueSoon ? <Link href={`${base}?view=due`}><span className="pill warn">{b.dueSoon}</span></Link> : '—'}</td>
                <td data-label="High+" className="r">{b.high ? <Link href={`${base}?view=high`}>{b.high}</Link> : '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {!restricted ? (
        <p className="chart-note">🔒 Investigations are not included in these numbers on this device. They need the second passcode.</p>
      ) : null}
    </>
  )
}
