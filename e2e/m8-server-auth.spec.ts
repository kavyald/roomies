import { expect, test } from '@playwright/test'
import { ownerOnHouseTab } from './support'

// T115 (ARCHITECTURE §5.4): the proxy only looks at the session cookie; the house layout is what
// verifies it with Supabase Auth. A cookie that only looks signed in gets no further than that.

test('a session cookie that only looks signed in is sent to sign-in by the house itself', async ({
  page,
  context,
}) => {
  const owner = await ownerOnHouseTab(page)

  // The session cookie (split into chunks when it's long), with the access token's signature
  // changed: still unexpired, so the proxy's look at it passes, but Supabase Auth refuses it.
  const chunks = (await context.cookies())
    .filter((c) => /^sb-.+-auth-token(\.\d+)?$/.test(c.name))
    .sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }))
  expect(chunks.length).toBeGreaterThan(0)
  const joined = chunks.map((c) => c.value).join('')
  const prefixed = joined.startsWith('base64-')
  const session = JSON.parse(
    Buffer.from(prefixed ? joined.slice(7) : joined, 'base64url').toString('utf8'),
  ) as { access_token: string; expires_at: number }
  expect(session.expires_at * 1000).toBeGreaterThan(Date.now() + 60_000)
  const [head, body, signature] = session.access_token.split('.')
  const forged = `${head}.${body}.${signature!.slice(0, -4)}${signature!.endsWith('AAAA') ? 'BBBB' : 'AAAA'}`
  const value =
    (prefixed ? 'base64-' : '') +
    Buffer.from(JSON.stringify({ ...session, access_token: forged })).toString('base64url')
  const size = Math.ceil(value.length / chunks.length)
  await context.addCookies(
    chunks.map((c, i) => ({ ...c, value: value.slice(i * size, (i + 1) * size) })),
  )

  await page.goto(`/h/${owner.houseId}/needs`)
  await expect(page).toHaveURL(/\/sign-in$/)
  await expect(page.getByRole('button', { name: 'Send me a code' })).toBeVisible()
})

test('a house page says where the server spent its time', async ({ page }) => {
  const owner = await ownerOnHouseTab(page)
  const res = await page.goto(`/h/${owner.houseId}/needs`)
  expect(res?.headers()['server-timing']).toMatch(/session;dur=\d+(\.\d+)?/)
  await expect(page.locator('meta[name="roomies-server-timing"]')).toHaveAttribute(
    'content',
    /^auth;dur=\d+\.\d;desc="Supabase Auth", membership;dur=\d+\.\d;desc="Membership"$/,
  )
})
