import { expect, test } from '@playwright/test'
import { ownerOnHouseTab } from './support'

test('the activity log names things, shows feelings as emoji, opens a line, and filters (T40)', async ({
  page,
}) => {
  const owner = await ownerOnHouseTab(page)
  await page.goto(`/h/${owner.houseId}/needs`)
  const weNeed = page.getByLabel('We need…')
  await weNeed.fill('Toilet paper')
  await weNeed.press('Enter')
  const needs = page.getByRole('list', { name: 'Needs' })
  await needs.getByRole('button', { name: 'Toilet paper', exact: true }).click()
  const detail = page.getByRole('dialog', { name: 'Toilet paper' })
  await detail.getByRole('button', { name: '🙂+ Share a feeling' }).click()
  await detail.getByRole('radio', { name: /Anxious/ }).click()
  await detail.getByLabel('Add a note (optional)').fill('Last roll')
  await detail.getByRole('button', { name: 'Share with the house' }).click()
  await expect(detail.getByRole('region', { name: 'How the house feels' })).toContainText(
    'You · 😰 Anxious',
  )
  await page.keyboard.press('Escape')

  await page.goto(`/h/${owner.houseId}/activity`)
  await expect(page.getByRole('heading', { name: 'Today', level: 2 })).toBeVisible()
  const felt = page.getByRole('button', { name: /Kavya felt 😰 about Toilet paper/ })
  await expect(felt).toContainText('“Last roll”')
  await expect(page.getByRole('button', { name: /Kavya added Toilet paper/ })).toContainText('Need')
  await expect(page.getByText(/something/)).toHaveCount(0)

  // A tap opens the need in place, over the log.
  await felt.click()
  await expect(page.getByRole('dialog', { name: 'Toilet paper' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page).toHaveURL(new RegExp(`/h/${owner.houseId}/activity$`))

  // Filters.
  await page.getByRole('button', { name: 'Money', exact: true }).click()
  await expect(page.getByText('Nothing like that yet.')).toBeVisible()
  await page.getByRole('button', { name: 'House', exact: true }).click()
  await expect(page.getByText('Nothing like that yet.')).toBeVisible() // the house was seeded directly
  await page.getByRole('button', { name: 'Items', exact: true }).click()
  await expect(felt).toBeVisible()
})
