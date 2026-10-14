// T68: icons instead of word buttons. Select all is one toggle, every edit is the same Pencil,
// Edit and Delete sit in the header (no "…" menu), and every icon button is a 44pt target.
import { randomUUID } from 'node:crypto'
import { expect, test, type Locator } from '@playwright/test'
import { asOwner } from '../lib/testing/db'
import { aPoll, aRun, anItem, anOwner, dismissInstallGuide, signIn } from './support'

/** Layout size, not boundingBox: sheets may still be animating open (a transform). */
const isTapTarget = async (button: Locator) => {
  const { width, height } = await button.evaluate((el: HTMLElement) => ({
    width: el.offsetWidth,
    height: el.offsetHeight,
  }))
  expect(width, 'tap target width').toBeGreaterThanOrEqual(44)
  expect(height, 'tap target height').toBeGreaterThanOrEqual(44)
}

test.use({ viewport: { width: 375, height: 812 } })

test('icon buttons: Select all toggles, one Pencil edits, Edit and Delete are direct, all 44pt', async ({
  page,
}) => {
  test.slow()
  const owner = await anOwner('Kavya')
  const contact = randomUUID()
  await asOwner((db) =>
    db.query(
      `insert into contacts (id, house_id, name, phone) values ($1, $2, 'Super', '(555) 010-2231')`,
      [contact, owner.houseId],
    ),
  )
  const task = await anItem(owner, { category: 'task', title: 'Fix the radiator valve' })
  await asOwner((db) => db.query('update items set contact_id = $1 where id = $2', [contact, task]))
  await anItem(owner, { category: 'need', title: 'Milk' })
  await anItem(owner, { category: 'need', title: 'Eggs' })
  const run = await aRun(owner, 'Costco trip')
  const poll = await aPoll(owner, 'Movie night?')
  await asOwner((db) =>
    db.query("update polls set closes_at = now() + interval '3 days' where id = $1", [poll]),
  )

  await signIn(page, owner.email)
  await expect(page).toHaveURL(new RegExp(`/h/${owner.houseId}$`))
  await dismissInstallGuide(page)
  const h = `/h/${owner.houseId}`

  // The item sheet: Pencil and Trash2 in the header, no "…" menu; Handled by copies and edits.
  await page.goto(`${h}/i/${task}`)
  const detail = page.getByRole('dialog', { name: 'Fix the radiator valve' })
  await expect(detail.getByRole('button', { name: 'More actions' })).toHaveCount(0)
  for (const name of [
    'Edit',
    'Delete',
    "Copy Super's number",
    "Change who's handling it",
  ] as const) {
    const button = detail.getByRole('button', { name, exact: true })
    await expect(button).toBeVisible()
    await isTapTarget(button)
  }
  await page.keyboard.press('Escape')
  await expect(detail).toBeHidden()

  // Start a run: Select all is pressed while everything's checked, and clears them.
  await page.goto(`${h}/needs`)
  await page.getByRole('button', { name: 'Start a run' }).click()
  const start = page.getByRole('dialog', { name: 'Start a run' })
  const all = start.getByRole('button', { name: 'Select all' })
  await expect(all).toHaveAttribute('aria-pressed', 'true')
  await isTapTarget(all)
  await all.click()
  await expect(all).toHaveAttribute('aria-pressed', 'false')
  await expect(start.getByRole('checkbox', { name: 'Milk', exact: true })).not.toBeChecked()
  await all.click()
  await expect(start.getByRole('checkbox', { name: 'Milk', exact: true })).toBeChecked()
  await page.keyboard.press('Escape')
  await expect(start).toBeHidden()

  // A run: Rename is the header's Pencil; who's on it is a Pencil too.
  await page.goto(`${h}/r/${run}`)
  const sheet = page.getByRole('dialog', { name: 'Costco trip' })
  for (const name of ['Rename this run', "Change who's on it"]) {
    const button = sheet.getByRole('button', { name })
    await expect(button).toBeVisible()
    await isTapTarget(button)
  }
  await page.keyboard.press('Escape')
  await expect(sheet).toBeHidden()

  // A poll's deadline is changed with the Pencil.
  await page.goto(`${h}/p/${poll}`)
  const pollSheet = page.getByRole('dialog', { name: 'Movie night?' })
  const deadline = pollSheet.getByRole('button', { name: 'Change the deadline' })
  await expect(deadline).toBeVisible()
  await isTapTarget(deadline)
  await page.keyboard.press('Escape')
  await expect(pollSheet).toBeHidden()

  // Admin: a contact row ends with the Pencil (it opens the editor) and copies with an icon.
  await page.goto(`${h}/admin`)
  const contacts = page.getByRole('list', { name: 'Contacts' })
  const copy = contacts.getByRole('button', { name: "Copy Super's number" })
  await expect(copy).toBeVisible()
  await isTapTarget(copy)
  await expect(
    contacts.getByRole('button', { name: /^Super/ }).locator('svg.lucide-pencil'),
  ).toHaveCount(1)
})
