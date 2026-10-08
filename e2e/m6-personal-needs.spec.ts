import { expect, test } from '@playwright/test'
import { ownerOnHouseTab } from './support'

test('a need for me: one tap on Me, the chip on Needs, Home and the run, and a change in Activity (T45)', async ({
  page,
}) => {
  const owner = await ownerOnHouseTab(page)
  await page.goto(`/h/${owner.houseId}/needs`)
  const weNeed = page.getByLabel('We need…')
  const needs = page.getByRole('list', { name: 'Needs' })
  const whose = page.getByRole('group', { name: "Who it's for" })

  // The title plus one tap: Me.
  await whose.getByRole('button', { name: 'Me' }).click()
  await weNeed.fill('Oat milk')
  await weNeed.press('Enter')
  await expect(needs.getByRole('listitem').filter({ hasText: 'Oat milk' })).toContainText(
    'For Kavya',
  )
  // The choice is remembered; the house's oat milk is a different need.
  await page.reload()
  await expect(whose.getByRole('button', { name: 'Me' })).toHaveAttribute('aria-pressed', 'true')
  await whose.getByRole('button', { name: 'House' }).click()
  await weNeed.fill('oat milk')
  await weNeed.press('Enter')
  await expect(needs.getByRole('listitem')).toHaveCount(2)
  await expect(needs.getByRole('listitem').filter({ hasText: 'For Kavya' })).toHaveCount(1)

  // Home shows the chip too (a need reaches Home with a feeling).
  await needs
    .getByRole('listitem')
    .filter({ hasText: 'For Kavya' })
    .getByRole('button', { name: /^Oat milk/ })
    .click()
  const sheet = page.getByRole('dialog', { name: 'Oat milk' })
  await sheet.getByRole('button', { name: '🙂+ Share a feeling' }).click()
  await sheet.getByRole('button', { name: 'Anxious', exact: true }).click()
  await expect(sheet.getByRole('region', { name: 'How the house feels' })).toContainText('😰')
  await page.keyboard.press('Escape')
  await page.getByRole('link', { name: 'Home' }).click()
  await expect(page.getByRole('button', { name: 'Oat milk', exact: true })).toBeVisible()
  await expect(page.getByText('For Kavya')).toBeVisible()

  // And the run's rows.
  await page.goto(`/h/${owner.houseId}/needs`)
  await page.getByRole('button', { name: 'Start a run' }).click()
  await page
    .getByRole('dialog', { name: 'Start a run' })
    .getByRole('button', { name: 'Start run' })
    .click()
  const run = page.getByRole('dialog', { name: "Kavya's run" })
  await expect(run.getByRole('list', { name: 'On this run' })).toContainText('For Kavya')
  await page.keyboard.press('Escape')

  // Changing it on the detail shows in Activity.
  await page.goto(`/h/${owner.houseId}/needs`)
  await needs.getByRole('button', { name: /^Got it: oat milk$/ }).click()
  await needs
    .getByRole('listitem')
    .filter({ hasText: 'For Kavya' })
    .getByRole('button', { name: /^Oat milk/ })
    .click()
  const detail = page.getByRole('dialog', { name: 'Oat milk' })
  await detail
    .getByRole('group', { name: "Who it's for" })
    .getByRole('button', { name: 'House' })
    .click()
  await expect(page.getByRole('status').filter({ hasText: 'For the house now.' })).toBeVisible()
  await page.keyboard.press('Escape')
  await page.goto(`/h/${owner.houseId}/activity`)
  await expect(page.getByRole('button', { name: /Kavya edited Oat milk/ })).toContainText(
    'Now for the house',
  )
})
