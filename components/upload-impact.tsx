import { Badge, Button, cx } from '@/components/ui'
import type { UploadImpact } from '@/lib/exports/presets'
import { count } from '@/lib/format'

/**
 * What a consolidation run made newly true, and the exports that just became
 * worth sending.
 *
 * The point of showing this next to the upload: nobody has to know the report
 * catalogue. The file says what changed, and the changes name their own
 * follow-up.
 */
export function UploadImpactPanel({
  impact,
  filename,
}: {
  impact: UploadImpact
  filename: string
}) {
  const tallies = [
    { label: 'newly approved', value: impact.newlyApproved, tone: 'good' as const },
    { label: 'now retrying', value: impact.newlyRetrying, tone: 'warning' as const },
    { label: 'failed for good', value: impact.newlyFailedFinal, tone: 'critical' as const },
    { label: 'cancelled', value: impact.newlyCancelled, tone: 'neutral' as const },
    { label: 'would not consolidate', value: impact.exceptions, tone: 'critical' as const },
  ].filter((t) => t.value > 0)

  if (tallies.length === 0 && impact.suggested.length === 0) {
    return (
      <p className="text-xs text-muted">
        This file changed nothing — every row already matched what was on record.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs text-muted">
          <span className="tabular font-medium text-primary">{filename}</span>{' '}
          consolidated into the master
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {tallies.map((t) => (
            <Badge key={t.label} tone={t.tone} dot>
              <span className="tabular font-semibold">{count(t.value)}</span>{' '}
              {t.label}
            </Badge>
          ))}
        </div>
      </div>

      {impact.suggested.length > 0 ? (
        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted">
            Exports this just made relevant
          </p>
          <ul className="space-y-1.5">
            {impact.suggested.map((s) => (
              <li
                key={s.code}
                className={cx(
                  'flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-2',
                  s.urgent ? 'border-line-strong bg-surface-2' : 'border-line',
                )}
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <span className="tabular shrink-0 rounded bg-accent-soft px-1.5 py-0.5 text-[10px] font-bold text-accent">
                    {s.code}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-medium text-primary">
                      {s.name}
                    </span>
                    <span className="block truncate text-[11px] text-muted">
                      {s.reason}
                    </span>
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {s.piiLevel === 'full' ? (
                    <Badge tone="critical">PII</Badge>
                  ) : s.piiLevel === 'none' ? (
                    <Badge tone="good">No PII</Badge>
                  ) : (
                    <Badge tone="warning">Masked</Badge>
                  )}
                  <Button size="sm" variant={s.urgent ? 'primary' : 'secondary'}>
                    ↧ Generate
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
