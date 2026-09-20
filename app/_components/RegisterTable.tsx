import { type Rec, pill, isOverdue, isDueSoon, daysUntil, todayISO } from '@/lib/records'

// 👉 The one table every register tab uses. You give it the rows and which
//    columns to show; it renders the ref, the status/severity pills, and an
//    overdue flag. `col` names a workbook column (r.meta[...]) OR one of the
//    built-ins: ref, title, status, severity, owner, due, value, standard.
//
// Adding a column to a tab = adding one entry to that page's `cols` array.
export type Col = { key: string; label: string; align?: 'right'; pill?: boolean }

const BUILTIN = new Set(['ref', 'title', 'status', 'severity', 'owner', 'due', 'value', 'standard'])

function cell(r: Rec, key: string): string {
  switch (key) {
    case 'ref': return r.ref || '—'
    case 'title': return r.title
    case 'status': return r.status || '—'
    case 'severity': return r.severity || '—'
    case 'owner': return r.owner || '—'
    case 'due': return r.due_date || '—'
    case 'value': return r.value === null || r.value === undefined ? '—' : String(r.value)
    case 'standard': return r.standard || '—'
    default: {
      const v = r.meta?.[key]
      return v === undefined || v === null || v === '' ? '—' : String(v)
    }
  }
}

export default function RegisterTable({
  rows,
  cols,
  today = todayISO(),
  flagDates = true,
}: {
  rows: Rec[]
  cols: Col[]
  today?: string
  flagDates?: boolean
}) {
  if (!rows.length) {
    return <div className="empty">Nothing in this register yet — run <code>supabase/schema.sql</code> in your Supabase SQL editor, then refresh.</div>
  }
  return (
    <table className="tbl">
      <thead>
        <tr>{cols.map(c => <th key={c.key} className={c.align === 'right' ? 'r' : undefined}>{c.label}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map(r => {
          const late = flagDates && isOverdue(r, today)
          const soon = flagDates && !late && isDueSoon(r, 14, today)
          return (
            <tr key={r.id} className={late ? 'row-late' : undefined}>
              {cols.map(c => {
                const v = cell(r, c.key)
                const isDue = c.key === 'due'
                return (
                  <td key={c.key} data-label={c.label} className={c.align === 'right' ? 'r' : undefined}>
                    {c.key === 'ref' ? <span className="ref">{v}</span>
                      : c.pill || (!BUILTIN.has(c.key) && /status|rag|level|priority|stage|mandatory|applied/i.test(c.label))
                        ? <span className={`pill ${pill(v)}`}>{v}</span>
                        : v}
                    {isDue && late ? <span className="pill bad flag">overdue</span> : null}
                    {isDue && soon ? <span className="pill warn flag">{daysUntil(r.due_date, today)}d</span> : null}
                  </td>
                )
              })}
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
