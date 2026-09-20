'use client'
import { useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  type Rec, type View, VIEWS, VIEW_LABEL, matchesView, asView,
  pill, isOverdue, isDueSoon, daysUntil, severityRank, SEVERITIES,
} from '@/lib/register'

// 👉 The interactive register. Every tab uses this.
//
// Four things you can do with it:
//   • FILTER by view (All / Overdue / Due 30 days / Open / High+ / Closed),
//     by severity, and by owner HOD. Chips are selectable and stack.
//   • SEARCH across ref, title, owner, standard, status and every workbook column.
//   • SORT by clicking any column header; click again to reverse.
//   • OPEN a row by clicking it — the full record unfolds underneath, showing
//     every column the original sheet had, not just the ones in the table.
//
// The view chip is mirrored into the URL (?view=overdue), so the dashboard's
// stat cards can deep-link straight to a filtered register and the chip is
// already selected when you land.
//
// Pure presentation: it filters rows in the browser. Nothing here writes.

export type Col = { key: string; label: string; align?: 'right'; pill?: boolean }

const BUILTIN = new Set(['ref', 'title', 'status', 'severity', 'owner', 'due', 'value', 'standard'])

function raw(r: Rec, key: string): string | number | null {
  switch (key) {
    case 'ref': return r.ref
    case 'title': return r.title
    case 'status': return r.status
    case 'severity': return r.severity
    case 'owner': return r.owner
    case 'due': return r.due_date
    case 'value': return r.value
    case 'standard': return r.standard
    default: {
      const v = r.meta?.[key]
      return v === undefined || v === null || v === '' ? null : v
    }
  }
}

const show = (v: string | number | null) => (v === null || v === '' ? '—' : String(v))

// Is this column numeric? Decides both alignment of the sort and the comparator.
function numeric(rows: Rec[], key: string): boolean {
  for (const r of rows.slice(0, 20)) {
    const v = raw(r, key)
    if (v === null) continue
    if (isNaN(Number(v))) return false
  }
  return true
}

