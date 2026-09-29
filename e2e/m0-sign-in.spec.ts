import { expect, test } from '@playwright/test'
import { latestCode, mailCount } from '../lib/testing/mailpit'
import { anOwner, freshEmail } from './support'

const NEUTRAL = /If you have an account, we sent a code to/

test('an unknown email sees the neutral message and gets no code', async ({ page }) => {
  const email = freshEmail('stranger')
  await page.goto('/sign-in')
  await page.getByLabel('Your email').fill(email)
  await page.getByRole('button', { name: 'Send me a code' }).click()

  await expect(page.getByRole('main').getByRole('status')).toContainText(NEUTRAL)
  await page.waitForTimeout(1000) // give a (wrong) email time to arrive
  expect(await mailCount(email)).toBe(0)
})

test('a known email signs in with the code from Mailpit and sees the empty app shell', async ({
  page,
}) => {
  const owner = await anOwner()

  // Signed out, house pages send you to sign in.
  await page.goto(`/h/${owner.houseId}`)
  await expect(page).toHaveURL(/\/sign-in$/)

  await page.getByLabel('Your email').fill(owner.email)
  await page.getByRole('button', { name: 'Send me a code' }).click()
  await expect(page.getByRole('main').getByRole('status')).toContainText(NEUTRAL) // same words as for a stranger

  const code = await latestCode(owner.email)
  await page.getByLabel('6-digit code').fill(code) // six digits submit on their own

  await expect(page).toHaveURL(new RegExp(`/h/${owner.houseId}$`))
  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible()

  // On an iPhone in Safari, the Add to Home Screen guide opens first (ARCHITECTURE §2).
  const guide = page.getByRole('dialog', { name: 'Add Roomies to your Home Screen' })
  await expect(guide).toBeVisible()
  await guide.getByRole('button', { name: 'Maybe later' }).click()
  await expect(guide).toBeHidden()

  const tabs = page.getByRole('navigation', { name: 'Tabs' })
  for (const name of ['Home', 'Needs', 'Chores', 'Tasks', 'House']) {
    await expect(tabs.getByRole('link', { name })).toBeVisible()
  }
  await expect(tabs.getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page')

  // The tab bar sits on the bottom edge and pads for the home indicator.
  const box = await tabs.boundingBox()
  const viewport = page.viewportSize()!
  expect(Math.round(box!.y + box!.height)).toBe(viewport.height)
  const usesSafeArea = await page.evaluate(() =>
    [...document.styleSheets].some((s) => {
      try {
        return [...s.cssRules].some((r) => r.cssText.includes('safe-area-inset-bottom'))
      } catch {
        return false
      }
    }),
  )
  expect(usesSafeArea).toBe(true)

  // The House tab reads the signed-in person's data through RLS; sign out ends the session.
  await tabs.getByRole('link', { name: 'House' }).click()
  await expect(page.getByRole('list', { name: 'Roommates' })).toContainText('Kavya')
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page).toHaveURL(/\/sign-in$/)
  await page.goto(`/h/${owner.houseId}`)
  await expect(page).toHaveURL(/\/sign-in$/)
})

test('a wrong code is refused kindly', async ({ page }) => {
  const owner = await anOwner()
  await page.goto('/sign-in')
  await page.getByLabel('Your email').fill(owner.email)
  await page.getByRole('button', { name: 'Send me a code' }).click()
  const code = await latestCode(owner.email)
  const wrong = String((Number(code) + 1) % 1_000_000).padStart(6, '0')
  await page.getByLabel('6-digit code').fill(wrong)
  await expect(page.getByRole('main').getByRole('alert')).toHaveText(
    "That code didn't work. Check it and try again, or get a new one.",
  )
  await expect(page).toHaveURL(/\/sign-in$/)
})
