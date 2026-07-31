import type { Metadata } from 'next'
import { Chakra_Petch, Rubik } from 'next/font/google'
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
 * Chakra Petch for headings and figures: squared-off and technical-sporty,
 * which is the game-console voice without being a novelty face.
 */
const rubik = Rubik({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-rubik',
})

const chakra = Chakra_Petch({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  display: 'swap',
  variable: '--font-chakra',
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
      className={`${rubik.variable} ${chakra.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-screen">{children}</body>
    </html>
  )
}
