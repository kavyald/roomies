import { expect, test } from '@playwright/test'
import { anItem, ownerOnHouseTab } from './support'

test('an every-7-days chore last done 9 days ago sorts to the top, and Did it resets it', async ({
  page,
}) => {
  const owner = await ownerOnHouseTab(page)
  await anItem(owner, {
    category: 'chore',
    title: 'Clean the fridge',
    repeatDays: 7,
    lastDoneDaysAgo: 3,
  })
  await anItem(owner, {
    category: 'chore',
    title: 'Take out the trash',
    repeatDays: 7,
    lastDoneDaysAgo: 9,
  })
  await anItem(owner, { category: 'chore', title: 'Descale the kettle' }) // as needed

  await page.goto(`/h/${owner.houseId}/chores`)
  const cards = page.getByRole('list', { name: 'Chores' }).getByRole('listitem')
  await expect(cards).toHaveCount(3)
  await expect(cards.nth(0)).toContainText('Take out the trash')
  await expect(cards.nth(0)).toContainText('Last done 9 days ago · Kavya')
  await expect(cards.nth(0)).toContainText('About every 7 days')
  await expect(cards.nth(2)).toContainText('Descale the kettle')
  await expect(cards.nth(2)).toContainText('As needed')

  await page.getByRole('button', { name: 'Did it: Take out the trash' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Did it. Thanks!' })).toBeVisible()
  const trash = cards.filter({ hasText: 'Take out the trash' })
  await expect(trash).toContainText('Last done today · Kavya')
  await expect(cards.nth(0)).toContainText('Clean the fridge')
})
