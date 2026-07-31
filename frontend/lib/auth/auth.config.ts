/**
 * Edge-safe half of the Auth.js config.
 *
 * Middleware runs on the edge runtime, which cannot load `postgres` or
 * `bcryptjs`. Keeping the providers/adapter out of this file lets middleware
 * import it for route protection without pulling in Node-only dependencies.
 * The full config lives in lib/auth/auth.ts.
 */
import type { NextAuthConfig } from 'next-auth'
import type { Permission, UserRole } from '@/db/auth-schema'

export const authConfig = {
  pages: {
    signIn: '/login',
  },
  session: {
    // Credentials sign-in requires JWT sessions; the database session
    // strategy is not supported for it in Auth.js v5.
    strategy: 'jwt',
    maxAge: 60 * 60 * 8, // 8 hours — donor PII and payroll data.
  },
  providers: [], // Added in lib/auth/auth.ts (Node runtime only).
  callbacks: {
    /**
     * Carry role and charity scope in the token so authorization checks do not
     * need a database round trip on every request.
     */
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as { role?: UserRole }).role ?? 'viewer'
        token.charityId = (user as { charityId?: string | null }).charityId ?? null
        token.permissions =
          (user as { permissions?: Permission[] | null }).permissions ?? null
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub as string
        session.user.role = (token.role as UserRole) ?? 'viewer'
        session.user.charityId = (token.charityId as string | null) ?? null
        session.user.permissions =
          (token.permissions as Permission[] | null) ?? null
      }
      return session
    },
    authorized({ auth, request }) {
      const isLoggedIn = Boolean(auth?.user)
      const { pathname } = request.nextUrl
      // /app and /showcase both require a session. /showcase lives outside
      // /app so it can drop the chrome, which means it needs naming here too —
      // it displays the same real figures.
      if (pathname.startsWith('/app') || pathname.startsWith('/showcase'))
        return isLoggedIn
      return true
    },
  },
} satisfies NextAuthConfig
