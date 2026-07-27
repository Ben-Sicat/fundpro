/**
 * Full Auth.js v5 setup (Node runtime). Middleware must import
 * ./auth.config instead — see the note there.
 */
import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { eq } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { db } from '@/db'
import { users } from '@/db/auth-schema'
import { authConfig } from './auth.config'

const credentialsSchema = z.object({
  email: z.string().email(),
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

        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.email, email.toLowerCase()))
          .limit(1)

        // Same failure for unknown email, no password set, inactive account and
        // wrong password: never reveal which, and never log the address.
        if (!user?.passwordHash || !user.isActive) return null
        if (!(await bcrypt.compare(password, user.passwordHash))) return null

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role as never,
          charityId: user.charityId,
          permissions: user.permissions as never,
        }
      },
    }),
  ],
})

/**
 * Current actor for service-layer authorization, or null if signed out.
 * Services should take an Actor rather than reading the session themselves,
 * so they stay unit-testable.
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
