import { expect, test } from '@playwright/test'
import { ownerOnHouseTab } from './support'

test('personal settings: turn a category off, keep quiet hours, and switch to dark', async ({
  page,
}) => {
  const owner = await ownerOnHouseTab(page)
  await page.goto(`/h/${owner.houseId}`)
  await page.getByRole('link', { name: 'Your settings' }).click()
  await expect(page.getByRole('heading', { name: 'You', level: 1 })).toBeVisible()

  const polls = page.getByRole('switch', { name: 'New polls, and polls closing' })
  await expect(polls).toHaveAttribute('aria-checked', 'true')
  await polls.click()
  await expect(polls).toHaveAttribute('aria-checked', 'false')
  await page.reload()
  await expect(page.getByRole('switch', { name: 'New polls, and polls closing' })).toHaveAttribute(
    'aria-checked',
    'false',
  )

  // Quiet hours are on by default (10pm–8am) and can be changed.
  await expect(page.getByRole('switch', { name: 'Quiet hours' })).toHaveAttribute(
    'aria-checked',
    'true',
  )
  await page.getByLabel('From').fill('23:00')
  await page.getByRole('button', { name: 'Save quiet hours' }).click()
  await expect(page.getByRole('button', { name: 'Save quiet hours' })).toBeDisabled()

  await page.getByRole('button', { name: 'Dark' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(page.getByLabel('From')).toHaveValue('23:00')
})
