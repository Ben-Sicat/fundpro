import NextAuth from 'next-auth'
import { authConfig } from '@/lib/auth/auth.config'

// Edge-safe: authConfig carries no providers/adapter, so no Node-only deps.
export const { auth: middleware } = NextAuth(authConfig)

export default middleware

export const config = {
  // Protect everything except static assets and the auth endpoints.
  matcher: ['/((?!api/auth|_next/static|_next/image|favicon.ico).*)'],
}
