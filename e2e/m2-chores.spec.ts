import { expect, test } from '@playwright/test'
import { anItem, ownerOnHouseTab } from './support'

test('a chore says when it was last done, and Did it updates that, with Undo', async ({ page }) => {
  const owner = await ownerOnHouseTab(page)
  await anItem(owner, { category: 'chore', title: 'Take out the trash', lastDoneDaysAgo: 9 })
  await anItem(owner, { category: 'chore', title: 'Descale the kettle' })

  await page.goto(`/h/${owner.houseId}/chores`)
  const cards = page.getByRole('list', { name: 'Chores' }).getByRole('listitem')
  await expect(cards).toHaveCount(2)
  const trash = cards.filter({ hasText: 'Take out the trash' })
  await expect(trash).toContainText('Last done 9 days ago · Kavya')
  await expect(trash).toContainText('Upkeep')

  await page.getByRole('button', { name: 'Did it: Take out the trash' }).click()
  const toast = page.getByRole('status').filter({ hasText: 'Did it. Thanks!' })
  await expect(toast).toBeVisible()
  await expect(trash).toContainText('Last done today · Kavya')

  // Undo puts it back to the last done before (T54).
  await toast.getByRole('button', { name: 'Undo' }).click()
  await expect(trash).toContainText('Last done 9 days ago · Kavya')
})
