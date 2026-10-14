// Reads sign-in emails from local Supabase's inbox (Mailpit, TESTING.md §4). Nothing reaches a
// real inbox in tests.

const MAILPIT_URL = process.env.TEST_MAILPIT_URL ?? 'http://127.0.0.1:54324'

type Summary = { ID: string; Snippet: string; Created: string }

const search = async (email: string): Promise<Summary[]> => {
  const q = encodeURIComponent(`to:"${email}"`)
  const res = await fetch(`${MAILPIT_URL}/api/v1/search?query=${q}`)
  if (!res.ok) throw new Error(`Mailpit search failed: ${res.status}`)
  return ((await res.json()) as { messages: Summary[] }).messages
}

/** How many emails this address has received. */
export const mailCount = async (email: string): Promise<number> => (await search(email)).length

/** Waits for the newest sign-in code sent to `email` and returns its 6 digits. */
export const latestCode = async (email: string, timeoutMs = 10_000): Promise<string> => {
  const until = Date.now() + timeoutMs
  while (Date.now() < until) {
    const newest = (await search(email)).sort((a, b) => b.Created.localeCompare(a.Created))[0]
    const code = newest?.Snippet.match(/\b\d{6}\b/)?.[0]
    if (code) return code
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error(`No sign-in code reached ${email} within ${timeoutMs}ms`)
}
