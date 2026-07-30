import type { Metadata } from 'next'
import Link from 'next/link'
import {
  Badge,
  Button,
  Card,
  CardHeader,
  SectionTitle,
  Table,
  Td,
  Th,
  Tr,
} from '@/components/ui'
import { UploadImpactPanel } from '@/components/upload-impact'
import {
  getExportRuns,
  getPresetSummaries,
  getUploadImpact,
  getUploads,
} from '@/lib/data'
import {
  AUDIENCE_BLURB,
  AUDIENCE_ORDER,
  type ExportPreset,
} from '@/lib/exports/presets'
import { count, date } from '@/lib/format'

export const metadata: Metadata = { title: 'Exports · FundPro' }

function PiiBadge({ level }: { level: ExportPreset['piiLevel'] }) {
  if (level === 'none') return <Badge tone="good">No PII</Badge>
  if (level === 'masked') return <Badge tone="warning">Masked</Badge>
  return <Badge tone="critical">Contains PII</Badge>
}

export default async function ExportsPage() {
  const [presets, runs, uploads] = await Promise.all([
    getPresetSummaries(),
    getExportRuns(),
    getUploads(),
  ])

  const latest = uploads[0]
  const latestImpact = latest ? await getUploadImpact(latest.id) : null

  const grouped = AUDIENCE_ORDER.map((audience) => ({
    audience,
    items: presets.filter((p) => p.audience === audience),
  })).filter((g) => g.items.length > 0)

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-primary">
          Exports
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
Every report you need, ready to download. Each one shows how many rows you will get before you make it.
        </p>
      </div>

      {/* ---- Upload-driven suggestions come first: this is usually why
              someone opened this page. ---- */}
      {latest && latestImpact && latestImpact.suggested.length > 0 ? (
        <div>
          <SectionTitle hint="derived from the newest upload">
            Suggested right now
          </SectionTitle>
          <Card glass>
            <UploadImpactPanel impact={latestImpact} filename={latest.filename} />
            <p className="mt-4 border-t border-line pt-3 text-[11px] text-muted">
              These are the same reports listed below, pre-filtered to just what
              this file changed.{' '}
              <Link href="/app/uploads" className="text-accent hover:underline">
                See all uploads →
              </Link>
            </p>
          </Card>
        </div>
      ) : null}

      {/* ---- The catalogue, by audience ---- */}
      {grouped.map(({ audience, items }) => (
        <div key={audience}>
          <SectionTitle hint={AUDIENCE_BLURB[audience]}>{audience}</SectionTitle>

          {audience === 'Safety net' ? (
            // The legacy masters get cards rather than a table row: they are the
            // org's fallback and the reason the platform is trustworthy.
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              {items.map((t) => (
                <Card key={t.code} glass className="flex flex-col">
                  <div className="flex items-center gap-2">
                    <span className="tabular rounded-md bg-accent-soft px-1.5 py-0.5 text-[10px] font-bold text-accent">
                      {t.code}
                    </span>
                    <h3 className="truncate text-sm font-semibold text-primary">
                      {t.name}
                    </h3>
                  </div>
                  <p className="mt-2 flex-1 text-xs leading-relaxed text-muted">
                    {t.description}
                  </p>
                  <p className="mt-2 text-[11px] italic text-muted">{t.when}</p>
                  <div className="mt-4 flex items-center justify-between gap-2 border-t border-line pt-3">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="tabular text-xs text-muted">
                        {t.columnCount} cols
                      </span>
                      {t.rows !== null ? (
                        <span className="tabular text-xs font-medium text-primary">
                          {count(t.rows)} rows
                        </span>
                      ) : null}
                      <PiiBadge level={t.piiLevel} />
                    </span>
                    <Button variant="primary" size="sm">
                      ↧ Generate
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <Card padded={false}>
              <Table>
                <thead>
                  <tr>
                    <Th className="pl-5">Report</Th>
                    <Th>When you would send it</Th>
                    <Th align="right">Rows</Th>
                    <Th align="right">Cols</Th>
                    <Th>Data</Th>
                    <Th>Cadence</Th>
                    <Th align="right" className="pr-5"></Th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((t) => (
                    <Tr key={t.code}>
                      <Td className="pl-5">
                        <span className="flex items-center gap-2">
                          <span className="tabular shrink-0 rounded bg-surface-3 px-1.5 py-0.5 text-[10px] font-bold text-secondary">
                            {t.code}
                          </span>
                          <span className="min-w-0">
                            <span className="block font-medium text-primary">
                              {t.name}
                            </span>
                            <span className="block max-w-md truncate text-[11px] text-muted">
                              {t.description}
                            </span>
                          </span>
                        </span>
                      </Td>
                      <Td className="max-w-xs text-xs">{t.when}</Td>
                      <Td align="right" className="tabular">
                        {t.rows !== null ? (
                          count(t.rows)
                        ) : (
                          // An aggregate report is not row-per-application, so a
                          // pledge count here would be a wrong number.
                          <span className="text-muted" title="Aggregate report">
                            —
                          </span>
                        )}
                      </Td>
                      <Td align="right" className="tabular">
                        {t.columnCount}
                      </Td>
                      <Td>
                        <PiiBadge level={t.piiLevel} />
                      </Td>
                      <Td className="text-xs">
                        {t.cadence ? (
                          <Badge tone="accent">{t.cadence}</Badge>
                        ) : (
                          <span className="text-muted">On demand</span>
                        )}
                      </Td>
                      <Td align="right" className="pr-5">
                        <span className="flex justify-end gap-1.5">
                          {t.cadence ? <Button size="sm">Schedule</Button> : null}
                          <Button size="sm" variant="primary">
                            ↧ Generate
                          </Button>
                        </span>
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </Card>
          )}
        </div>
      ))}

      {/* ---- Audit trail ---- */}
      <div>
        <SectionTitle hint="a record of every file downloaded">
          Recent exports
        </SectionTitle>
        <Card>
          <CardHeader
            title="Export log"
            subtitle="Who downloaded what, and when"
          />
          <Table>
            <thead>
              <tr>
                <Th>File</Th>
                <Th>Report</Th>
                <Th>Run</Th>
                <Th>By</Th>
                <Th align="right">Rows</Th>
                <Th>Contents</Th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <Tr key={r.id}>
                  <Td className="tabular text-xs text-primary">{r.fileName}</Td>
                  <Td>
                    <span className="flex items-center gap-1.5">
                      <span className="tabular text-[10px] font-bold text-muted">
                        {r.templateCode}
                      </span>
                      {r.templateName}
                    </span>
                  </Td>
                  <Td className="whitespace-nowrap">{date(r.runAt)}</Td>
                  <Td className="text-xs">{r.runBy}</Td>
                  <Td align="right" className="tabular">
                    {count(r.rowCount)}
                  </Td>
                  <Td>
                    {r.containsPii ? (
                      <Badge tone="critical" dot>
                        PII
                      </Badge>
                    ) : (
                      <Badge tone="good" dot>
                        Aggregate only
                      </Badge>
                    )}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Card>
      </div>
    </div>
  )
}
