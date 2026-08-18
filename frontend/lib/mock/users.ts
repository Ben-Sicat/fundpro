/**
 * ONLY REMAINING MOCK IN THE APP: sign-in accounts.
 *
 * The mock DATA layer is gone — every figure in the product now comes from
 * a file somebody uploaded. These are credentials, not data, and they exist
 * because Supabase auth is not wired up yet. Delete this file the moment it
 * is, and never seed it with a real person.
 */
/**
 * Mock user store — the app runs with no database while the UI is mock-driven.
 *
 * Passwords are plaintext HERE ONLY because these are throwaway demo accounts
 * that exist solely in source. When auth moves to Supabase, this file is
 * deleted and `authorize` queries the users table for a bcrypt hash — it must
 * never become the pattern for real credentials.
 */
import type { UserRole } from '@/db/auth-schema'

export interface MockUser {
  id: string
  email: string
  password: string
  name: string
  role: UserRole
  /** Required for charity_viewer: restricts every read to this charity. */
  charityCode: string | null
}

export const MOCK_USERS: MockUser[] = [
  {
    id: 'usr_admin',
    email: 'admin@fundpro.local',
    password: 'demo1234',
    name: 'Ben Sicat',
    role: 'admin',
    charityCode: null,
  },
  {
    id: 'usr_ops',
    email: 'ops@fundpro.local',
    password: 'demo1234',
    name: 'Rhea Santos',
    role: 'operations',
    charityCode: null,
  },
  {
    id: 'usr_payroll',
    email: 'payroll@fundpro.local',
    password: 'demo1234',
    name: 'Marco Reyes',
    role: 'payroll',
    charityCode: null,
  },
  {
    id: 'usr_stc',
    email: 'stc@fundpro.local',
    password: 'demo1234',
    name: 'STC Programme Lead',
    role: 'charity_viewer',
    charityCode: 'STC',
  },
]

export function findMockUser(email: string, password: string): MockUser | null {
  const user = MOCK_USERS.find(
    (u) => u.email.toLowerCase() === email.trim().toLowerCase(),
  )
  if (!user || user.password !== password) return null
  return user
}
