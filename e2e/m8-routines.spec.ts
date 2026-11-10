// Q8 (routines part): the journey across T96–T99 and T101. Set up a routine in Admin, give its rooms
// the same chores from one-tap picks in Admin → Rooms, tick one in its box on Chores with Undo, then
// 😤 an Upkeep chore until someone takes care of it.
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
  await newSheet.getByRole('button', { name: 'Broom', exact: true }).click()
  await newSheet.getByRole('checkbox', { name: 'Kitchen', exact: true }).check()
  await newSheet.getByRole('checkbox', { name: 'Living room', exact: true }).check()
  await newSheet.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(newSheet).toBeHidden()

  // Admin → Rooms: Vacuum and Swiffer for the kitchen from the picks, then the same two for the
  // living room, now the house's own names. Each room gets its own copy.
  const roomsSheet = page.getByRole('dialog', { name: 'Rooms' })
  const giveChores = async (room: string) => {
    await expect(async () => {
      if (!(await roomsSheet.isVisible()))
        await page.getByRole('list', { name: 'Rooms' }).getByRole('button').click()
      await expect(roomsSheet).toBeVisible({ timeout: 2000 })
    }).toPass()
    await roomsSheet.getByRole('button', { name: `${room}, shared space`, exact: true }).click()
    const sheet = page.getByRole('dialog', { name: room })
    const picks = sheet.getByRole('list', { name: 'Chores to add' })
    await picks.getByRole('button', { name: 'Vacuum', exact: true }).click()
    await picks.getByRole('button', { name: 'Swiffer', exact: true }).click()
    await sheet.getByRole('button', { name: 'Add', exact: true }).click()
    await expect(sheet.getByRole('list', { name: `${room} chores` })).toContainText('Swiffer')
    await page.keyboard.press('Escape')
  }
  await giveChores('Kitchen')
  await giveChores('Living room')

  // Chores: it's mine this week, a box per room, and the word "routine" stays in Admin.
  await page.goto(`/h/${owner.houseId}/chores`)
  await expect(page.getByText(/you have the kitchen and living room · through/)).toBeVisible()
  await expect(page.getByRole('main')).not.toContainText(/routine/i)
  const kitchen = page.getByRole('region', { name: 'Kitchen, Kavya' })
  await expect(page.getByRole('region', { name: 'Living room, Kavya' })).toContainText('Vacuum')
  const tick = kitchen.getByRole('button', { name: 'Did it: Vacuum' })
  await expect(tick).toHaveAttribute('aria-pressed', 'false')

  // Tick it in its box, and Undo.
  await tick.click()
  await expect(tick).toHaveAttribute('aria-pressed', 'true')
  await page
    .getByRole('status')
    .filter({ hasText: 'Did it. Thanks!' })
    .getByRole('button', { name: 'Undo' })
    .click()
  await expect(tick).toHaveAttribute('aria-pressed', 'false')
  // The living room's Vacuum is its own: ticking the kitchen's didn't touch it.
  await expect(
    page
      .getByRole('region', { name: 'Living room, Kavya' })
      .getByRole('button', { name: 'Did it: Vacuum' }),
  ).toHaveAttribute('aria-pressed', 'false')

  // A deep clean chore isn't Home's business, even felt; an Upkeep chore with a feeling is.
  const upkeep = page.getByRole('region', { name: 'Upkeep' })
  await upkeep.getByRole('button', { name: 'Share a feeling: Dishes' }).click()
  await upkeep.getByRole('button', { name: 'Frustrated' }).click()
  await expect(upkeep.getByRole('list', { name: 'Piling up' })).toContainText('Dishes')
  await page.getByRole('link', { name: 'Home' }).click()
  const feed = page.getByRole('list', { name: 'By priority' })
  await expect(feed).toContainText('Dishes')
  await expect(feed).not.toContainText('Vacuum')

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
