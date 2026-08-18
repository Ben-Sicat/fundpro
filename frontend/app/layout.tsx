import type { Metadata } from 'next'
import { IBM_Plex_Mono, Rubik } from 'next/font/google'
import './globals.css'

/**
 * Typefaces are loaded explicitly rather than relying on `system-ui`.
 *
 * WHY: `system-ui` resolves to a MONOSPACE face on some Linux fontconfig
 * setups — measured on the dev machine, where 'i' and 'M' came out identical
 * widths. The whole UI rendered in a code font, which is a large part of why it
 * read as a developer tool. Naming the faces removes that dependency entirely.
 *
 * Rubik for text: geometric, slightly rounded, friendly at small sizes.
 *
 * IBM Plex Mono for DATA — every figure, amount, date, serial and bank code.
 * This is the one typographic decision the whole design rests on. The subject's
 * own artifacts are monospaced (bank status files, serials like FES48402552,
 * ledger columns), so the face is borrowed from the work rather than applied to
 * it, and it separates "number you act on" from "words about the number"
 * without needing colour or weight to do the job. It replaces Chakra Petch,
 * which was a squared-off display face from an earlier game-console direction.
 */
const rubik = Rubik({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-rubik',
})

const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  display: 'swap',
  variable: '--font-mono-data',
})

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
    <html
      lang="en"
      suppressHydrationWarning
      className={`${rubik.variable} ${mono.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-screen">{children}</body>
    </html>
  )
}
