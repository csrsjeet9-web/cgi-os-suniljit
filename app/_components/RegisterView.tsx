'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  type Rec, type View, VIEWS, VIEW_LABEL, matchesView, asView,
  pill, isOverdue, isDueSoon, isOpen, daysUntil, severityRank, SEVERITIES,
} from '@/lib/register'

// 👉 The interactive register. Every tab uses this.
//
//   • VIEWS along the top — the six built-in states, each with a live count,
//     followed by any view you have saved yourself.
//   • FILTER is one faceted popover: Status, Severity, Owner, Standard. Each
//     value carries the count it would return, computed against everything else
//     you have already chosen, so you can see a dead end before you click it.
//   • GROUP the rows under collapsible headers — by status, severity, owner or
//     standard. Headers show the count and how many are overdue.
//   • SORT by clicking a column header; click again to reverse.
//   • OPEN a row to unfold the whole record, every column the sheet had.
//
// The view is mirrored into the URL (?view=overdue) so the dashboard's numbers
// deep-link into a filtered register. Saved views live in this browser only.
//
// Pure presentation: it filters rows in the browser and writes nothing.

export type Col = { key: string; label: string; align?: 'right'; pill?: boolean }

const BUILTIN = new Set(['ref', 'title', 'status', 'severity', 'owner', 'due', 'value', 'standard'])

type FacetKey = 'status' | 'severity' | 'owner' | 'standard'
const FACETS: { key: FacetKey; label: string; get: (r: Rec) => string | null }[] = [
  { key: 'status',   label: 'Status',   get: r => r.status || null },
  { key: 'severity', label: 'Severity', get: r => r.severity || null },
  { key: 'owner',    label: 'Owner',    get: r => r.owner || null },
  { key: 'standard', label: 'Standard', get: r => r.standard || null },
]
type Facets = Record<FacetKey, string[]>
const EMPTY: Facets = { status: [], severity: [], owner: [], standard: [] }

