import { expect, test } from '@playwright/test'
import { aRoommate, aRoutine, anItem, ownerOnHouseTab } from './support'

test("your rooms say what you have and tick in place, with Undo; a housemate's room opens", async ({
  page,
}) => {
  const owner = await ownerOnHouseTab(page)
  const sam = await aRoommate(owner, 'Sam')
  await aRoutine(owner, {
    name: 'Kitchen and living',
    rooms: ['Kitchen', 'Living room'],
    holder: owner.userId,
  })
  await aRoutine(owner, { name: 'Outside', rooms: ['Garden'], holder: sam.userId, sortOrder: 1 })
  await anItem(owner, { category: 'chore', title: 'Sink', kind: 'deep_clean', rooms: ['Kitchen'] })
  await anItem(owner, {
    category: 'chore',
    title: 'Vacuum',
    kind: 'deep_clean',
    icon: 'robot-vacuum',
    rooms: ['Living room'],
  })
  await anItem(owner, { category: 'chore', title: 'Weeds', kind: 'deep_clean', rooms: ['Garden'] })

  await page.goto(`/h/${owner.houseId}/chores`)
  await expect(page.getByText(/you have the kitchen and living room · through/)).toBeVisible()
  const mine = page.getByRole('group', { name: 'Kitchen and living, Kavya' })
  const theirs = page.getByRole('group', { name: 'Outside, Sam' })
  await expect(mine).toBeVisible()
  await expect(theirs).toBeVisible()
  await expect(page.getByRole('main')).not.toContainText(/routine|due|overdue/i)
  // A housemate's room has no ticks: just its chores' icons (PRD §6.2).
  await expect(theirs.getByRole('button', { name: /^Did it/ })).toHaveCount(0)

  const kitchen = mine.getByRole('region', { name: 'Kitchen, Kavya' })
  await kitchen.getByRole('button', { name: 'Did it: Sink' }).click()
  const toast = page.getByRole('status').filter({ hasText: 'Did it. Thanks!' })
  await expect(toast).toBeVisible()
  const tick = kitchen.getByRole('button', { name: 'Did it: Sink' })
  await expect(tick).toHaveAttribute('aria-pressed', 'true')

  // Undo puts it back to the last done before (T54).
  await toast.getByRole('button', { name: 'Undo' }).click()
  await expect(tick).toHaveAttribute('aria-pressed', 'false')

  // Tapping a ticked chore undoes it too.
  await tick.click()
  await expect(tick).toHaveAttribute('aria-pressed', 'true')
  await tick.click()
  await expect(tick).toHaveAttribute('aria-pressed', 'false')

  // Every chore in the room ticked: ✨, and VoiceOver hears it.
  await tick.click()
  await expect(tick).toHaveAttribute('aria-pressed', 'true')
  await expect(kitchen).toContainText('✨')
  await expect(
    kitchen.getByRole('button', { name: 'Kitchen details' }),
  ).toHaveAccessibleDescription('All done')

  // A housemate's room opens its sheet, where anyone can tick and who's next shows.
  await theirs.getByRole('button', { name: 'Garden, Sam' }).click()
  const sheet = page.getByRole('dialog', { name: 'Garden' })
  await expect(sheet.getByRole('img', { name: /^Kavya/ })).toBeVisible() // who's next
  await sheet.getByRole('button', { name: 'Did it: Weeds' }).click()
  await expect(sheet.getByRole('button', { name: 'Did it: Weeds' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
})

test('quick add to Upkeep; Upkeep goes from all calm to felt and back', async ({ page }) => {
  const owner = await ownerOnHouseTab(page)
  await anItem(owner, {
    category: 'chore',
    title: 'Take out the trash',
    icon: 'trash-2',
    lastDoneDaysAgo: 9,
  })

  await page.goto(`/h/${owner.houseId}/chores`)
  const upkeep = page.getByRole('region', { name: 'Upkeep' })
  await upkeep.getByRole('button', { name: 'Add to Upkeep' }).click()
  const addUpkeep = page.getByRole('dialog', { name: 'Add to Upkeep' })
  await addUpkeep.getByLabel('What needs doing?').fill('Dishes')
  await addUpkeep.getByLabel('Room', { exact: true }).selectOption({ label: 'Kitchen' })
  await addUpkeep.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(addUpkeep).toBeHidden()

  await expect(upkeep).toContainText('All calm')
  await upkeep.getByRole('button', { name: 'Share a feeling: Dishes' }).click()
  await upkeep.getByRole('button', { name: 'Frustrated' }).click()
  const felt = upkeep.getByRole('list', { name: 'Piling up' }).getByRole('listitem')
  await expect(felt).toContainText('Dishes')
  await expect(felt).toContainText('kitchen')
  await expect(felt).toContainText('😤')
  await expect(felt.getByRole('img', { name: /^Kavya/ })).toBeVisible()
  await expect(upkeep).not.toContainText('All calm')

  // Took care of it: the feeling stops counting and it's calm again, with Undo.
  await upkeep.getByRole('button', { name: 'Took care of it: Dishes' }).click()
  await expect(upkeep).toContainText('All calm')
  const toast = page.getByRole('status').filter({ hasText: 'Taken care of.' })
  await toast.getByRole('button', { name: 'Undo' }).click()
  await expect(felt).toContainText('Dishes')

  // A chip's details are one tap on from its tray: when it was last done.
  await upkeep.getByRole('button', { name: 'Share a feeling: Take out the trash' }).click()
  await upkeep.getByRole('button', { name: 'See details' }).click()
  const detail = page.getByRole('dialog', { name: 'Take out the trash' })
  await expect(detail).toContainText('Last done')
  await expect(detail).toContainText('Kavya')
})

test('the chore sheet edits its icon, kind and room', async ({ page }) => {
  const owner = await ownerOnHouseTab(page)
  await aRoutine(owner, { name: 'Cooking', rooms: ['Kitchen'], holder: owner.userId, fixed: true })
  await anItem(owner, { category: 'chore', title: 'Vacuum', rooms: ['Living room'] })

  await page.goto(`/h/${owner.houseId}/chores`)
  const upkeep = page.getByRole('region', { name: 'Upkeep' })
  await upkeep.getByRole('button', { name: 'Share a feeling: Vacuum' }).click()
  await upkeep.getByRole('button', { name: 'See details' }).click()
  const detail = page.getByRole('dialog', { name: 'Vacuum' })
  await detail.getByRole('button', { name: 'Edit' }).click()
  const edit = page.getByRole('dialog', { name: 'Edit chore' })
  await edit.getByRole('button', { name: 'Deep clean' }).click()
  // One room per chore (T101), and the name suggests its icons.
  await edit.getByLabel('Room', { exact: true }).selectOption({ label: 'Kitchen' })
  await edit
    .getByRole('group', { name: 'Suggested icons' })
    .getByRole('button', { name: 'Broom', exact: true })
    .click()
  await edit.getByRole('button', { name: 'Save' }).click()
  await expect(detail).toContainText('Chore · Deep clean')
  await expect(detail).toContainText('Room')
  await page.keyboard.press('Escape')

  // Its room is in a routine now, so it's left Upkeep for the holder's box.
  await expect(upkeep.getByRole('button', { name: 'Share a feeling: Vacuum' })).toBeHidden()
  await expect(
    page
      .getByRole('region', { name: 'Kitchen, Kavya' })
      .getByRole('button', { name: 'Did it: Vacuum' }),
  ).toBeVisible()
})
