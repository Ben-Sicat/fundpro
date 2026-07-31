/**
 * Role and permission model — the single source of truth for authorization.
 *
 * These are pure functions with no I/O so they are cheap to unit test, and
 * every service must consult them rather than re-deriving access rules.
 *
 * The critical invariant (MASTER_SPEC §Security): a `charity_viewer` is scoped
 * to exactly ONE charity and can NEVER see donor contact details, payment data
 * or payroll data. Enforced in the service layer, not just the UI.
 */
import { PERMISSIONS, type Permission, type UserRole } from '@/db/auth-schema'

/** Default permission set per role. Per-user overrides may narrow or widen. */
const ROLE_DEFAULTS: Record<UserRole, readonly Permission[]> = {
  admin: PERMISSIONS,
  operations: ['see_pii', 'see_payment', 'run_exports', 'edit_reference'],
  payroll: ['see_payroll', 'approve_payroll', 'run_exports'],
  viewer: [],
  // Deliberately empty: a charity_viewer gets no PII, payment or payroll
  // permission, and cannot be granted them (see `can`).
  charity_viewer: [],
}

/**
 * Permissions a charity_viewer may never hold, regardless of role defaults or
 * per-user overrides. This is a hard ceiling, not a default.
 */
const CHARITY_VIEWER_FORBIDDEN: readonly Permission[] = [
  'see_pii',
  'see_payment',
  'see_payroll',
  'approve_payroll',
  'edit_reference',
  'edit_templates',
]

export interface Actor {
  id: string
  role: UserRole
  /** Set iff role === 'charity_viewer'. */
  charityId: string | null
  /** Per-user overrides; null/undefined = use role defaults. */
  permissions?: readonly Permission[] | null
}

/** Effective permissions for an actor, after applying the hard ceiling. */
export function permissionsFor(actor: Actor): readonly Permission[] {
  const granted = actor.permissions ?? ROLE_DEFAULTS[actor.role] ?? []
  if (actor.role === 'charity_viewer') {
    return granted.filter((p) => !CHARITY_VIEWER_FORBIDDEN.includes(p))
  }
  return granted
}

export function can(actor: Actor, permission: Permission): boolean {
  return permissionsFor(actor).includes(permission)
}

/**
 * The charity a query must be restricted to, or null for unrestricted.
 * Throws for a charity_viewer with no scope — that would silently widen
 * access to every charity, so failing loudly is the safe behaviour.
 */
export function charityScopeFor(actor: Actor): string | null {
  if (actor.role !== 'charity_viewer') return null
  if (!actor.charityId) {
    throw new Error(
      `charity_viewer ${actor.id} has no charityId; refusing to run an unscoped query.`,
    )
  }
  return actor.charityId
}

export function isCharityScoped(actor: Actor): boolean {
  return actor.role === 'charity_viewer'
}

/** Throws unless the actor holds `permission`. Use at service entry points. */
export function assertCan(actor: Actor, permission: Permission): void {
  if (!can(actor, permission)) {
    throw new PermissionError(
      `Role '${actor.role}' lacks permission '${permission}'.`,
    )
  }
}

export class PermissionError extends Error {
  readonly status = 403
  constructor(message: string) {
    super(message)
    this.name = 'PermissionError'
  }
}
