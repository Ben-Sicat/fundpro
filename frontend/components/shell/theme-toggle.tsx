'use client'

/**
 * Theme toggle. Stamps `data-theme` on <html>, which our CSS scopes are written
 * to let win over the OS preference in both directions.
 */
import { useEffect, useState } from 'react'

type Theme = 'light' | 'dark' | 'system'

const ICONS: Record<Theme, string> = { light: '☀', dark: '☾', system: '◐' }
const NEXT: Record<Theme, Theme> = {
  system: 'light',
  light: 'dark',
  dark: 'system',
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('system')

  // Read the persisted choice after mount. Doing this during render would
  // produce server/client mismatch, since the server has no localStorage.
  useEffect(() => {
    const saved = window.localStorage.getItem('fundpro-theme') as Theme | null
    if (saved === 'light' || saved === 'dark' || saved === 'system') {
      setTheme(saved)
    }
  }, [])

  useEffect(() => {
    const root = document.documentElement
    if (theme === 'system') root.removeAttribute('data-theme')
    else root.setAttribute('data-theme', theme)
    window.localStorage.setItem('fundpro-theme', theme)
  }, [theme])

  return (
    <button
      type="button"
      onClick={() => setTheme(NEXT[theme])}
      title={`Theme: ${theme}. Click for ${NEXT[theme]}.`}
      aria-label={`Switch theme, currently ${theme}`}
      className="inline-flex size-8 items-center justify-center rounded-lg border border-line-strong bg-surface text-sm text-secondary transition-colors hover:bg-surface-2 hover:text-primary"
    >
      <span aria-hidden>{ICONS[theme]}</span>
    </button>
  )
}
