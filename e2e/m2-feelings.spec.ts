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

  // Share 😰 on toilet paper in two taps (🙂+, then the emoji), then add a note from the toast.
  await page.getByRole('button', { name: 'Share a feeling: Toilet paper' }).click()
  await page
    .getByRole('group', { name: 'How do you feel about this?' })
    .getByRole('button', { name: 'Anxious' })
    .click()
  const shared = page
    .getByRole('status')
    .filter({ hasText: 'Shared. The house can see how you feel.' })
  await expect(shared).toBeVisible()
  await shared.getByRole('button', { name: 'Add a note' }).click()
  const detail = page.getByRole('dialog', { name: 'Toilet paper' })
  await detail.getByLabel('Add a note to your 😰').fill("We're on the last roll")
  await detail.getByRole('button', { name: 'Save note' }).click()
  const feels = detail.getByRole('region', { name: 'How the house feels' })
  // Wait for the save itself: until then the note is only in the text box.
  await expect(feels.getByRole('button', { name: 'Edit my note' })).toBeVisible()
  await expect(feels).toContainText('You · 😰 Anxious')
  await expect(feels).toContainText("We're on the last roll")

  // Change it in the sheet: one tap on another emoji; the old one moves to Earlier.
  await feels.getByRole('button', { name: 'Change my feeling' }).click()
  await feels.getByRole('button', { name: 'Frustrated' }).click()
  await expect(feels).toContainText('You · 😤 Frustrated')
  await feels.getByRole('button', { name: 'Add a note' }).click()
  await feels.getByLabel('Add a note to your 😤').fill('Third time this month')
  await feels.getByRole('button', { name: 'Save note' }).click()
  // Wait for the save itself: until then the note is only in the text box.
  await expect(feels.getByRole('button', { name: 'Edit my note' })).toBeVisible()
  await expect(feels).toContainText('Third time this month')
  await feels.getByRole('button', { name: /Earlier \(1\)/ }).click()
  const earlier = feels.getByRole('list', { name: 'Earlier feelings' })
  await expect(earlier).toContainText('😰 Anxious')
  await expect(earlier).toContainText("We're on the last roll")
  await page.keyboard.press('Escape')

  // A feeling puts the need first.
  await expect(rows.first()).toContainText('Toilet paper')
  await expect(rows.first()).toContainText('😤1')
})
