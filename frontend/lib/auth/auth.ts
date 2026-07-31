/**
 * Full Auth.js v5 setup (Node runtime). Middleware imports ./auth.config
 * instead — see the note there.
 *
 * MOCK MODE: credentials are checked against lib/mock/users.ts so the app runs
 * with no database. When the Supabase-backed users table lands, swap
 * `findMockUser` for a query + bcrypt compare; nothing else here changes.
 */
import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { z } from 'zod'
import { findMockUser } from '@/lib/mock/users'
import { authConfig } from './auth.config'

const credentialsSchema = z.object({
  email: z.string().min(3),
  password: z.string().min(1),
})

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw)
        if (!parsed.success) return null
        const { email, password } = parsed.data

        const user = findMockUser(email, password)
        // One identical failure for unknown account and wrong password: never
        // reveal which, and never log the address.
        if (!user) return null

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role as never,
          charityId: user.charityCode,
          permissions: null,
        }
      },
    }),
  ],
})

/**
 * Current actor for authorization checks, or null when signed out.
 * Services take an Actor rather than reading the session themselves, so they
 * stay unit-testable.
 */
export async function currentActor() {
  const session = await auth()
  if (!session?.user) return null
  return {
    id: session.user.id,
    role: session.user.role,
    charityId: session.user.charityId,
    permissions: session.user.permissions,
  }
}
