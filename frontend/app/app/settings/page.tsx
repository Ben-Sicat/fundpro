import type { Metadata } from 'next'
import {
  Badge,
  Card,
  CardHeader,
  Input,
  Label,
  SectionTitle,
  Select,
  Table,
  Td,
  Th,
  Tr,
} from '@/components/ui'
import { AddStatusCode } from '@/components/add-status-code'
import { getStatusCodes } from '@/lib/data'
import { addStatusCodeFromSettings } from './actions'
import { MOCK_USERS } from '@/lib/mock/users'

export const metadata: Metadata = { title: 'Settings · FundPro' }

/**
 * Settings is where every unconfirmed business rule lives, so the build never
 * blocks on a client answer and no rule is hard-coded in logic.
 */
export default async function SettingsPage() {
  const statusCodes = await getStatusCodes()

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-primary">
          Settings
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Every rule the client has not yet confirmed lives here as
          configuration. Changing one is an admin edit, never a code change.
        </p>
      </div>

      {/* ---- Open rules ---- */}
      <div>
        <SectionTitle hint="inferred from the sample files — confirm with the client">
          Business rules
        </SectionTitle>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader
              title="Payroll"
              action={<Badge tone="warning">Unconfirmed</Badge>}
            />
            <div className="space-y-4">
              <div>
                <Label htmlFor="eligibility">Commission eligibility</Label>
                <Select id="eligibility" defaultValue="on_first_approval" className="w-full">
                  <option value="on_submission">On submission to bank</option>
                  <option value="on_first_approval">On first approved billing</option>
                  <option value="on_n_billings">After N successful billings</option>
                </Select>
                <p className="mt-1.5 text-[11px] text-muted">
                  Whether a fundraiser earns on acquisition alone, or only once
                  the pledge actually bills.
                </p>
              </div>
              <div>
                <Label htmlFor="multiplier">Commission multiplier of pledge amount</Label>
                <Input id="multiplier" defaultValue="3" type="number" step="0.5" />
                <p className="mt-1.5 text-[11px] text-muted">
                  ×3 is the measured mode of the client’s own sheets (383 of 683
                  rows). The full spread is ×0.5, ×1.5, ×2, ×2.5, ×3, ×4 — and
                  frequency, campaign, period and fundraiser were each tested and
                  ruled out as the driver, so it is set here rather than inferred.
                </p>
              </div>
              <div>
                <Label htmlFor="window">Realization window (days)</Label>
                <Input id="window" defaultValue="90" type="number" />
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Frequency mapping"
              action={<Badge tone="critical">Ambiguous</Badge>}
            />
            <p className="mb-3 text-xs leading-relaxed text-muted">
              The source files mix numeric codes with text labels. The meaning of{' '}
              <code>1</code> is genuinely ambiguous — monthly, or once a year? A
              wrong mapping mis-states pledged value on every dashboard.
            </p>
            <Table>
              <thead>
                <tr>
                  <Th>Source value</Th>
                  <Th>Maps to</Th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['1', 'Monthly'],
                  ['3', 'Quarterly'],
                  ['6', 'Semi-Annual'],
                  ['12', 'Monthly'],
                  ['Semi-annual', 'Semi-Annual'],
                ].map(([from, to]) => (
                  <Tr key={from}>
                    <Td className="tabular font-medium text-primary">{from}</Td>
                    <Td>
                      <Select defaultValue={to}>
                        <option>Monthly</option>
                        <option>Quarterly</option>
                        <option>Semi-Annual</option>
                        <option>Annual</option>
                      </Select>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </Card>
        </div>
      </div>

      {/* ---- Status codes ---- */}
      <div>
        <SectionTitle hint="a new bank code is a 30-second edit, never a deploy">
          Bank status codes
        </SectionTitle>
        <Card>
          <CardHeader
            title="Status dictionary"
            subtitle="Logic branches on classification, never on the raw ID. Only 66 and 59 are confirmed by the bank."
            action={<AddStatusCode action={addStatusCodeFromSettings} />}
          />
          <Table>
            <thead>
              <tr>
                <Th align="right">Status ID</Th>
                <Th>Description</Th>
                <Th>Classification</Th>
                <Th>Source</Th>
              </tr>
            </thead>
            <tbody>
              {statusCodes.map((s) => (
                <Tr key={s.statusId}>
                  <Td align="right" className="tabular font-medium text-primary">
                    {s.statusId}
                  </Td>
                  <Td>{s.description}</Td>
                  <Td>
                    <Badge
                      tone={
                        s.classification === 'approved'
                          ? 'good'
                          : s.classification === 'failed_retryable'
                            ? 'warning'
                            : 'critical'
                      }
                      dot
                    >
                      {s.classification}
                    </Badge>
                  </Td>
                  <Td>
                    {s.statusId === 66 || s.statusId === 59 ? (
                      <Badge tone="good">Confirmed</Badge>
                    ) : (
                      <Badge tone="warning">Inferred</Badge>
                    )}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Card>
      </div>

      {/* ---- Charity aliases ---- */}
      <div>
        <SectionTitle hint="the same charity spelled several ways in the source files">
          Charity aliases
        </SectionTitle>
        <Card>
          <Table>
            <thead>
              <tr>
                <Th>Value as it appears</Th>
                <Th>Canonical charity</Th>
              </tr>
            </thead>
            <tbody>
              {[
                ['STC', 'STC'],
                ['UNHCR', 'UNHCR'],
                ['UNHCR MY', 'UNHCR'],
                ['UNHCR Malaysia', 'UNHCR'],
                ['World Vision', 'WV'],
                ['WV', 'WV'],
                ['WWF', 'WWF'],
              ].map(([alias, canonical]) => (
                <Tr key={alias}>
                  <Td className="font-medium text-primary">{alias}</Td>
                  <Td>
                    <Badge tone={alias === canonical ? 'neutral' : 'accent'}>
                      {canonical}
                    </Badge>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Card>
      </div>

      {/* ---- Users ---- */}
      <div>
        <SectionTitle>Users &amp; roles</SectionTitle>
        <Card>
          <CardHeader
            title="Accounts"
            subtitle="charity_viewer is scoped to one charity and can never see donor contact, payment or payroll data."
          />
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Email</Th>
                <Th>Role</Th>
                <Th>Charity scope</Th>
              </tr>
            </thead>
            <tbody>
              {MOCK_USERS.map((u) => (
                <Tr key={u.id}>
                  <Td className="font-medium text-primary">{u.name}</Td>
                  <Td className="text-xs">{u.email}</Td>
                  <Td>
                    <Badge tone={u.role === 'admin' ? 'accent' : 'neutral'}>
                      {u.role.replace('_', ' ')}
                    </Badge>
                  </Td>
                  <Td>
                    {u.charityCode ? (
                      <Badge tone="warning" dot>
                        {u.charityCode} only
                      </Badge>
                    ) : (
                      <span className="text-muted">All charities</span>
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
