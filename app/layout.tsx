import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'FundPro · Donor Management',
  description:
    'Consolidates F2F fundraising data: upload bank status reports, match on serial no, export the master copies.',
}

/**
 * Applies the saved theme before first paint.
 *
 * Without this the page renders in the OS theme, then the React toggle
 * corrects it after hydration — a visible flash. Inlined and run synchronously
 * in <head> so it executes before the body paints.
 */
const THEME_SCRIPT = `
try {
  var t = localStorage.getItem('fundpro-theme');
  if (t === 'light' || t === 'dark') {
    document.documentElement.setAttribute('data-theme', t);
  }
} catch (e) {}
`

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-screen">{children}</body>
    </html>
  )
}
