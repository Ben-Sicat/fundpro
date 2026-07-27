/**
 * Auth.js v5 tables plus this app's role model.
 *
 * `charity_viewer` users MUST carry a `charityId`; that scope is enforced in
 * the service layer, not just the UI (see /lib/auth/permissions.ts).
 */
import {
  boolean,
  check,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import type { AdapterAccountType } from 'next-auth/adapters'
import { charities } from './schema'

export const USER_ROLES = [
  'admin',
  'operations',
  'payroll',
  'viewer',
  'charity_viewer',
] as const
export type UserRole = (typeof USER_ROLES)[number]

/**
 * Granular permission toggles (§4.6). Roles imply a default set
 * (see /lib/auth/permissions.ts); this column overrides per user.
 */
export const PERMISSIONS = [
  'see_pii',
  'see_payment',
  'see_payroll',
  'run_exports',
  'approve_payroll',
  'edit_reference',
  'edit_templates',
] as const
export type Permission = (typeof PERMISSIONS)[number]

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    name: text('name'),
    email: text('email').notNull().unique(),
    emailVerified: timestamp('email_verified', { withTimezone: true }),
    image: text('image'),
    /** Credentials provider: bcrypt hash. Never a plaintext password. */
    passwordHash: text('password_hash'),
    role: text('role').notNull().default('viewer'),
    /**
     * Required when role = 'charity_viewer': restricts every query to this
     * charity. Null for all other roles.
     */
    charityId: uuid('charity_id').references(() => charities.id),
    /** Per-user permission overrides; null = use the role defaults. */
    permissions: jsonb('permissions'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check(
      'users_role_check',
      sql`${t.role} in ${sql.raw(`(${USER_ROLES.map((r) => `'${r}'`).join(', ')})`)}`,
    ),
    /**
     * Security invariant, enforced by the database and not just the service
     * layer: a charity_viewer without a charity scope would be an
     * unrestricted viewer of every charity's data.
     */
    check(
      'users_charity_viewer_requires_charity',
      sql`${t.role} <> 'charity_viewer' or ${t.charityId} is not null`,
    ),
  ],
)

export const accounts = pgTable(
  'accounts',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').$type<AdapterAccountType>().notNull(),
    provider: text('provider').notNull(),
    providerAccountId: text('provider_account_id').notNull(),
    refresh_token: text('refresh_token'),
    access_token: text('access_token'),
    expires_at: integer('expires_at'),
    token_type: text('token_type'),
    scope: text('scope'),
    id_token: text('id_token'),
    session_state: text('session_state'),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })],
)

export const sessions = pgTable('sessions', {
  sessionToken: text('session_token').primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expires: timestamp('expires', { withTimezone: true }).notNull(),
})

export const verificationTokens = pgTable(
  'verification_tokens',
  {
    identifier: text('identifier').notNull(),
    token: text('token').notNull(),
    expires: timestamp('expires', { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })],
)
