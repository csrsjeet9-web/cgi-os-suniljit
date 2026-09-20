'use client'

// A plain horizontal bar list — percentages, counts, anything with a maximum.
// Used for training completion, CMMI implementation and the workload per HOD.
//
// Give it `onSelect` and each bar becomes a drill-down button: click one and the
// dashboard narrows to that owner. Click it again to clear. Without `onSelect`
// it renders as static rows, which is what the register pages want.
export type BarItem = { label: string; value: number; suffix?: string; sub?: string; tone?: 'bad' | 'warn' | 'good' }

export default function Bars({
  items,
  max,
  selected,
  onSelect,
}: {
  items: BarItem[]
  max?: number
  selected?: string | null
  onSelect?: (label: string | null) => void
}) {
  if (!items.length) return <div className="empty">Nothing to chart here.</div>
  const ceiling = max ?? Math.max(1, ...items.map(i => i.value))

  const toneOf = (i: BarItem) => {
    if (i.tone) return i.tone
    if (max !== 100) return 'good'
    return i.value >= 85 ? 'good' : i.value >= 70 ? 'warn' : 'bad'
  }

  return (
    <div className="bars">
      {items.map((i, n) => {
        const on = selected === i.label
        const width = `${Math.min(100, Math.round((i.value / ceiling) * 100))}%`
        const inner = (
          <>
            <span className="bar-label" title={i.label}>{i.label}</span>
            <span className="bar-track">
              <span className={`bar-fill ${toneOf(i)}`} style={{ width }} />
            </span>
            <span className="bar-value">{i.value}{i.suffix || ''}{i.sub ? <em> {i.sub}</em> : null}</span>
          </>
        )
        if (!onSelect) return <div className="bar-row" key={`${i.label}-${n}`}>{inner}</div>
        return (
          <button
            type="button"
            className={`bar-row live${on ? ' picked' : ''}`}
            key={`${i.label}-${n}`}
            aria-pressed={on}
            title={`${i.label} — click to drill down`}
            onClick={() => onSelect(on ? null : i.label)}
          >
            {inner}
          </button>
        )
      })}
      {onSelect ? <p className="chart-note">Click a bar to drill down.</p> : null}
    </div>
  )
}
