// Vitest globalSetup for the `db` project: fail fast, with a hint, when local Supabase is down.
import pg from 'pg'

export default async function checkLocalSupabase() {
  const url =
    process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
  const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 3000 })
  try {
    await client.connect()
    await client.query('select 1')
  } catch {
    throw new Error(
      "Local Supabase isn't running. Start Docker Desktop, then run: pnpm supabase start",
    )
  } finally {
    await client.end().catch(() => {})
  }
}
