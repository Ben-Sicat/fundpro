import { describe, expect, it } from 'vitest'
import {
  assertCan,
  can,
  charityScopeFor,
  isCharityScoped,
  permissionsFor,
  PermissionError,
  type Actor,
} from './permissions'

const actor = (over: Partial<Actor> = {}): Actor => ({
  id: 'u1',
  role: 'viewer',
  charityId: null,
  ...over,
})

describe('permissionsFor', () => {
  it('gives admin every permission', () => {
    const perms = permissionsFor(actor({ role: 'admin' }))
    expect(perms).toContain('see_pii')
    expect(perms).toContain('approve_payroll')
    expect(perms).toContain('edit_templates')
  })

  it('gives viewer no permissions by default', () => {
    expect(permissionsFor(actor({ role: 'viewer' }))).toHaveLength(0)
  })

  it('scopes operations to reference/PII work, not payroll', () => {
    const perms = permissionsFor(actor({ role: 'operations' }))
    expect(perms).toContain('see_pii')
    expect(perms).not.toContain('see_payroll')
    expect(perms).not.toContain('approve_payroll')
  })

  it('lets per-user overrides replace role defaults', () => {
    const perms = permissionsFor(
      actor({ role: 'viewer', permissions: ['run_exports'] }),
    )
    expect(perms).toEqual(['run_exports'])
  })
})

describe('charity_viewer isolation (MASTER_SPEC security requirement)', () => {
  const cv = (over: Partial<Actor> = {}) =>
    actor({ role: 'charity_viewer', charityId: 'charity-1', ...over })

  it('has no PII, payment or payroll permission', () => {
    const perms = permissionsFor(cv())
    expect(perms).toHaveLength(0)
  })

  it.each(['see_pii', 'see_payment', 'see_payroll', 'approve_payroll'] as const)(
    'cannot be granted %s even by an explicit per-user override',
    (permission) => {
      // The hard ceiling must beat the override — otherwise a misconfigured
      // user row would expose another charity's donor data.
      const escalated = cv({ permissions: [permission] })
      expect(can(escalated, permission)).toBe(false)
      expect(() => assertCan(escalated, permission)).toThrow(PermissionError)
    },
  )

  it('is reported as charity scoped', () => {
    expect(isCharityScoped(cv())).toBe(true)
    expect(isCharityScoped(actor({ role: 'admin' }))).toBe(false)
  })

  it('resolves its scope to its own charity', () => {
    expect(charityScopeFor(cv())).toBe('charity-1')
  })

  it('throws rather than running unscoped when charityId is missing', () => {
    // Returning null here would silently widen access to every charity.
    expect(() => charityScopeFor(cv({ charityId: null }))).toThrow(
      /refusing to run an unscoped query/,
    )
  })

  it('leaves non-charity roles unscoped', () => {
    expect(charityScopeFor(actor({ role: 'admin' }))).toBeNull()
    expect(charityScopeFor(actor({ role: 'payroll' }))).toBeNull()
  })
})

describe('assertCan', () => {
  it('passes when the permission is held', () => {
    expect(() => assertCan(actor({ role: 'admin' }), 'see_pii')).not.toThrow()
  })

  it('throws a 403-shaped error when it is not', () => {
    try {
      assertCan(actor({ role: 'viewer' }), 'see_pii')
      throw new Error('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(PermissionError)
      expect((err as PermissionError).status).toBe(403)
    }
  })
})
