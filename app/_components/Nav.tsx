'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

// 👉 The desktop sidebar tabs, grouped under micro-cap section labels.
//    Adding a register? Add ONE line to the right group here, add the SAME tab to
//    BottomNav.tsx (bottom bar or the More sheet), and create app/<name>/page.tsx.
export const NAV_GROUPS: { label: string; tabs: { href: string; label: string }[] }[] = [
  { label: 'Overview', tabs: [
    { href: '/', label: 'Dashboard' },
  ] },
  { label: 'Risk & Compliance', tabs: [
    { href: '/risks', label: 'Risks' },
    { href: '/compliance', label: 'Compliance' },
  ] },
  { label: 'Assurance', tabs: [
    { href: '/audits', label: 'Internal Audit' },
    { href: '/issues', label: 'Issues' },
    { href: '/investigations', label: 'Investigations' },
  ] },
  { label: 'Process & People', tabs: [
    { href: '/gbpms', label: 'GBPMS Documents' },
    { href: '/training', label: 'ISO Training' },
    { href: '/cmmi', label: 'CMMI' },
    { href: '/lessons', label: 'Lessons Learned' },
    { href: '/esg', label: 'ESG' },
  ] },
  { label: 'Robots', tabs: [
    { href: '/approvals', label: 'Approvals' },
    { href: '/employees', label: 'AI Employees' },
  ] },
]

// Flat list kept for anything that wants every tab in one array.
export const TABS = NAV_GROUPS.flatMap(g => g.tabs)

// `pendingCount` is an optional seam: pass it (from a server component that already
// knows the number) to show the 🙋 badge on Approvals. We never fetch here — a
// client nav must stay free of its own server round-trips.
export default function Nav({ pendingCount }: { pendingCount?: number }) {
  const path = usePathname()
  return (
    <nav className="nav">
      {NAV_GROUPS.map(group => (
        <div className="nav-group" key={group.label}>
          <p className="nav-label">{group.label}</p>
          {group.tabs.map(t => (
            <Link key={t.href} href={t.href} className={path === t.href ? 'active' : ''}>
              <span>{t.label}{t.href === '/investigations' ? ' 🔒' : ''}</span>
              {t.href === '/approvals' && pendingCount ? (
                <span className="nav-badge" aria-label={`${pendingCount} pending`}>{pendingCount}</span>
              ) : null}
            </Link>
          ))}
        </div>
      ))}
    </nav>
  )
}
