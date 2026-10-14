import { expect, test } from '@playwright/test'
import { ownerOnHouseTab } from './support'

test('personal settings: turn a category off, keep quiet hours, and switch to dark', async ({
  page,
}) => {
  const owner = await ownerOnHouseTab(page)
  await page.goto(`/h/${owner.houseId}`)
  await page.getByRole('link', { name: 'Your settings' }).click()
  await expect(page.getByRole('heading', { name: 'You', level: 1 })).toBeVisible()

  // T65: two separate entries; neither setting sits on this page.
  const settings = page.getByRole('navigation', { name: 'Settings' })
  await expect(settings.getByRole('link')).toHaveCount(2)
  await expect(page.getByRole('group', { name: 'Theme' })).toHaveCount(0)
  await settings.getByRole('link', { name: 'Notifications' }).click()
  await expect(page).toHaveURL(new RegExp(`/h/${owner.houseId}/me/notifications$`))
  await expect(page.getByRole('heading', { name: 'Notifications', level: 1 })).toBeVisible()
  await expect(page.getByRole('group', { name: 'Theme' })).toHaveCount(0)

  // T61: one Notifications section: this device, the six categories, quiet hours.
  const tellMe = page.getByRole('group', { name: 'Tell me when' })
  await expect(tellMe.getByRole('switch')).toHaveCount(6)
  const polls = tellMe.getByRole('switch', { name: 'Polls' })
  await expect(polls).toHaveAttribute('aria-checked', 'true')
  await polls.click()
  await expect(polls).toHaveAttribute('aria-checked', 'false')
  await page.reload()
  await expect(page.getByRole('switch', { name: 'Polls' })).toHaveAttribute('aria-checked', 'false')

  // Quiet hours are on by default (10pm–8am): one row, edited inline.
  await expect(page.getByRole('switch', { name: 'Quiet hours' })).toHaveAttribute(
    'aria-checked',
    'true',
  )
  await page.getByRole('button', { name: 'Quiet 10pm–8am' }).click()
  await page.getByLabel('From').fill('23:00')
  await page.getByRole('button', { name: 'Save quiet hours' }).click()
  await expect(page.getByRole('button', { name: 'Quiet 11pm–8am' })).toBeVisible()
  await expect(page.getByLabel('From')).toHaveCount(0)

  // Appearance is its own page, reached from You.
  await page.getByRole('link', { name: 'You', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'You', level: 1 })).toBeVisible()
  await page.getByRole('link', { name: /^Appearance/ }).click()
  await expect(page).toHaveURL(new RegExp(`/h/${owner.houseId}/me/appearance$`))
  await expect(page.getByRole('group', { name: 'Tell me when' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Dark' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(page.getByRole('button', { name: 'Dark' })).toHaveAttribute('aria-pressed', 'true')
  await page.goto(`/h/${owner.houseId}/me/notifications`)
  await expect(page.getByRole('button', { name: 'Quiet 11pm–8am' })).toBeVisible()
})

test('the old House link lands on Admin, which leaves Notifications to your settings (T67)', async ({
  page,
}) => {
  const owner = await ownerOnHouseTab(page)
  await page.goto(`/h/${owner.houseId}/house`)
  await expect(page).toHaveURL(new RegExp(`/h/${owner.houseId}/admin$`))
  await expect(page.getByRole('heading', { name: 'Admin', level: 1 })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Activity' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Notifications', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Turn on notifications' })).toHaveCount(0)
})
