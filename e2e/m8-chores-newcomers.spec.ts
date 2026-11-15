// T112 (with T105): the Chores tab for someone no routine reaches. The tab says so and links to
// who has which rooms; organizers see who's left out in House → Routines; a room's sheet opens on
// its checklist with setting up chores behind Edit chores. Axe in light and dark.
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { aRoommate, aRoutine, anItem, ownerOnHouseTab } from './support'

const axe = async (page: Page, screen: string) => {
  const { violations } = await new AxeBuilder({ page }).analyze()
  const bad = violations
    .filter((v) => v.impact === 'critical' || v.impact === 'serious')
    .map((v) => `${screen}: ${v.id} (${v.impact}) × ${v.nodes.length}: ${v.nodes[0]?.target}`)
  expect(bad, bad.join('\n')).toEqual([])
}

for (const colorScheme of ['light', 'dark'] as const) {
  test(`someone on no routine is told, and so are organizers (${colorScheme})`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme })
    const owner = await ownerOnHouseTab(page)
    const sam = await aRoommate(owner, 'Sam')
    // Every routine is always Sam's: no routine reaches Kavya.
    await aRoutine(owner, {
      name: 'Bathrooms and laundry',
      rooms: ['Kitchen', 'Living room', 'Garden'],
      holder: sam.userId,
      fixed: true,
    })
    for (const title of ['Clean mirror', 'Mop floor', 'Scrub toilet', 'Trash', 'Wipe sink'])
      await anItem(owner, { category: 'chore', title, kind: 'deep_clean', rooms: ['Kitchen'] })
    await anItem(owner, {
      category: 'chore',
      title: 'Weeds',
      kind: 'deep_clean',
      rooms: ['Garden'],
    })

    await page.goto(`/h/${owner.houseId}/chores`)
    await expect(page.getByText("You're not looking after any rooms yet.")).toBeVisible()
    await expect(page.getByRole('main')).not.toContainText(/routine/i)
    const theirs = page.getByRole('group', { name: 'Bathrooms and laundry, Sam' })
    await expect(theirs).toContainText("Sam's")
    const kitchen = theirs.getByRole('button', { name: 'Kitchen, Sam' })
    await expect(kitchen).toContainText(
      'Clean mirror, mop floor, scrub toilet, trash and wipe sink',
    )
    await axe(page, 'chores (on no routine)')

    // The room's sheet opens on its checklist; setting up chores is behind Edit chores.
    await kitchen.click()
    const sheet = page.getByRole('dialog', { name: 'Kitchen' })
    await expect(sheet).toContainText('Sam looks after it')
    await expect(sheet.getByRole('button', { name: 'Did it: Trash' })).toBeVisible()
    await expect(sheet.getByRole('list', { name: 'Chores to add' })).toBeHidden()
    await axe(page, 'chores (room sheet)')
    await sheet.getByRole('button', { name: 'Edit chores' }).click()
    await expect(sheet.getByRole('list', { name: 'Chores to add' })).toBeVisible()
    await expect(sheet.getByRole('searchbox', { name: 'Search chores' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(sheet).toBeHidden()

    // The link goes to who has which rooms, where the organizer sees who's left out.
    await page.getByRole('link', { name: 'Who has which rooms' }).click()
    await expect(page).toHaveURL(new RegExp(`/h/${owner.houseId}/house/routines$`))
    await expect(page.getByText("Kavya isn't on a routine yet.", { exact: false })).toBeVisible()
    await axe(page, 'house routines (someone left out)')
  })
}
