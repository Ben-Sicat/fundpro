import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Badge, Button, Card, CardHeader, Table, Td, Th, Tr } from '@/components/ui'
import { StatusBadge } from '@/components/status-badge'
import { getBillingEvents, getPledge } from '@/lib/data'
import { auth } from '@/lib/auth/auth'
import { permissionsFor } from '@/lib/auth/permissions'
import { age, date, expiry, money, daysAgo } from '@/lib/format'

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
  const session = await auth()
  const perms = permissionsFor({
    id: session!.user.id,
    role: session!.user.role,
    charityId: session!.user.charityId,
    permissions: session!.user.permissions,
  })
  const canSeePii = perms.includes('see_pii')
  const canSeePayment = perms.includes('see_payment')
  const canSeePayroll = perms.includes('see_payroll')

  // The seven lifecycle dates, in order — the backbone of all reporting.
  const lifecycle = [
    { n: 1, label: 'Sign-up', value: pledge.signupDate, note: 'Acquired in the field' },
    { n: 2, label: 'Submitted to bank', value: pledge.submittedAt, note: 'Lag here is inherent' },
    { n: 3, label: 'Debit', value: pledge.debitDate, note: 'The money moment' },
    { n: 4, label: 'Verification', value: pledge.verifiedAt, note: 'Donor phoned and confirmed' },
    { n: 5, label: 'Cancellation', value: pledge.cancellationDate, note: 'If cancelled' },
    { n: 6, label: 'Invoice', value: pledge.invoicedDate, note: 'Billed to the charity' },
    { n: 7, label: 'Payroll', value: pledge.payoutDate, note: 'Commission paid' },
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
              <Button variant="primary" size="sm">
                ☎ Record verification call
              </Button>
            ) : null}
            <Button size="sm">↧ Export row</Button>
          </div>
        </div>
      </div>

      {/* ---- Lifecycle rail ---- */}
      <Card>
        <CardHeader
          title="Lifecycle"
          subtitle="All seven dates are first-class and independently filterable"
        />
        <ol className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          {lifecycle.map((step) => {
            const done = Boolean(step.value)
            return (
              <li
                key={step.n}
                className={`rounded-lg border p-3 ${
                  done ? 'border-line bg-surface-2' : 'border-dashed border-line'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <span
                    className={`grid size-4 place-items-center rounded-full text-[9px] font-bold ${
                      done
                        ? 'bg-accent text-on-accent'
                        : 'bg-surface-3 text-muted'
                    }`}
                    aria-hidden
                  >
                    {step.n}
                  </span>
                  <span className="text-[11px] font-medium text-secondary">
                    {step.label}
                  </span>
                </div>
                <p
                  className={`tabular mt-1.5 text-sm font-semibold ${
                    done ? 'text-primary' : 'text-muted'
                  }`}
                >
                  {date(step.value)}
                </p>
                <p className="mt-0.5 text-[10px] leading-tight text-muted">
                  {step.note}
                </p>
              </li>
            )
          })}
        </ol>
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
          </dl>
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
