import type { Metadata } from 'next'
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
import { StatTile } from '@/components/charts/stat-tile'
import { UploadImpactPanel } from '@/components/upload-impact'
import { getExceptions, getUploadImpact, getUploads } from '@/lib/data'
import { count, date, dateTime } from '@/lib/format'
import { UploadForm } from '@/components/upload-form'
import { uploadAction, resolveExceptionAction, addStatusCodeAction } from './actions'
import { FixStatusCode } from '@/components/fix-status-code'
import { backendEnabled } from '@/lib/api/client'

export const metadata: Metadata = { title: 'Uploads · FundPro' }

/** Pull the offending code out of "STATUS ID 61 is not in the dictionary…". */
function statusIdIn(detail: string): number | null {
  const match = /STATUS ID (\d+)/.exec(detail)
  return match ? Number(match[1]) : null
}

const PROBLEM_LABELS: Record<string, string> = {
  no_matching_pledge: 'Not on file',
  name_mismatch: 'Name mismatch',
  pan_mismatch: 'Card mismatch',
  unknown_status_id: 'New bank code',
  parse_error: 'Could not read',
}

export default async function UploadsPage() {
  const [uploads, exceptions] = await Promise.all([getUploads(), getExceptions()])

  const open = exceptions.filter((e) => !e.resolved)
  const totalRows = uploads.reduce((s, u) => s + u.rowCount, 0)
  const totalMatched = uploads.reduce((s, u) => s + u.matchedCount, 0)

  // The most recent consolidation drives the "what now?" panel.
  const latest = uploads[0]
  const latestImpact = latest ? await getUploadImpact(latest.id) : null

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-primary">
            Uploads
          </h1>
          <p className="mt-1 text-sm text-muted">
            Drop in the file the bank sends you. Everything is matched up and
            filed automatically.
          </p>
        </div>
      </div>

      {/* ---- Dropzone ---- */}
      <Card className="border-dashed">
        <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
          <span
            className="grid size-11 place-items-center rounded-xl text-lg text-on-accent shadow-sm"
            style={{
              background: 'linear-gradient(135deg, var(--series-1), var(--series-3))',
            }}
            aria-hidden
          >
            ↥
          </span>
          <div>
            <p className="text-sm font-medium text-primary">
              Drop an .xlsx file here
            </p>
            <p className="mt-1 text-xs text-muted">
A bank Status Report or an Apps Tracker — we work out which it is.
            </p>
          </div>
          <UploadForm action={uploadAction} enabled={backendEnabled()} />
          <p className="max-w-md text-[11px] leading-relaxed text-muted">
Messy spreadsheets are fine. Anything we cannot read is set aside for review instead of stopping the whole file.
          </p>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Files filed" value={count(uploads.length)} hint="uploads consolidated" />
        <StatTile label="Rows read" value={count(totalRows)} hint="across every file" />
        <StatTile label="Rows matched" value={count(totalMatched)} hint="linked to a donor" />
        <StatTile
          label="Needs review"
          value={count(open.length)}
          hint={open.length ? 'need review' : 'all clear'}
        />
      </div>

      {/* ---- What the last consolidation changed, and what to send now ---- */}
      {latest && latestImpact ? (
        <div>
          <SectionTitle hint="what this file changed">
            Last consolidation
          </SectionTitle>
          <Card>
            <CardHeader
              title="What changed"
              subtitle={`Consolidated ${dateTime(latest.uploadedAt)} by ${latest.uploadedBy}`}
            />
            <UploadImpactPanel impact={latestImpact} filename={latest.filename} />
          </Card>
        </div>
      ) : null}

      {/* ---- Exceptions queue ---- */}
      {open.length > 0 ? (
        <div>
          <SectionTitle hint="set aside for someone to look at">
            Needs a look
          </SectionTitle>
          <Card>
            <Table>
              <thead>
                <tr>
                  <Th>Serial no</Th>
                  <Th>Problem</Th>
                  <Th>Detail</Th>
                  <Th hide="lg">From the file</Th>
                  <Th>File</Th>
                  <Th align="right">Action</Th>
                </tr>
              </thead>
              <tbody>
                {open.map((e) => (
                  <Tr key={e.id}>
                    <Td className="tabular text-primary">
                      {e.serialNo ?? <span className="text-muted">—</span>}
                    </Td>
                    <Td>
                      <Badge
                        tone={e.problem === 'parse_error' ? 'critical' : 'warning'}
                        dot
                      >
                        {PROBLEM_LABELS[e.problem]}
                      </Badge>
                    </Td>
                    <Td className="text-xs">{e.detail}</Td>
                    <Td hide="lg" className="tabular text-xs text-muted">{e.rawSummary}</Td>
                    <Td className="text-xs">{e.filename}</Td>
                    <Td align="right">
                      <span className="flex justify-end gap-1.5">
                        {e.problem === 'unknown_status_id' && statusIdIn(e.detail) ? (
                          <FixStatusCode
                            statusId={statusIdIn(e.detail)!}
                            action={addStatusCodeAction.bind(null, statusIdIn(e.detail)!)}
                          />
                        ) : null}
                        <form action={resolveExceptionAction.bind(null, e.id)}>
                          <Button size="sm" type="submit">
                            Resolve
                          </Button>
                        </form>
                      </span>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </Card>
        </div>
      ) : null}

      {/* ---- History ---- */}
      <div>
        <SectionTitle>Everything uploaded so far</SectionTitle>
        <Card>
          <Table>
            <thead>
              <tr>
                <Th>File</Th>
                <Th>Type</Th>
                <Th>Uploaded</Th>
                <Th>By</Th>
                <Th align="right">Rows</Th>
                <Th align="right">Matched</Th>
                <Th align="right">New</Th>
                <Th align="right">Exceptions</Th>
                <Th>Status</Th>
                <Th align="right"></Th>
              </tr>
            </thead>
            <tbody>
              {uploads.map((u) => (
                <Tr key={u.id}>
                  <Td className="font-medium text-primary">{u.filename}</Td>
                  <Td>
                    <Badge tone="neutral">
                      {u.sourceType === 'status_report' ? 'Status Report' : 'Apps Tracker'}
                    </Badge>
                  </Td>
                  <Td className="whitespace-nowrap">{date(u.uploadedAt)}</Td>
                  <Td className="text-xs">{u.uploadedBy}</Td>
                  <Td align="right" className="tabular">
                    {count(u.rowCount)}
                  </Td>
                  <Td align="right" className="tabular">
                    {count(u.matchedCount)}
                  </Td>
                  <Td align="right" className="tabular">
                    {u.newRecordCount ? count(u.newRecordCount) : '—'}
                  </Td>
                  <Td align="right" className="tabular">
                    {u.exceptionCount > 0 ? (
                      <span className="font-medium text-critical-text">
                        {u.exceptionCount}
                      </span>
                    ) : (
                      <span className="text-muted">0</span>
                    )}
                  </Td>
                  <Td>
                    {u.status === 'consolidated' ? (
                      <Badge tone="good" dot>
                        Consolidated
                      </Badge>
                    ) : (
                      <Badge tone="warning" dot>
                        Needs review
                      </Badge>
                    )}
                  </Td>
                  <Td align="right">
                    {/* A3 — the bank schema scoped to this one upload. */}
                    <a href={`/api/exports/A3?upload_id=${u.id}`} download>
                      <Button size="sm">↧ Snapshot</Button>
                    </a>
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
