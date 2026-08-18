import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Badge, Button, Card, CardHeader, Table, Td, Textarea, Th, Tr } from '@/components/ui'
import { StatusBadge } from '@/components/status-badge'
import { LifecycleRail } from '@/components/lifecycle-rail'
import { RetryTicker } from '@/components/retry-ticker'
import { CancellationForm } from '@/components/cancellation-form'
import { getBillingEvents, getPledge, getPledgeNotes } from '@/lib/data'
import { auth } from '@/lib/auth/auth'
import { permissionsFor } from '@/lib/auth/permissions'
import { age, date, dateTime, expiry, money, daysAgo, initials } from '@/lib/format'
import { addNoteAction, setCancellationAction } from './actions'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ serial: string }>
}) {
  const { serial } = await params
  // Serial only — a donor name in the tab title would leak PII into browser
  // history and screen shares.
  return { title: `${serial} · FundPro` }
}

export default async function PledgeDetailPage({
  params,
}: {
  params: Promise<{ serial: string }>
}) {
  const { serial } = await params
  const pledge = await getPledge(serial)
  if (!pledge) notFound()

  const events = await getBillingEvents(serial)
  const notes = await getPledgeNotes(serial)
  const session = await auth()
  const perms = permissionsFor({
    id: session!.user.id,
    role: session!.user.role,
    charityId: session!.user.charityId,
    permissions: session!.user.permissions,
  })
  const canSeePii = perms.includes('see_pii')
  // Notes are open to every internal role; only the external
  // charity viewer is shut out (see actions.ts).
  const canUseNotes = session!.user.role !== 'charity_viewer'
  const canSeePayment = perms.includes('see_payment')
  const canSeePayroll = perms.includes('see_payroll')
  const canEditReference = perms.includes('edit_reference')

  // The seven lifecycle dates, in order — the backbone of all reporting.
  const lifecycle = [
    { label: 'Sign-up', value: pledge.signupDate, note: 'Acquired in the field' },
    { label: 'Submitted to bank', value: pledge.submittedAt, note: 'Lag here is inherent' },
    { label: 'Debit', value: pledge.debitDate, note: 'The money moment' },
    { label: 'Verification', value: pledge.verifiedAt, note: 'Donor phoned and confirmed' },
    { label: 'Cancellation', value: pledge.cancellationDate, note: 'If cancelled' },
    { label: 'Invoice', value: pledge.invoicedDate, note: 'Billed to the charity' },
    { label: 'Payroll', value: pledge.payoutDate, note: 'Commission paid' },
  ]

  return (
    <div className="space-y-6">
      <div>
        <Link href="/app/pledges" className="text-xs text-muted hover:text-primary">
          ← Applications
        </Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="tabular text-xl font-semibold tracking-tight text-primary">
              {pledge.serialNo}
            </h1>
            <StatusBadge pledge={pledge} />
            <Badge tone="neutral">{pledge.charityCode}</Badge>
            {pledge.country === 'MY' ? <Badge tone="accent">Malaysia</Badge> : null}
          </div>
          <div className="flex gap-2">
            {!pledge.verified ? (
              <Button variant="primary" size="sm" disabled title="Coming soon">
                ☎ Record verification call
              </Button>
            ) : null}
            {/* B1 is the lifecycle report; filtered to this one serial. */}
            <a href={`/api/exports/B1?q=${encodeURIComponent(pledge.serialNo)}`} download>
              <Button size="sm">↧ Export row</Button>
            </a>
          </div>
        </div>
      </div>

      {/* ---- Lifecycle rail: the signature element. One track, nodes on it,
              the travelled part lit. See components/lifecycle-rail.tsx ---- */}
      <Card>
        <CardHeader
          title="Lifecycle"
          subtitle="All seven dates are first-class and independently filterable"
        />
        <LifecycleRail steps={lifecycle} format={date} />
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* ---- Pledge ---- */}
        <Card>
          <CardHeader title="Pledge" />
          <dl className="space-y-2.5 text-sm">
            <Row label="Amount">
              <span className="tabular font-semibold text-primary">
                {money(pledge.amount, pledge.currency)}
              </span>{' '}
              <span className="text-xs text-muted">{pledge.currency}</span>
            </Row>
            <Row label="Frequency">{pledge.frequency}</Row>
            <Row label="Charity">{pledge.charityCode}</Row>
            <Row label="Campaign">{pledge.campaignCode}</Row>
            <Row label="Site">{pledge.siteName}</Row>
            <Row label="Location">{pledge.locationName}</Row>
            <Row label="Agent ID">
              <span className="tabular">{pledge.agentId}</span>
            </Row>
            <Row label="Fundraiser">{pledge.fundraiserName}</Row>
            <Row label="Leader">{pledge.leaderName}</Row>
            <Row label="App status">{pledge.appStatus}</Row>
            <Row label="Billing attempts">
              <RetryTicker
                attempts={pledge.attempts}
                failedAttempts={pledge.failedAttempts}
                attemptsToSuccess={pledge.attemptsToSuccess}
              />
            </Row>
          </dl>

          {/* Cancellation is editable here because most cancellations never
              reach a bank status file — see components/cancellation-form. */}
          <div className="mt-5 border-t border-line pt-4">
            <p className="hud mb-2.5 text-[10px] text-muted">Cancellation</p>
            <CancellationForm
              cancellationDate={pledge.cancellationDate}
              cancellationReason={pledge.cancellationReason}
              source={pledge.cancellationSource}
              cancelledBy={pledge.cancelledBy}
              formattedDate={date(pledge.cancellationDate)}
              action={setCancellationAction.bind(null, pledge.serialNo)}
              canEdit={canEditReference}
            />
          </div>
        </Card>

        {/* ---- Donor: role-gated ---- */}
        <Card>
          <CardHeader
            title="Donor"
            action={
              canSeePii ? undefined : (
                <Badge tone="neutral">Restricted</Badge>
              )
            }
          />
          {canSeePii ? (
            <dl className="space-y-2.5 text-sm">
              <Row label="Name">
                <span className="text-primary">{pledge.donorName}</span>
              </Row>
              <Row label="Email">
                <span className="break-all">{pledge.donorEmail}</span>
              </Row>
              <Row label="Mobile">
                <span className="tabular">{pledge.donorMobile}</span>
              </Row>
              <Row label="Age">
                {/* Computed from DOB at read time, never stored. */}
                <span className="tabular">{age(pledge.donorDob)}</span>
              </Row>
              <Row label="Gender">{pledge.gender}</Row>
              <Row label="City">{pledge.city}</Row>
              <Row label="Country">{pledge.country}</Row>
              <Row label="Verified">
                {pledge.verified ? (
                  <Badge tone="good" dot>
                    {pledge.verifiedBy}
                  </Badge>
                ) : (
                  <Badge tone="warning" dot>
                    Not verified
                  </Badge>
                )}
              </Row>
            </dl>
          ) : (
            <p className="text-xs leading-relaxed text-muted">
              Donor contact details are hidden for your role. This is enforced in
              the data layer, not just here.
            </p>
          )}
        </Card>

        {/* ---- Payment: masked only, role-gated ---- */}
        <Card>
          <CardHeader
            title="Payment instrument"
            action={
              canSeePayment ? (
                <Badge tone="neutral">Masked</Badge>
              ) : (
                <Badge tone="neutral">Restricted</Badge>
              )
            }
          />
          {canSeePayment ? (
            <dl className="space-y-2.5 text-sm">
              <Row label="Type">{pledge.instrumentType}</Row>
              <Row label="Card">
                {/* Masked PAN only — a full card number is never stored. */}
                <span className="tabular">{pledge.maskedPan}</span>
              </Row>
              <Row label="Expiry">
                <span className="tabular">{expiry(pledge.expiry)}</span>
              </Row>
              <Row label="Issuing bank">{pledge.issuingBank}</Row>
              <Row label="Processing bank">{pledge.processingBank}</Row>
            </dl>
          ) : (
            <p className="text-xs leading-relaxed text-muted">
              Payment data is hidden for your role.
            </p>
          )}

          {canSeePayroll ? (
            <>
              <div className="my-4 h-px bg-line" />
              <dl className="space-y-2.5 text-sm">
                <Row label="Commission">
                  {pledge.commissionAmount ? (
                    <span className="tabular text-primary">
                      {money(pledge.commissionAmount, pledge.currency)}
                    </span>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </Row>
                <Row label="Payout">
                  {pledge.payoutStatus === 'paid' ? (
                    <Badge tone="good" dot>
                      Paid {date(pledge.payoutDate)}
                    </Badge>
                  ) : pledge.payoutStatus === 'clawed_back' ? (
                    <Badge tone="critical" dot>
                      Clawed back
                    </Badge>
                  ) : (
                    <Badge tone="neutral" dot>
                      Unpaid
                    </Badge>
                  )}
                </Row>
                <Row label="Invoice">
                  {pledge.invoiceNo ? (
                    <span className="tabular">{pledge.invoiceNo}</span>
                  ) : (
                    <span className="text-muted">Not invoiced</span>
                  )}
                </Row>
              </dl>
            </>
          ) : null}
        </Card>
      </div>

      {/* ---- Caller notes: what the verification desk heard on the phone.
              Gated like the donor card — remarks routinely quote the donor. */}
      <Card>
        <CardHeader
          title="Caller notes"
          subtitle="Free text, newest first — anyone on the team can add one. Notes are never edited or deleted; add a correction instead."
          action={canUseNotes ? undefined : <Badge tone="neutral">Restricted</Badge>}
        />
        {canUseNotes ? (
          <div className="space-y-4">
            {/* Keyed by count so a successful submit remounts a blank form. */}
            <form
              key={notes.length}
              action={addNoteAction.bind(null, pledge.serialNo)}
              className="space-y-2"
            >
              <label htmlFor="note-text" className="sr-only">
                Add a note
              </label>
              <Textarea
                id="note-text"
                name="text"
                rows={3}
                required
                maxLength={2000}
                placeholder="What did the donor say? e.g. “No answer at 10am — retry after office hours.”"
              />
              <div className="flex justify-end">
                <Button type="submit" variant="primary" size="sm">
                  Add note
                </Button>
              </div>
            </form>

            {notes.length === 0 ? (
              <p className="py-4 text-center text-xs text-muted">
                No calls logged for this application yet.
              </p>
            ) : (
              <ol className="space-y-3">
                {notes.map((n) => (
                  <li key={n.id} className="flex gap-3 rounded-lg border border-line bg-surface-2 p-3">
                    <span
                      aria-hidden
                      className="grid size-8 shrink-0 place-items-center rounded-full bg-surface-3 text-[11px] font-bold text-secondary"
                    >
                      {initials(n.author)}
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs text-muted">
                        <span className="font-semibold text-secondary">{n.author}</span>
                        {' · '}
                        <span className="tabular">{dateTime(n.createdAt)}</span>
                      </p>
                      <p className="mt-1 text-sm leading-relaxed text-primary">{n.text}</p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        ) : (
          <p className="text-xs leading-relaxed text-muted">
            Caller notes quote donor conversations, so they are hidden from
            charity viewers along with the rest of the donor’s details.
          </p>
        )}
      </Card>

      {/* ---- Billing history ---- */}
      <Card>
        <CardHeader
          title="Billing history"
          subtitle="Append-only. Current status is derived from the latest event — history is never overwritten."
        />
        {events.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted">
            No bank outcomes yet. This application has not been through a billing
            run.
          </p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Status date</Th>
                <Th align="right">Attempt</Th>
                <Th align="right">Status ID</Th>
                <Th>Description</Th>
                <Th>Reason</Th>
                <Th>Bank batch</Th>
                <Th align="right">Days ago</Th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <Tr key={e.id}>
                  <Td className="tabular whitespace-nowrap text-primary">
                    {date(e.statusDate)}
                  </Td>
                  <Td align="right" className="tabular">
                    {e.attemptNo}
                  </Td>
                  <Td align="right" className="tabular">
                    {e.statusId}
                  </Td>
                  <Td>{e.statusDescription}</Td>
                  <Td>
                    {e.reason ? (
                      <span title={e.reasonDesc ?? undefined}>
                        <Badge tone="warning">{e.reason}</Badge>
                      </span>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </Td>
                  <Td className="tabular text-xs">{e.bankBatchNo}</Td>
                  <Td align="right" className="tabular">
                    {daysAgo(e.statusDate)}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-xs text-muted">{label}</dt>
      <dd className="min-w-0 text-right text-secondary">{children}</dd>
    </div>
  )
}
