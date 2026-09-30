import { expect, test } from '@playwright/test'
import { ownerOnHouseTab } from './support'

test('changing a feeling moves the old one into Earlier, and a feeling moves a need up the list', async ({
  page,
}) => {
  const owner = await ownerOnHouseTab(page)
  await page.goto(`/h/${owner.houseId}/needs`)
  const weNeed = page.getByLabel('We need…')
  for (const title of ['Toilet paper', 'Olive oil']) {
    await weNeed.fill(title)
    await weNeed.press('Enter')
    await expect(page.getByRole('list', { name: 'Needs' })).toContainText(title)
  }
  const rows = page.getByRole('list', { name: 'Needs' }).getByRole('listitem')
  await expect(rows.first()).toContainText('Olive oil') // newest first, before any feelings

  // Share 😰 on toilet paper, with a note.
  await rows
    .filter({ hasText: 'Toilet paper' })
    .getByRole('button', { name: /^Toilet paper/ })
    .click()
  const detail = page.getByRole('dialog', { name: 'Toilet paper' })
  await detail.getByRole('button', { name: '🙂+ Share a feeling' }).click()
  await detail.getByRole('radio', { name: /Anxious/ }).click()
  await detail.getByLabel('Add a note (optional)').fill("We're on the last roll")
  await detail.getByRole('button', { name: 'Share with the house' }).click()
  await expect(
    page.getByRole('status').filter({ hasText: 'Shared. The house can see how you feel.' }),
  ).toBeVisible()
  const feels = detail.getByRole('region', { name: 'How the house feels' })
  await expect(feels).toContainText('You · 😰 Anxious')
  await expect(feels).toContainText("We're on the last roll")

  // Change it: the old one moves to Earlier.
  await feels.getByRole('button', { name: 'Change my feeling' }).click()
  await detail.getByRole('radio', { name: /Frustrated/ }).click()
  await detail.getByLabel('Add a note (optional)').fill('Third time this month')
  await detail.getByRole('button', { name: 'Share with the house' }).click()
  await expect(feels).toContainText('You · 😤 Frustrated')
  await feels.getByRole('button', { name: /Earlier \(1\)/ }).click()
  const earlier = feels.getByRole('list', { name: 'Earlier feelings' })
  await expect(earlier).toContainText('😰 Anxious')
  await expect(earlier).toContainText("We're on the last roll")
  await page.keyboard.press('Escape')

  // A feeling puts the need first.
  await expect(rows.first()).toContainText('Toilet paper')
  await expect(rows.first()).toContainText('😤1')
})