export default function RegisterView({
  rows,
  cols,
  today,
  flagDates = true,
  initialView = 'all',
}: {
  rows: Rec[]
  cols: Col[]
  today: string
  flagDates?: boolean
  initialView?: View
}) {
  const router = useRouter()
  const params = useSearchParams()

  const [view, setView] = useState<View>(asView(params.get('view')) === 'all' ? initialView : asView(params.get('view')))
  const [sevs, setSevs] = useState<string[]>(() => {
    const s = params.get('severity')
    return s ? s.split(',').filter(x => (SEVERITIES as readonly string[]).includes(x)) : []
  })
  const [owner, setOwner] = useState<string>(params.get('owner') || '')
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null)
  const [openId, setOpenId] = useState<number | null>(null)

  // Which views and severities actually exist in this register — never show a
  // chip that can only ever return nothing.
  const availableViews = useMemo(
    () => VIEWS.filter(v => v === 'all' || rows.some(r => matchesView(r, v, today))),
    [rows, today],
  )
  const availableSevs = useMemo(
    () => SEVERITIES.filter(s => rows.some(r => r.severity === s)),
    [rows],
  )
  const owners = useMemo(
    () => Array.from(new Set(rows.map(r => r.owner).filter(Boolean) as string[])).sort(),
    [rows],
  )

  // Push the view into the URL so the page is linkable and the back button works.
  function pickView(v: View) {
    setView(v)
    const next = new URLSearchParams(Array.from(params.entries()))
    if (v === 'all') next.delete('view')
    else next.set('view', v)
    router.replace(next.toString() ? `?${next}` : '?', { scroll: false })
  }

  const toggleSev = (s: string) =>
    setSevs(cur => (cur.includes(s) ? cur.filter(x => x !== s) : [...cur, s]))

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    let out = rows.filter(r => {
      if (!matchesView(r, view, today)) return false
      if (sevs.length && !sevs.includes(r.severity || '')) return false
      if (owner && r.owner !== owner) return false
      if (!needle) return true
      const hay = `${r.ref ?? ''} ${r.title} ${r.owner ?? ''} ${r.standard ?? ''} ${r.status} ${Object.values(r.meta ?? {}).join(' ')}`
      return hay.toLowerCase().includes(needle)
    })
    if (sort) {
      const isNum = numeric(rows, sort.key)
      out = [...out].sort((a, b) => {
        const av = raw(a, sort.key), bv = raw(b, sort.key)
        if (av === null && bv === null) return 0
        if (av === null) return 1          // blanks always sink
        if (bv === null) return -1
        if (sort.key === 'severity') return (severityRank(String(av)) - severityRank(String(bv))) * sort.dir
        if (isNum) return (Number(av) - Number(bv)) * sort.dir
        return String(av).localeCompare(String(bv)) * sort.dir
      })
    }
    return out
  }, [rows, view, sevs, owner, q, sort, today])

  const clickSort = (key: string) =>
    setSort(cur => (cur && cur.key === key ? { key, dir: cur.dir === 1 ? -1 : 1 } : { key, dir: 1 }))

  const clearAll = () => { pickView('all'); setSevs([]); setOwner(''); setQ(''); setSort(null); setOpenId(null) }
  const filtersOn = view !== 'all' || sevs.length > 0 || !!owner || !!q

  if (!rows.length) {
    return <div className="empty">Nothing in this register yet — run <code>supabase/schema.sql</code> in your Supabase SQL editor, then refresh.</div>
  }

  return (
    <div className="rv">
      {/* ---- the controls ---- */}
      <div className="rv-bar">
        <div className="rv-chips" role="group" aria-label="Filter by state">
          {availableViews.map(v => (
            <button
              key={v}
              type="button"
              className={`chip${view === v ? ' on' : ''}`}
              aria-pressed={view === v}
              onClick={() => pickView(v)}
            >
              {VIEW_LABEL[v]}
              <span className="chip-n">{v === 'all' ? rows.length : rows.filter(r => matchesView(r, v, today)).length}</span>
            </button>
          ))}
        </div>

        <div className="rv-right">
          {availableSevs.length > 1 && (
            <div className="rv-chips" role="group" aria-label="Filter by severity">
              {availableSevs.map(s => (
                <button
                  key={s}
                  type="button"
                  className={`chip sev ${pill(s)}${sevs.includes(s) ? ' on' : ''}`}
                  aria-pressed={sevs.includes(s)}
                  onClick={() => toggleSev(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {owners.length > 1 && (
            <select className="rv-select" value={owner} onChange={e => setOwner(e.target.value)} aria-label="Filter by owner">
              <option value="">All owners</option>
              {owners.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          )}

          <input
            className="rv-search"
            type="search"
            placeholder="Search this register…"
            value={q}
            onChange={e => setQ(e.target.value)}
            aria-label="Search this register"
          />
        </div>
      </div>

      <p className="rv-count">
        Showing <b>{filtered.length}</b> of {rows.length}
        {filtersOn ? <button type="button" className="rv-clear" onClick={clearAll}>Clear filters</button> : null}
        <span className="rv-hint">Click any row to open the full record.</span>
      </p>

      {/* ---- the table ---- */}
      {filtered.length === 0 ? (
        <div className="empty">Nothing matches those filters. <button type="button" className="rv-clear" onClick={clearAll}>Clear them</button></div>
      ) : (
        <table className="tbl rv-tbl">
          <thead>
            <tr>
              {cols.map(c => {
                const active = sort?.key === c.key
                return (
                  <th key={c.key} className={c.align === 'right' ? 'r' : undefined}>
                    <button type="button" className={`rv-sort${active ? ' on' : ''}`} onClick={() => clickSort(c.key)}>
                      {c.label}
                      <span className="rv-arrow" aria-hidden="true">{active ? (sort!.dir === 1 ? '▲' : '▼') : '↕'}</span>
                    </button>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {filtered.map(r => {
              const late = flagDates && isOverdue(r, today)
              const soon = flagDates && !late && isDueSoon(r, 14, today)
              const open = openId === r.id
              return [
                <tr
                  key={r.id}
                  className={`rv-row${late ? ' row-late' : ''}${open ? ' on' : ''}`}
                  onClick={() => setOpenId(open ? null : r.id)}
                  tabIndex={0}
                  role="button"
                  aria-expanded={open}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpenId(open ? null : r.id) } }}
                >
                  {cols.map(c => {
                    const v = show(raw(r, c.key))
                    const isDue = c.key === 'due'
                    const asPill = c.pill || (!BUILTIN.has(c.key) && /status|rag|level|priority|stage|mandatory|applied/i.test(c.label))
                    return (
                      <td key={c.key} data-label={c.label} className={c.align === 'right' ? 'r' : undefined}>
                        {c.key === 'ref'
                          ? <span className="ref">{v}{open ? ' ▾' : ''}</span>
                          : asPill
                            ? <span className={`pill ${pill(v)}`}>{v}</span>
                            : v}
                        {isDue && late ? <span className="pill bad flag">overdue</span> : null}
                        {isDue && soon ? <span className="pill warn flag">{daysUntil(r.due_date, today)}d</span> : null}
                      </td>
                    )
                  })}
                </tr>,
                open ? (
                  <tr key={`${r.id}-detail`} className="rv-detail">
                    <td colSpan={cols.length}>
                      <div className="rv-card">
                        <p className="rv-card-title">
                          <span className="ref">{r.ref || `#${r.id}`}</span> {r.title}
                          {r.classification === 'restricted' ? <span className="pill bad flag">restricted</span> : null}
                        </p>
                        <dl className="rv-fields">
                          {Object.entries(r.meta ?? {})
                            .filter(([, v]) => v !== null && v !== undefined && String(v) !== '')
                            .map(([k, v]) => (
                              <div key={k}>
                                <dt>{k}</dt>
                                <dd>{String(v)}</dd>
                              </div>
                            ))}
                        </dl>
                        {r.notes ? <p className="rv-notes">{r.notes}</p> : null}
                      </div>
                    </td>
                  </tr>
                ) : null,
              ]
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}
