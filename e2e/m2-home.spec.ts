import { expect, test } from '@playwright/test'
import { anItem, ownerOnHouseTab } from './support'

test('an as-needed chore shows on Home only after someone shares a feeling, and says why', async ({
  page,
}) => {
  const owner = await ownerOnHouseTab(page)
  await anItem(owner, {
    category: 'chore',
    title: 'Take out the trash',
    repeatDays: 7,
    lastDoneDaysAgo: 9,
  })
  await anItem(owner, { category: 'chore', title: 'Descale the kettle' }) // as needed

  await page.goto(`/h/${owner.houseId}`)
  const feed = page.getByRole('list', { name: 'Needs attention' })
  const cards = feed.getByRole('listitem')
  await expect(cards).toHaveCount(1)
  await expect(cards.first()).toContainText('High')
  await expect(cards.first()).toContainText('Take out the trash')
  await expect(feed).not.toContainText('Descale the kettle')

  // Share 😤 about the kettle from the Chores tab.
  await page.goto(`/h/${owner.houseId}/chores`)
  await page.getByRole('button', { name: /^Descale the kettle/ }).click()
  const detail = page.getByRole('dialog', { name: 'Descale the kettle' })
  await detail.getByRole('button', { name: '🙂+ Share a feeling' }).click()
  await detail.getByRole('button', { name: 'Frustrated', exact: true }).click()
  await expect(detail.getByRole('region', { name: 'How the house feels' })).toContainText(
    'You · 😤 Frustrated',
  )
  await page.keyboard.press('Escape')

  // Now it's on Home, below the trash, and it explains itself.
  await page.getByRole('link', { name: 'Home' }).click()
  await expect(cards).toHaveCount(2)
  await expect(cards.nth(1)).toContainText('Descale the kettle')
  await expect(cards.nth(1)).toContainText('Normal')
  await expect(cards.nth(1)).toContainText('😤1')
  await cards.nth(1).getByRole('button', { name: 'Descale the kettle', exact: true }).click()
  const why = page
    .getByRole('dialog', { name: 'Descale the kettle' })
    .getByRole('region', { name: 'Why is this here?' })
  await why.getByRole('button', { name: /Why is this here\?/ }).click()
  await expect(why).toContainText('Normal priority+25')
  await expect(why).toContainText('😤 Kavya+15')
  await expect(why).toContainText('Score40')
})
