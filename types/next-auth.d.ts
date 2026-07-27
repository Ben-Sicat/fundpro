import type { Permission, UserRole } from '@/db/auth-schema'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      email: string
      name?: string | null
      role: UserRole
      /** Set iff role === 'charity_viewer'. */
      charityId: string | null
      permissions: Permission[] | null
    }
  }

  interface User {
    role?: UserRole
    charityId?: string | null
    permissions?: Permission[] | null
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    role?: UserRole
    charityId?: string | null
    permissions?: Permission[] | null
  }
}
