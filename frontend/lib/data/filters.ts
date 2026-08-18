/**
 * The filter vocabulary, shared by server and client.
 *
 * Its own module because client components (the filter bar, the preset
 * definitions) need these types and labels, while `index.ts` reaches the
 * `server-only` API client. Importing the seam from a client component would
 * otherwise drag the whole server graph into the browser bundle.
 */

/** Which of the seven lifecycle dates a date filter applies to. */
export type DateBasis =
  | 'signupDate'
  | 'submittedAt'
  | 'debitDate'
  | 'verifiedAt'
  | 'cancellationDate'
  | 'invoicedDate'
  | 'payoutDate'

export const DATE_BASIS_LABELS: Record<DateBasis, string> = {
  signupDate: 'Sign-up date',
  submittedAt: 'Submitted to bank',
  debitDate: 'Debit date',
  verifiedAt: 'Verification date',
  cancellationDate: 'Cancellation date',
  invoicedDate: 'Invoice date',
  payoutDate: 'Payroll date',
}

export interface PledgeFilters {
  q?: string
  charityCode?: string
  status?: 'realized' | 'retrying' | 'failed' | 'cancelled' | 'pending'
  fundraiserName?: string
  siteName?: string
  /** Matches any fundraiser who reports to this leader, primary or not. */
  leaderName?: string
  /** Verification-call gate: false selects the backlog still awaiting a call. */
  verified?: boolean
  basis?: DateBasis
  from?: string
  to?: string
}
