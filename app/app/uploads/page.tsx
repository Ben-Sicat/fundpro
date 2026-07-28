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
import { count, date } from '@/lib/format'

export const metadata: Metadata = { title: 'Uploads · FundPro' }

const PROBLEM_LABELS: Record<string, string> = {
  no_matching_pledge: 'No matching serial',
  name_mismatch: 'Name mismatch',
  pan_mismatch: 'Card mismatch',
  unknown_status_id: 'Unknown status ID',
  parse_error: 'Parse error',
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
            Drop a daily Status Report or an Apps Tracker. Rows are matched on
            SERIAL NO and consolidated into the master.
          </p>
        </div>
      </div>

      {/* ---- Dropzone ---- */}
      <Card glass className="border-dashed">
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
              Drop an .xlsx or .csv here
            </p>
            <p className="mt-1 text-xs text-muted">
              Status Report (26 columns) or Master Apps Tracker (113 columns) —
              the format is detected from the header signature, not the filename.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="primary" size="sm">
              Choose file
            </Button>
            <Button variant="ghost" size="sm">
              View column mapping
            </Button>
          </div>
          <p className="max-w-md text-[11px] leading-relaxed text-muted">
            Parsing is defensive by design: <code>=DATE(2026,7,8)</code> strings,
            comma amounts, and zero-padded MMYY expiries are all normalized. A bad
            row becomes an exception — it never fails the batch.
          </p>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Files consolidated" value={count(uploads.length)} />
        <StatTile label="Rows read" value={count(totalRows)} />
        <StatTile label="Rows matched" value={count(totalMatched)} />
        <StatTile
          label="Open exceptions"
          value={count(open.length)}
          hint={open.length ? 'need review' : 'all clear'}
        />
      </div>

      {/* ---- What the last consolidation changed, and what to send now ---- */}
      {latest && latestImpact ? (
        <div>
          <SectionTitle hint="the upload names its own follow-up">
            Last consolidation
          </SectionTitle>
          <Card glass>
            <CardHeader
              title="What changed"
              subtitle={`Consolidated ${date(latest.uploadedAt)} by ${latest.uploadedBy}`}
            />
            <UploadImpactPanel impact={latestImpact} filename={latest.filename} />
          </Card>
        </div>
      ) : null}

      {/* ---- Exceptions queue ---- */}
      {open.length > 0 ? (
        <div>
          <SectionTitle hint="a bad row never fails the batch — it lands here">
            Exceptions queue
          </SectionTitle>
          <Card>
            <Table>
              <thead>
                <tr>
                  <Th>Serial no</Th>
                  <Th>Problem</Th>
                  <Th>Detail</Th>
                  <Th>Raw row</Th>
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
                    <Td className="tabular text-xs text-muted">{e.rawSummary}</Td>
                    <Td className="text-xs">{e.filename}</Td>
                    <Td align="right">
                      <span className="flex justify-end gap-1.5">
                        {e.problem === 'unknown_status_id' ? (
                          <Button size="sm" variant="primary">
                            Add status code
                          </Button>
                        ) : null}
                        <Button size="sm">Resolve</Button>
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
        <SectionTitle>Upload history</SectionTitle>
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
                    <Button size="sm">↧ Snapshot</Button>
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
