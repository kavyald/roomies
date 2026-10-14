import { expect, test } from '@playwright/test'
import { ownerOnHouseTab } from './support'

test('adding "tomatoes" twice points to the first, and Got it removes it with undo', async ({
  page,
}) => {
  const owner = await ownerOnHouseTab(page)
  await page.goto(`/h/${owner.houseId}/needs`)
  await expect(page.getByText('Nothing to buy. Nice.')).toBeVisible()

  const weNeed = page.getByLabel('We need…')
  for (const title of ['tomatoes', 'Paper towels']) {
    await weNeed.fill(title)
    await weNeed.press('Enter')
    await expect(page.getByRole('list', { name: 'Needs' })).toContainText(title)
  }

  // A second "Tomatoes" doesn't repeat; it points to the first.
  await weNeed.fill('Tomatoes')
  await weNeed.press('Enter')
  await expect(
    page.getByRole('status').filter({ hasText: "That's already on the list." }),
  ).toBeVisible()
  const list = page.getByRole('list', { name: 'Needs' })
  await expect(list.getByRole('listitem')).toHaveCount(2)
  await expect(list.getByRole('listitem').filter({ hasText: 'tomatoes' })).toHaveClass(
    /bg-top-fill/,
  )

  // Got it takes it off, and Undo puts it back.
  await list.getByRole('button', { name: 'Got it: tomatoes' }).click()
  const toast = page.getByRole('status').filter({ hasText: 'Got tomatoes.' })
  await expect(toast).toBeVisible()
  await expect(list.getByRole('listitem')).toHaveCount(1)
  await toast.getByRole('button', { name: 'Undo' }).click()
  await expect(list.getByRole('listitem')).toHaveCount(2)
  await expect(list).toContainText('tomatoes')
})
