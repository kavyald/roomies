// Q8 (routines part): the journey across T96–T99. Set up a routine in Admin, add to its checklist
// on Chores, tick it with Undo, then 😤 an Upkeep chore until someone takes care of it.
import { expect, test } from '@playwright/test'
import { aRoommate, anItem, ownerOnHouseTab } from './support'

test('a routine from Admin to the Chores tab; Upkeep goes quiet once it is taken care of', async ({
  page,
}) => {
  const owner = await ownerOnHouseTab(page)
  await aRoommate(owner, 'Sam')
  await anItem(owner, { category: 'chore', title: 'Dishes', icon: 'utensils' })

  // Admin → Routines: the first routine, with the kitchen.
  await page.goto(`/h/${owner.houseId}/admin`)
  const newSheet = page.getByRole('dialog', { name: 'New routine' })
  await expect(async () => {
    if (!(await newSheet.isVisible())) {
      await page.getByRole('button', { name: 'Add a routine' }).click()
    }
    await expect(newSheet).toBeVisible({ timeout: 2000 })
  }).toPass()
  await newSheet.getByRole('textbox', { name: 'Name' }).fill('Downstairs')
  await newSheet.getByRole('button', { name: 'Broom' }).click()
  await newSheet.getByRole('checkbox', { name: 'Kitchen' }).check()
  await newSheet.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(newSheet).toBeHidden()

  // Chores: it's mine this week, and the word "routine" stays in Admin.
  await page.goto(`/h/${owner.houseId}/chores`)
  await expect(page.getByText(/you have the kitchen · through/)).toBeVisible()
  await expect(page.getByRole('main')).not.toContainText(/routine/i)

  // Quick add a Deep clean chore to the kitchen, and it's on the checklist.
  await page.getByRole('button', { name: 'Downstairs, Kavya' }).click()
  const sheet = page.getByRole('dialog', { name: 'Downstairs' })
  await sheet.getByRole('button', { name: 'Add to Kitchen' }).click()
  const add = page.getByRole('dialog', { name: 'Add to Kitchen' })
  await add.getByLabel('What needs doing?').fill('Oven')
  await add.getByRole('button', { name: 'Add', exact: true }).click()
  const tick = sheet.getByRole('button', { name: 'Did it: Oven' })
  await expect(tick).toHaveAttribute('aria-pressed', 'false')

  // Tick it, and Undo.
  await tick.click()
  await expect(tick).toHaveAttribute('aria-pressed', 'true')
  await page
    .getByRole('status')
    .filter({ hasText: 'Did it. Thanks!' })
    .getByRole('button', { name: 'Undo' })
    .click()
  await expect(tick).toHaveAttribute('aria-pressed', 'false')
  await page.keyboard.press('Escape')
  await expect(sheet).toBeHidden()

  // A deep clean chore isn't Home's business, even felt; an Upkeep chore with a feeling is.
  const upkeep = page.getByRole('region', { name: 'Upkeep' })
  await upkeep.getByRole('button', { name: 'Share a feeling: Dishes' }).click()
  await upkeep.getByRole('button', { name: 'Frustrated' }).click()
  await expect(upkeep.getByRole('list', { name: 'Piling up' })).toContainText('Dishes')
  await page.getByRole('link', { name: 'Home' }).click()
  const feed = page.getByRole('list', { name: 'By priority' })
  await expect(feed).toContainText('Dishes')
  await expect(feed).not.toContainText('Oven')

  // Took care of it: quiet on Chores and off Home.
  await page.getByRole('link', { name: 'Chores' }).click()
  await upkeep.getByRole('button', { name: 'Took care of it: Dishes' }).click()
  await expect(upkeep).toContainText('All calm')
  await page.getByRole('link', { name: 'Home' }).click()
  await expect(feed.getByText('Dishes')).toHaveCount(0)

  // A new feeling counts again.
  await page.getByRole('link', { name: 'Chores' }).click()
  await upkeep.getByRole('button', { name: 'Share a feeling: Dishes' }).click()
  await upkeep.getByRole('button', { name: 'Frustrated' }).click()
  await expect(upkeep.getByRole('list', { name: 'Piling up' })).toContainText('Dishes')

  // Activity has the story, by name.
  await page.goto(`/h/${owner.houseId}/activity`)
  await expect(page.getByText('Kavya added Downstairs')).toBeVisible()
})
