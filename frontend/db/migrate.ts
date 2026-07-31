/**
 * Applies pending migrations. Run with `pnpm db:migrate`.
 *
 * Uses a dedicated single connection rather than the app pool, so it works
 * identically against local Docker Postgres and Neon.
 */
import { config } from 'dotenv'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'

config({ path: '.env.local' })
config({ path: '.env' })

const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL is not set.')

async function main() {
  const client = postgres(url!, { max: 1 })
  try {
    await migrate(drizzle(client), { migrationsFolder: './db/migrations' })
    console.log('Migrations applied.')
  } finally {
    await client.end()
  }
}

main().catch((err) => {
  console.error('Migration failed:', err)
  process.exit(1)
})
