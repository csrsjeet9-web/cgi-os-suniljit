import Link from 'next/link'

// A single label + value card. `tone` colours the number (bad = red, warn = amber,
// good = green). Pass `href` to make the whole card a link. Styles: .stat in globals.css.
export default function Stat({
  label, value, tone, href, sub,
}: {
  label: string
  value: string | number
  tone?: 'bad' | 'warn' | 'good'
  href?: string
  sub?: string
}) {
  const card = (
    <div className={`stat${tone ? ' ' + tone : ''}`}>
      <p className="l">{label}</p>
      <p className="v">{value}</p>
      {sub ? <p className="s">{sub}</p> : null}
    </div>
  )
  if (href) return <Link href={href} style={{ textDecoration: 'none', color: 'inherit' }}>{card}</Link>
  return card
}
