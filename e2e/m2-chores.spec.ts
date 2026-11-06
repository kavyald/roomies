import { expect, test } from '@playwright/test'
import { aRoommate, aRoutine, anItem, ownerOnHouseTab } from './support'

test('your card says what you have; ticking a Deep clean chore works, with Undo', async ({
  page,
}) => {
  const owner = await ownerOnHouseTab(page)
  const sam = await aRoommate(owner, 'Sam')
  await aRoutine(owner, { name: 'Kitchen', rooms: ['Kitchen'], holder: owner.userId })
  await aRoutine(owner, { name: 'Garden', rooms: ['Garden'], holder: sam.userId, sortOrder: 1 })
  await anItem(owner, { category: 'chore', title: 'Sink', kind: 'deep_clean', rooms: ['Kitchen'] })
  await anItem(owner, {
    category: 'chore',
    title: 'Vacuum',
    kind: 'deep_clean',
    icon: 'broom',
    rooms: ['Kitchen', 'Living room'],
  })
  await anItem(owner, { category: 'chore', title: 'Weeds', kind: 'deep_clean', rooms: ['Garden'] })

  await page.goto(`/h/${owner.houseId}/chores`)
  await expect(page.getByText(/you have the kitchen · through/)).toBeVisible()
  const cards = page.getByRole('list', { name: 'Who has what' }).getByRole('button')
  await expect(cards).toHaveCount(2)
  await expect(cards.first()).toHaveAccessibleName('Kitchen, Kavya')
  await expect(cards.nth(1)).toHaveAccessibleName('Garden, Sam')
  await expect(page.getByRole('main')).not.toContainText(/routine|due|overdue/i)

  await cards.first().click()
  const sheet = page.getByRole('dialog', { name: 'Kitchen' })
  await expect(sheet).toContainText('Vacuum · kitchen, living room')
  await expect(sheet.getByRole('img', { name: /^Sam/ })).toBeVisible() // who's next
  await sheet.getByRole('button', { name: 'Did it: Sink' }).click()
  const toast = page.getByRole('status').filter({ hasText: 'Did it. Thanks!' })
  await expect(toast).toBeVisible()
  const tick = sheet.getByRole('button', { name: 'Did it: Sink' })
  await expect(tick).toHaveAttribute('aria-pressed', 'true')

  // Undo puts it back to the last done before (T54); the sheet stays open.
  await toast.getByRole('button', { name: 'Undo' }).click()
  await expect(tick).toHaveAttribute('aria-pressed', 'false')

  // Tapping a ticked chore undoes it too.
  await tick.click()
  await expect(tick).toHaveAttribute('aria-pressed', 'true')
  await tick.click()
  await expect(tick).toHaveAttribute('aria-pressed', 'false')

  // Every chore ticked: VoiceOver hears it on your card.
  await tick.click()
  await expect(tick).toHaveAttribute('aria-pressed', 'true')
  await sheet.getByRole('button', { name: 'Did it: Vacuum' }).click()
  await page.keyboard.press('Escape')
  await expect(cards.first()).toHaveAccessibleDescription('All done')
})

test('quick add from a room or Upkeep; Upkeep goes from all calm to felt and back', async ({
  page,
}) => {
  const owner = await ownerOnHouseTab(page)
  await aRoutine(owner, { name: 'Kitchen', rooms: ['Kitchen'], holder: owner.userId, fixed: true })
  await anItem(owner, {
    category: 'chore',
    title: 'Take out the trash',
    icon: 'trash-2',
    lastDoneDaysAgo: 9,
  })

  await page.goto(`/h/${owner.houseId}/chores`)
  await page.getByRole('button', { name: 'Kitchen, Kavya' }).click()
  const sheet = page.getByRole('dialog', { name: 'Kitchen' })
  await sheet.getByRole('button', { name: 'Add to Kitchen' }).click() // 1
  const add = page.getByRole('dialog', { name: 'Add to Kitchen' })
  await add.getByLabel('What needs doing?').fill('Oven')
  await add.getByRole('button', { name: 'Spray can' }).click() // 2
  await add.getByRole('button', { name: 'Add', exact: true }).click() // 3
  await expect(sheet.getByRole('button', { name: 'Did it: Oven' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(sheet).toBeHidden()

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

test('the chore sheet edits its icon, kind and rooms', async ({ page }) => {
  const owner = await ownerOnHouseTab(page)
  await aRoutine(owner, { name: 'Kitchen', rooms: ['Kitchen'], holder: owner.userId, fixed: true })
  await anItem(owner, { category: 'chore', title: 'Vacuum', rooms: ['Living room'] })

  await page.goto(`/h/${owner.houseId}/chores`)
  const upkeep = page.getByRole('region', { name: 'Upkeep' })
  await upkeep.getByRole('button', { name: 'Share a feeling: Vacuum' }).click()
  await upkeep.getByRole('button', { name: 'See details' }).click()
  const detail = page.getByRole('dialog', { name: 'Vacuum' })
  await detail.getByRole('button', { name: 'Edit' }).click()
  const edit = page.getByRole('dialog', { name: 'Edit chore' })
  await edit.getByRole('button', { name: 'Deep clean' }).click()
  await edit.getByLabel('Rooms', { exact: true }).selectOption({ label: 'Kitchen' })
  await edit.getByRole('button', { name: 'Broom' }).click()
  await edit.getByRole('button', { name: 'Save' }).click()
  await expect(detail).toContainText('Chore · Deep clean')
  await expect(detail).toContainText('Rooms')
  await page.keyboard.press('Escape')

  // Its first room is in a card now, so it's left Upkeep.
  await expect(upkeep.getByRole('button', { name: 'Share a feeling: Vacuum' })).toBeHidden()
  await page.getByRole('button', { name: 'Kitchen, Kavya' }).click()
  await expect(
    page.getByRole('dialog', { name: 'Kitchen' }).getByRole('button', { name: 'Did it: Vacuum' }),
  ).toBeVisible()
})
