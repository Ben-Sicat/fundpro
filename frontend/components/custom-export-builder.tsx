'use client'

/**
 * Build your own export: pick columns, get a sheet.
 *
 * The fixed templates each answer a recurring question and matter because
 * finance already has tooling shaped to them. But every week somebody wants a
 * cut nobody wrote a template for — "serial, donor, fundraiser and debit date,
 * for the Cebu sites in July". Rather than growing the catalogue forever, this
 * assembles one from the consolidated data.
 *
 * Columns come from a catalogue the service decides, so a role that cannot see
 * donor contact details is never offered them. The service checks again on
 * build; the list here is a convenience, not the boundary.
 *
 * Chosen order is preserved, because the order is part of the request — people
 * are building a sheet to paste somewhere specific.
 */
import { useMemo, useState } from 'react'
import { Badge, Button, Input, cx } from '@/components/ui'
import type { ExportField } from '@/lib/types'

export function CustomExportBuilder({
  fields,
  /** Current page filters, forwarded so the sheet matches what is on screen. */
  query,
  rowsAvailable,
}: {
  fields: ExportField[]
  query: string
  rowsAvailable: number | null
}) {
  const [chosen, setChosen] = useState<string[]>([
    'serialNo',
    'donorName',
    'amount',
    'debitDate',
  ])
  const [name, setName] = useState('Custom export')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const byGroup = useMemo(() => {
    const groups = new Map<string, ExportField[]>()
    for (const f of fields) {
      const list = groups.get(f.group) ?? []
      list.push(f)
      groups.set(f.group, list)
    }
    return [...groups.entries()]
  }, [fields])

  // Only offer defaults the role can actually export.
  const available = useMemo(() => new Set(fields.map((f) => f.key)), [fields])
  const selected = chosen.filter((k) => available.has(k))

  const includesPii = fields.some(
    (f) => selected.includes(f.key) && f.pii !== 'none',
  )

  function toggle(key: string) {
    setChosen((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    )
  }

  function move(key: string, by: number) {
    setChosen((prev) => {
      const i = prev.indexOf(key)
      const j = i + by
      if (i < 0 || j < 0 || j >= prev.length) return prev
      const next = [...prev]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  }

  async function generate() {
    setBusy(true)
    setError(null)
    try {
      const response = await fetch(`/api/exports/custom${query}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ columns: selected, name }),
      })
      if (!response.ok) {
        const detail = (await response.json().catch(() => ({}))) as {
          error?: string
        }
        setError(detail.error ?? 'That export could not be generated.')
        return
      }
      // Trigger the save without navigating away from the builder.
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download =
        response.headers
          .get('content-disposition')
          ?.match(/filename="([^"]+)"/)?.[1] ?? 'custom.xlsx'
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      setError('That export could not be generated.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      {/* ---- Catalogue ---- */}
      <div className="space-y-5">
        {byGroup.map(([group, groupFields]) => (
          <div key={group}>
            <p className="hud mb-2 text-[10px] text-muted">{group}</p>
            <div className="flex flex-wrap gap-1.5">
              {groupFields.map((f) => {
                const on = selected.includes(f.key)
                return (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => toggle(f.key)}
                    aria-pressed={on}
                    className={cx(
                      'rounded-[var(--r-sm)] border px-2.5 py-1.5 text-xs transition-colors',
                      on
                        ? 'border-transparent bg-accent text-on-accent'
                        : 'border-line-strong bg-surface-2 text-secondary hover:text-primary',
                    )}
                  >
                    {f.label}
                    {f.pii !== 'none' ? (
                      <span
                        className={cx('ml-1.5 text-[9px]', on ? 'opacity-80' : 'text-critical-text')}
                        title={
                          f.pii === 'full'
                            ? 'Personal data'
                            : 'Masked payment data'
                        }
                      >
                        {f.pii === 'full' ? 'PII' : 'CARD'}
                      </span>
                    ) : null}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* ---- The sheet being built ---- */}
      <div className="lg:sticky lg:top-20 lg:self-start">
        <p className="hud mb-2 text-[10px] text-muted">
          Your columns · {selected.length}
        </p>

        {selected.length === 0 ? (
          <p className="rounded-[var(--r)] border border-dashed border-line-strong px-4 py-6 text-center text-xs text-muted">
            Pick a column to start building.
          </p>
        ) : (
          <ol className="mb-3 space-y-1">
            {selected.map((key, i) => {
              const field = fields.find((f) => f.key === key)
              return (
                <li
                  key={key}
                  className="flex items-center gap-2 rounded-[var(--r-sm)] bg-surface-2 px-2.5 py-1.5"
                >
                  <span className="tabular w-4 shrink-0 text-[11px] text-muted">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs text-primary">
                    {field?.label ?? key}
                  </span>
                  <span className="flex shrink-0 gap-0.5">
                    <button
                      type="button"
                      onClick={() => move(key, -1)}
                      disabled={i === 0}
                      className="px-1 text-xs text-muted hover:text-primary disabled:opacity-30"
                      aria-label={`Move ${field?.label ?? key} up`}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => move(key, 1)}
                      disabled={i === selected.length - 1}
                      className="px-1 text-xs text-muted hover:text-primary disabled:opacity-30"
                      aria-label={`Move ${field?.label ?? key} down`}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      onClick={() => toggle(key)}
                      className="px-1 text-xs text-muted hover:text-critical-text"
                      aria-label={`Remove ${field?.label ?? key}`}
                    >
                      ×
                    </button>
                  </span>
                </li>
              )
            })}
          </ol>
        )}

        <label className="mb-1.5 block text-xs font-medium text-secondary" htmlFor="export-name">
          Name this export
        </label>
        <Input
          id="export-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
        />

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            variant="primary"
            onClick={generate}
            disabled={busy || selected.length === 0}
          >
            {busy ? 'Building…' : '↧ Generate'}
          </Button>
          {includesPii ? <Badge tone="critical">Contains PII</Badge> : null}
        </div>

        <p className="mt-2.5 text-[11px] leading-snug text-muted">
          {rowsAvailable === null
            ? 'Uses whatever filters are set on the Applications page.'
            : `${rowsAvailable.toLocaleString()} rows match the current filters.`}
          {includesPii
            ? ' This download is recorded in the audit log as containing personal data.'
            : ''}
        </p>

        {error ? (
          <p className="mt-2 text-xs text-critical-text">{error}</p>
        ) : null}
      </div>
    </div>
  )
}