type GroupBy = 'none' | FacetKey
type Saved = { id: string; name: string; view: View; facets: Facets; groupBy: GroupBy; q: string }

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
  defaultGroup = 'status',
  registerKey,
}: {
  rows: Rec[]
  cols: Col[]
  today: string
  flagDates?: boolean
  initialView?: View
  defaultGroup?: GroupBy
  registerKey?: string
}) {
  const router = useRouter()
  const params = useSearchParams()
  const storeKey = 'cgi-views:' + (registerKey || rows[0]?.category || 'all')

  const urlView = asView(params.get('view'))
  const [view, setView] = useState<View>(urlView === 'all' ? initialView : urlView)
  const [facets, setFacets] = useState<Facets>(EMPTY)
  const [q, setQ] = useState('')
  const [groupBy, setGroupBy] = useState<GroupBy>(defaultGroup)
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null)
  const [openId, setOpenId] = useState<number | null>(null)
  const [collapsed, setCollapsed] = useState<string[]>([])
  const [filterOpen, setFilterOpen] = useState(false)
  const [saved, setSaved] = useState<Saved[]>([])
  const [activeSaved, setActiveSaved] = useState<string | null>(null)
  const popRef = useRef<HTMLDivElement | null>(null)

  // Saved views live in this browser only — never throw if storage is blocked.
  useEffect(() => {
    try {
      const rawSaved = window.localStorage.getItem(storeKey)
      if (rawSaved) setSaved(JSON.parse(rawSaved))
    } catch { /* private window, blocked storage — carry on without them */ }
  }, [storeKey])

  function persist(next: Saved[]) {
    setSaved(next)
    try { window.localStorage.setItem(storeKey, JSON.stringify(next)) } catch { /* ignore */ }
  }

  // Close the filter popover on an outside click or Escape.
  useEffect(() => {
    if (!filterOpen) return
    const onDown = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) setFilterOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFilterOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [filterOpen])

  const needle = q.trim().toLowerCase()
  const matchesSearch = (r: Rec) => {
    if (!needle) return true
    const hay = `${r.ref ?? ''} ${r.title} ${r.owner ?? ''} ${r.standard ?? ''} ${r.status} ${Object.values(r.meta ?? {}).join(' ')}`
    return hay.toLowerCase().includes(needle)
  }
  const matchesFacet = (r: Rec, k: FacetKey) => {
    const picked = facets[k]
    if (!picked.length) return true
    const f = FACETS.find(x => x.key === k)!
    return picked.includes(f.get(r) || '')
  }
  const matchesAllFacets = (r: Rec, except?: FacetKey) =>
    FACETS.every(f => f.key === except || matchesFacet(r, f.key))

  const filtered = useMemo(() => {
    let out = rows.filter(r => matchesView(r, view, today) && matchesSearch(r) && matchesAllFacets(r))
    if (sort) {
      const isNum = numeric(rows, sort.key)
      out = [...out].sort((a, b) => {
        const av = raw(a, sort.key), bv = raw(b, sort.key)
        if (av === null && bv === null) return 0
        if (av === null) return 1
        if (bv === null) return -1
        if (sort.key === 'severity') return (severityRank(String(av)) - severityRank(String(bv))) * sort.dir
        if (isNum) return (Number(av) - Number(bv)) * sort.dir
        return String(av).localeCompare(String(bv)) * sort.dir
      })
    }
    return out
  }, [rows, view, facets, q, sort, today])

  // Facet values with the count each WOULD return — computed against everything
  // else already chosen, so a zero is a real dead end, not a stale number.
  const facetOptions = useMemo(() => {
    const out: Record<FacetKey, { value: string; n: number }[]> = { status: [], severity: [], owner: [], standard: [] }
    for (const f of FACETS) {
      const pool = rows.filter(r => matchesView(r, view, today) && matchesSearch(r) && matchesAllFacets(r, f.key))
      const tally = new Map<string, number>()
      for (const r of pool) {
        const v = f.get(r)
        if (v) tally.set(v, (tally.get(v) ?? 0) + 1)
      }
      for (const v of facets[f.key]) if (!tally.has(v)) tally.set(v, 0)
      out[f.key] = Array.from(tally, ([value, n]) => ({ value, n }))
        .sort((a, b) => (f.key === 'severity' ? severityRank(b.value) - severityRank(a.value) : b.n - a.n || a.value.localeCompare(b.value)))
    }
    return out
  }, [rows, view, facets, q, today])

  const availableViews = useMemo(
    () => VIEWS.filter(v => v === 'all' || rows.some(r => matchesView(r, v, today))),
    [rows, today],
  )

  // Group the filtered rows. Worst first: most overdue, then largest, and any
  // group that is entirely closed sinks to the bottom.
  const groups = useMemo(() => {
    if (groupBy === 'none') return [{ key: '', label: '', rows: filtered, overdue: 0 }]
    const f = FACETS.find(x => x.key === groupBy)!
    const map = new Map<string, Rec[]>()
    for (const r of filtered) {
      const k = f.get(r) || '—'
      const arr = map.get(k); if (arr) arr.push(r); else map.set(k, [r])
    }
    return Array.from(map, ([key, rs]) => ({
      key,
      label: key,
      rows: rs,
      overdue: rs.filter(r => isOverdue(r, today)).length,
      anyOpen: rs.some(isOpen),
    })).sort((a, b) =>
      groupBy === 'severity'
        ? severityRank(b.key) - severityRank(a.key)
        : Number(b.anyOpen) - Number(a.anyOpen) || b.overdue - a.overdue || b.rows.length - a.rows.length,
    )
  }, [filtered, groupBy, today])

  function pickView(v: View) {
    setView(v); setActiveSaved(null)
    const next = new URLSearchParams(Array.from(params.entries()))
    if (v === 'all') next.delete('view'); else next.set('view', v)
    router.replace(next.toString() ? `?${next}` : '?', { scroll: false })
  }
  function applySaved(s: Saved) {
    setView(s.view); setFacets(s.facets); setGroupBy(s.groupBy); setQ(s.q); setActiveSaved(s.id)
  }
  function saveCurrent() {
    const name = window.prompt('Name this view', suggestedName())
    if (!name) return
    const s: Saved = { id: String(Date.now()), name: name.slice(0, 40), view, facets, groupBy, q }
    persist([...saved, s]); setActiveSaved(s.id)
  }
  function suggestedName() {
    const bits: string[] = []
    if (view !== 'all') bits.push(VIEW_LABEL[view])
    for (const f of FACETS) if (facets[f.key].length) bits.push(facets[f.key].join('/'))
    if (q.trim()) bits.push(`"${q.trim()}"`)
    return bits.join(' · ') || 'My view'
  }
  function toggleFacet(k: FacetKey, v: string) {
    setActiveSaved(null)
    setFacets(cur => ({ ...cur, [k]: cur[k].includes(v) ? cur[k].filter(x => x !== v) : [...cur[k], v] }))
  }
  const clickSort = (key: string) =>
    setSort(cur => (cur && cur.key === key ? { key, dir: cur.dir === 1 ? -1 : 1 } : { key, dir: 1 }))
  const toggleGroup = (k: string) =>
    setCollapsed(cur => (cur.includes(k) ? cur.filter(x => x !== k) : [...cur, k]))

  const facetCount = FACETS.reduce((n, f) => n + facets[f.key].length, 0)
  const filtersOn = view !== 'all' || facetCount > 0 || !!q.trim()
  function clearAll() {
    setFacets(EMPTY); setQ(''); setSort(null); setOpenId(null); setActiveSaved(null); pickView('all')
  }

  if (!rows.length) {
    return <div className="empty">Nothing in this register yet — run <code>supabase/schema.sql</code> in your Supabase SQL editor, then refresh.</div>
  }

  return (
    <div className="rv">
      {/* ---- views ---- */}
      <div className="rv-views" role="group" aria-label="Views">
        {availableViews.map(v => (
          <button
            key={v}
            type="button"
            className={`vtab${view === v && !activeSaved ? ' on' : ''}`}
            aria-pressed={view === v && !activeSaved}
            onClick={() => pickView(v)}
          >
            {VIEW_LABEL[v]}
            <span className="vtab-n">{v === 'all' ? rows.length : rows.filter(r => matchesView(r, v, today)).length}</span>
          </button>
        ))}
        {saved.map(s => (
          <span key={s.id} className={`vtab saved${activeSaved === s.id ? ' on' : ''}`}>
            <button type="button" className="vtab-main" onClick={() => applySaved(s)}>
              {s.name}
            </button>
            <button
              type="button"
              className="vtab-x"
              aria-label={`Delete the view ${s.name}`}
              onClick={() => { persist(saved.filter(x => x.id !== s.id)); if (activeSaved === s.id) setActiveSaved(null) }}
            >×</button>
          </span>
        ))}
        {filtersOn && !activeSaved ? (
          <button type="button" className="vtab add" onClick={saveCurrent}>+ Save view</button>
        ) : null}
      </div>

      {/* ---- controls ---- */}
      <div className="rv-bar">
        <div className="rv-filterwrap" ref={popRef}>
          <button
            type="button"
            className={`ctl${facetCount ? ' on' : ''}`}
            aria-expanded={filterOpen}
            aria-haspopup="dialog"
            onClick={() => setFilterOpen(o => !o)}
          >
            Filter{facetCount ? <span className="ctl-n">{facetCount}</span> : null}
          </button>

          {filterOpen ? (
            <div className="pop" role="dialog" aria-label="Filter this register">
              <div className="pop-head">
                <span>Filter</span>
                <button type="button" className="linkish" onClick={() => setFacets(EMPTY)} disabled={!facetCount}>Clear all</button>
              </div>
              <div className="pop-body">
                {FACETS.map(f => {
                  const opts = facetOptions[f.key]
                  if (opts.length < 2) return null
                  return (
                    <div className="facet" key={f.key}>
                      <p className="facet-h">{f.label}</p>
                      {opts.map(o => (
                        <label className={`fopt${o.n === 0 ? ' dead' : ''}`} key={o.value}>
                          <input
                            type="checkbox"
                            checked={facets[f.key].includes(o.value)}
                            onChange={() => toggleFacet(f.key, o.value)}
                          />
                          <span className={`fdot ${pill(o.value)}`} aria-hidden="true" />
                          <span className="fname">{o.value}</span>
                          <span className="fn">{o.n}</span>
                        </label>
                      ))}
                    </div>
                  )
                })}
              </div>
            </div>
          ) : null}
        </div>

        <label className="ctl-group">
          <span>Group</span>
          <select className="rv-select" value={groupBy} onChange={e => setGroupBy(e.target.value as GroupBy)} aria-label="Group rows by">
            <option value="none">No grouping</option>
            {FACETS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
          </select>
        </label>

        <input
          className="rv-search"
          type="search"
          placeholder="Search this register…"
          value={q}
          onChange={e => { setQ(e.target.value); setActiveSaved(null) }}
          aria-label="Search this register"
        />
      </div>

      {/* ---- active filter pills ---- */}
      {facetCount ? (
        <div className="rv-active">
          {FACETS.flatMap(f => facets[f.key].map(v => (
            <button key={f.key + v} type="button" className="apill" onClick={() => toggleFacet(f.key, v)}>
              <span className="apill-k">{f.label}</span>{v}<span className="apill-x" aria-hidden="true">×</span>
            </button>
          )))}
        </div>
      ) : null}

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

          {groups.map(g => {
            const shut = collapsed.includes(g.key)
            return (
              <tbody key={g.key || 'all'} className="rv-group">
                {groupBy !== 'none' ? (
                  <tr className="grow">
                    <th colSpan={cols.length}>
                      <button type="button" className="ghead" aria-expanded={!shut} onClick={() => toggleGroup(g.key)}>
                        <span className="gcaret" aria-hidden="true">{shut ? '▸' : '▾'}</span>
                        <span className={`pill ${pill(g.label)}`}>{g.label}</span>
                        <span className="gn">{g.rows.length}</span>
                        {g.overdue ? <span className="pill bad flag">{g.overdue} overdue</span> : null}
                      </button>
                    </th>
                  </tr>
                ) : null}

                {shut ? null : g.rows.map(r => {
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
                                  <div key={k}><dt>{k}</dt><dd>{String(v)}</dd></div>
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
            )
          })}
        </table>
      )}
    </div>
  )
}
