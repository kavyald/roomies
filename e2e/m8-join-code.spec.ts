// T111 (Q8): the join code step has the same two ways out as sign-in. "Use a different email"
// goes back to the email, and "Send a new code" mails another one that still works.
import { expect, test } from '@playwright/test'
import { latestCode, mailCount } from '../lib/testing/mailpit'
import { anInviteLink, anOwner, freshEmail } from './support'

test('the join code step can switch email and send a new code', async ({ page }) => {
  const owner = await anOwner('Kavya')
  await page.goto(await anInviteLink(owner))
  await page.getByLabel('Your name').fill('Sam')
  await page.getByLabel('Your email').fill(freshEmail('sam-typo'))
  await page.getByRole('button', { name: 'Send me a code' }).click()
  await expect(page.getByLabel('6-digit code')).toBeVisible()

  // A typo in the email: go back and fix it.
  await page.getByRole('button', { name: 'Use a different email' }).click()
  const email = freshEmail('sam')
  await page.getByLabel('Your email').fill(email)
  await page.getByRole('button', { name: 'Send me a code' }).click()
  await expect(page.getByLabel('6-digit code')).toBeVisible()
  await expect.poll(() => mailCount(email)).toBe(1)

  // The code didn't come through: ask for another, and it works.
  // (Supabase spaces codes to one address at least a second apart: max_frequency.)
  await page.waitForTimeout(1500)
  await page.getByRole('button', { name: 'Send a new code' }).click()
  await expect.poll(() => mailCount(email)).toBe(2)
  await page.getByLabel('6-digit code').fill(await latestCode(email))
  await expect(page.getByRole('heading', { name: 'Which room is yours?' })).toBeVisible()
})
