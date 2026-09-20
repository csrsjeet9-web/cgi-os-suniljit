import './globals.css'
import type { Metadata, Viewport } from 'next'
import Nav from './_components/Nav'
import BottomNav from './_components/BottomNav'
import ConnStatus from './_components/ConnStatus'
import { getPendingCount } from '@/lib/records'

export const metadata: Metadata = {
  title: 'CGI OS',
  description: 'Compliance, Governance and Integrity — every register on one screen, with robots that ask before they act.',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'CGI OS', statusBarStyle: 'default' },
  icons: { icon: '/icons/logo.svg', apple: '/icons/apple-touch-icon.png' },
}

// theme-color drives the phone status-bar tint when installed to the home screen.
export const viewport: Viewport = {
  themeColor: '#1E3A5F',
  width: 'device-width',
  initialScale: 1,
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const pending = await getPendingCount()
  return (
    <html lang="en">
      <body>
        <div className="app">
          {/* Desktop sidebar — hidden on phones (BottomNav takes over ≤768px). */}
          <aside className="side">
            <div className="brand">
              <img className="logo" src="/icons/logo.svg" alt="" aria-hidden="true" />
              <span>
                CGI OS
                <em>Compliance · Governance · Integrity</em>
              </span>
            </div>
            <Nav pendingCount={pending} />
            <p className="hint">One <code>records</code> table behind every register. Your robots live in <code>agents/</code>.</p>
          </aside>
          <main className="main"><ConnStatus />{children}</main>
        </div>
        {/* Phone bottom bar — hidden on desktop. */}
        <BottomNav />
      </body>
    </html>
  )
}
