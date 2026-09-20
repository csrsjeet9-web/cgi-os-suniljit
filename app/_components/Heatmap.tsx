// The 5×5 residual risk heat map. Rows are likelihood 5 (top) down to 1; columns
// are impact 1..5. A cell's colour is the ISO-style zone (score = L × I), its
// number is how many OPEN risks sit there. Server component — no JavaScript.
export default function Heatmap({ grid }: { grid: number[][] }) {
  const total = grid.flat().reduce((s, n) => s + n, 0)
  if (!total) return <div className="empty">No open risks to plot yet.</div>

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
                {row.map((n, ci) => (
                  <div
                    key={ci}
                    className={`heat-cell ${zone(l, ci + 1)}${n ? '' : ' empty-cell'}`}
                    title={`Likelihood ${l} × Impact ${ci + 1} — ${n} open risk${n === 1 ? '' : 's'}`}
                  >
                    {n || ''}
                  </div>
                ))}
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
      <p className="chart-note">{total} open risks plotted by residual likelihood × impact.</p>
    </div>
  )
}
