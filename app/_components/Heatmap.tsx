'use client'

// The 5×5 residual risk heat map. Rows are likelihood 5 (top) down to 1; columns
// are impact 1..5. A cell's colour is the ISO-style zone (score = L × I), its
// number is how many OPEN risks sit there.
//
// Give it `onSelect` and every populated cell becomes a drill-down button: click
// one and the whole dashboard narrows to those risks. Click it again to clear.
export type Cell = { l: number; i: number }

export default function Heatmap({
  grid,
  selected,
  onSelect,
}: {
  grid: number[][]
  selected?: Cell | null
  onSelect?: (cell: Cell | null) => void
}) {
  const total = grid.flat().reduce((s, n) => s + n, 0)
  if (!total) return <div className="empty">No open risks to plot here.</div>

  const zone = (l: number, i: number) => {
    const score = l * i
    if (score >= 15) return 'z-bad'
    if (score >= 8) return 'z-warn'
    if (score >= 4) return 'z-mid'
    return 'z-good'
  }

  return (
    <div className="heat">
      <div className="heat-grid">
        <div className="heat-ylabel" aria-hidden="true">Likelihood</div>
        <div className="heat-cells">
          {grid.map((row, ri) => {
            const l = 5 - ri
            return (
              <div className="heat-row" key={l}>
                <span className="heat-axis">{l}</span>
                {row.map((n, ci) => {
                  const i = ci + 1
                  const on = !!selected && selected.l === l && selected.i === i
                  const label = `Likelihood ${l} × Impact ${i} — ${n} open risk${n === 1 ? '' : 's'}`
                  const cls = `heat-cell ${zone(l, i)}${n ? '' : ' empty-cell'}${on ? ' picked' : ''}`
                  if (!onSelect || !n) {
                    return <div key={i} className={cls} title={label}>{n || ''}</div>
                  }
                  return (
                    <button
                      key={i}
                      type="button"
                      className={cls + ' live'}
                      title={`${label} — click to drill down`}
                      aria-pressed={on}
                      onClick={() => onSelect(on ? null : { l, i })}
                    >
                      {n}
                    </button>
                  )
                })}
              </div>
            )
          })}
          <div className="heat-row">
            <span className="heat-axis" />
            {[1, 2, 3, 4, 5].map(i => <span className="heat-axis" key={i}>{i}</span>)}
          </div>
        </div>
      </div>
      <p className="heat-xlabel">Impact →</p>
      <p className="chart-note">
        {total} open risk{total === 1 ? '' : 's'} by residual likelihood × impact.
        {onSelect ? ' Click a cell to drill down.' : ''}
      </p>
    </div>
  )
}
