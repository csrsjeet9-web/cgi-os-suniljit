// A plain horizontal bar list — percentages, counts, anything with a maximum.
// Used for training completion, CMMI implementation and the workload per HOD.
// Server component: no JavaScript, no chart library.
export type BarItem = { label: string; value: number; suffix?: string; sub?: string; tone?: 'bad' | 'warn' | 'good' }

export default function Bars({ items, max }: { items: BarItem[]; max?: number }) {
  if (!items.length) return <div className="empty">Nothing to chart yet.</div>
  const ceiling = max ?? Math.max(1, ...items.map(i => i.value))

  const toneOf = (i: BarItem) => {
    if (i.tone) return i.tone
    if (max !== 100) return 'good'
    return i.value >= 85 ? 'good' : i.value >= 70 ? 'warn' : 'bad'
  }

  return (
    <div className="bars">
      {items.map((i, n) => (
        <div className="bar-row" key={`${i.label}-${n}`}>
          <span className="bar-label" title={i.label}>{i.label}</span>
          <span className="bar-track">
            <span className={`bar-fill ${toneOf(i)}`} style={{ width: `${Math.min(100, Math.round((i.value / ceiling) * 100))}%` }} />
          </span>
          <span className="bar-value">{i.value}{i.suffix || ''}{i.sub ? <em> {i.sub}</em> : null}</span>
        </div>
      ))}
    </div>
  )
}
