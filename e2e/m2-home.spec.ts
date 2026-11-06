import { expect, test } from '@playwright/test'
import { anItem, ownerOnHouseTab } from './support'

test('a chore shows on Home only after someone shares a feeling, and says why', async ({
  page,
}) => {
  const owner = await ownerOnHouseTab(page)
  await anItem(owner, {
    category: 'chore',
    title: 'Take out the trash',
    lastDoneDaysAgo: 9,
  })
  await anItem(owner, { category: 'chore', title: 'Descale the kettle' })

  await page.goto(`/h/${owner.houseId}`)
  const feed = page.getByRole('list', { name: 'By priority' })
  const cards = feed.getByRole('listitem')
  await expect(cards).toHaveCount(0)

  // Share 😤 about the kettle from the Chores tab.
  await page.goto(`/h/${owner.houseId}/chores`)
  const upkeep = page.getByRole('region', { name: 'Upkeep' })
  await upkeep.getByRole('button', { name: 'Share a feeling: Descale the kettle' }).click()
  await upkeep.getByRole('button', { name: 'Frustrated', exact: true }).click()
  await upkeep.getByRole('button', { name: 'Descale the kettle', exact: true }).click()
  const detail = page.getByRole('dialog', { name: 'Descale the kettle' })
  await expect(detail.getByRole('region', { name: 'How the house feels' })).toContainText(
    'You · 😤 Frustrated',
  )
  await page.keyboard.press('Escape')

  // Now it's on Home, on its own, and it explains itself.
  await page.getByRole('link', { name: 'Home' }).click()
  await expect(cards).toHaveCount(1)
  await expect(cards.first()).toContainText('Descale the kettle')
  await expect(cards.first()).toContainText('Normal')
  await expect(cards.first()).toContainText('😤1')
  await cards.first().getByRole('button', { name: 'Descale the kettle', exact: true }).click()
  const why = page
    .getByRole('dialog', { name: 'Descale the kettle' })
    .getByRole('region', { name: 'Why is this here?' })
  await why.getByRole('button', { name: /Why is this here\?/ }).click()
  await expect(why).toContainText('Normal priority+25')
  await expect(why).toContainText('😤 Kavya+15')
  await expect(why).toContainText('Score40')
})
