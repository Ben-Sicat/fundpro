'use client'

/**
 * Fullscreen toggle for wall-display mode.
 *
 * Requesting fullscreen must come from a user gesture — browsers reject it
 * otherwise — so this is a button rather than something automatic on load.
 *
 * The controls fade out when the mouse is still, so a mounted TV shows only
 * the numbers. They come back on any movement, which is what someone walking
 * up to the screen will do.
 */
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { cx } from '@/components/ui'

export function ShowcaseControls() {
  const [isFull, setIsFull] = useState(false)
  const [idle, setIdle] = useState(false)

  useEffect(() => {
    const onChange = () => setIsFull(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const wake = () => {
      setIdle(false)
      clearTimeout(timer)
      timer = setTimeout(() => setIdle(true), 4000)
    }
    wake()
    window.addEventListener('mousemove', wake)
    window.addEventListener('touchstart', wake)
    window.addEventListener('keydown', wake)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('mousemove', wake)
      window.removeEventListener('touchstart', wake)
      window.removeEventListener('keydown', wake)
    }
  }, [])

  const toggle = useCallback(async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await document.documentElement.requestFullscreen()
    } catch {
      // Fullscreen can be blocked by policy; the page still works as-is, so
      // there is nothing useful to tell the user here.
    }
  }, [])

  return (
    <div
      className={cx(
        'fixed right-4 top-4 z-50 flex items-center gap-2 transition-opacity duration-500',
        idle ? 'opacity-0' : 'opacity-100',
      )}
    >
      <button
        type="button"
        onClick={toggle}
        className="rounded-md border border-line-strong bg-surface-2/80 px-3 py-2 text-xs font-semibold text-secondary backdrop-blur transition-colors hover:text-primary"
      >
        {isFull ? '⤡ Exit fullscreen' : '⤢ Fullscreen'}
      </button>
      {!isFull ? (
        <Link
          href="/app"
          className="rounded-md border border-line-strong bg-surface-2/80 px-3 py-2 text-xs font-semibold text-secondary backdrop-blur transition-colors hover:text-primary"
        >
          ✕ Close
        </Link>
      ) : null}
    </div>
  )
}
