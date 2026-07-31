import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'
import * as authSchema from './auth-schema'

const connectionString = process.env.DATABASE_URL

if (!connectionString) {
  throw new Error(
    'DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.',
  )
}

/**
 * Reuse the client across hot reloads in dev, otherwise every reload opens a
 * new pool and exhausts connections (especially on Neon).
 */
const globalForDb = globalThis as unknown as {
  sqlClient?: ReturnType<typeof postgres>
}

const client =
  globalForDb.sqlClient ??
  postgres(connectionString, {
    // Neon scales to zero; keep the pool small and let idle connections drop.
    max: process.env.NODE_ENV === 'production' ? 10 : 5,
    idle_timeout: 20,
    connect_timeout: 15,
  })

if (process.env.NODE_ENV !== 'production') {
  globalForDb.sqlClient = client
}

export const db = drizzle(client, { schema: { ...schema, ...authSchema } })
export { client as sqlClient }
export type Db = typeof db
