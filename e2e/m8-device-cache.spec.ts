import { expect, test, type Page } from '@playwright/test'
import { asOwner } from '../lib/testing/db'
import { aRoommate, anItem, anOwner, dismissInstallGuide, ownerOnHouseTab, signIn } from './support'

// T114 (ARCHITECTURE A42): the house's lists are kept on this device between opens, and nothing
// of a house stays on a device once nobody is signed in to it.

/** Every house copy this browser holds, as text. */
const keptCopies = (page: Page) =>
  page.evaluate(() =>
    Object.keys(localStorage)
      .filter((k) => k.startsWith('roomies.houseCache'))
      .map((k) => `${k} ${localStorage.getItem(k)}`),
  )

const waitForCopyOf = (page: Page, text: string) =>
  expect.poll(async () => (await keptCopies(page)).join('\n')).toContain(text)

test('the house opens with the copy on this device, and the latest replaces it', async ({
  page,
}) => {
  const owner = await ownerOnHouseTab(page)
  const id = await anItem(owner, { category: 'need', title: 'Olive oil' })
  await page.goto(`/h/${owner.houseId}/needs`)
  const list = page.getByRole('list', { name: 'Needs' })
  await expect(list).toContainText('Olive oil')
  await waitForCopyOf(page, 'Olive oil')

  // Renamed from another phone while this one was closed (no activity row, so no live update).
  await asOwner((db) => db.query("update items set title = 'Rapeseed oil' where id = $1", [id]))
  // The house's items take 3 seconds to arrive.
  await page.route(
    (url) => url.pathname.startsWith('/rest/v1/items'),
    async (route) => {
      await new Promise((r) => setTimeout(r, 3_000))
      await route.continue()
    },
  )
  // The copy goes in after the page hydrates, so React never sees two versions of it.
  const errors: string[] = []
  page.on('console', (m) => void (m.type() === 'error' && errors.push(m.text())))
  page.on('pageerror', (e) => void errors.push(e.message))
  await page.reload()
  await expect(list).toContainText('Olive oil', { timeout: 1_500 })
  await expect(list).toContainText('Rapeseed oil', { timeout: 10_000 })
  await expect(list).not.toContainText('Olive oil')
  expect(errors.filter((e) => /hydrat|did not match|418|423|425/i.test(e))).toEqual([])
})

test('signing out leaves nothing of the house on this device', async ({ page }) => {
  const owner = await ownerOnHouseTab(page)
  await anItem(owner, { category: 'need', title: 'Olive oil' })
  await page.goto(`/h/${owner.houseId}/needs`)
  await waitForCopyOf(page, 'Olive oil')

  await page.getByRole('link', { name: 'Your settings' }).click()
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page).toHaveURL(/\/sign-in$/)
  expect(await keptCopies(page)).toEqual([])
})

test('deleting my account leaves nothing of the house on this device', async ({ page }) => {
  const owner = await anOwner('Kavya')
  await anItem(owner, { category: 'need', title: 'Olive oil' })
  const sam = await aRoommate(owner, 'Sam')
  await signIn(page, sam.email)
  await expect(page).toHaveURL(new RegExp(`/h/${owner.houseId}$`))
  await dismissInstallGuide(page)
  await page.goto(`/h/${owner.houseId}/needs`)
  await waitForCopyOf(page, 'Olive oil')

  await page.getByRole('link', { name: 'Your settings' }).click()
  await page.getByRole('button', { name: 'Delete my account' }).click()
  await page
    .getByRole('dialog', { name: 'Delete your account?' })
    .getByRole('button', { name: 'Delete my account' })
    .click()
  await expect(page).toHaveURL(/\/sign-in$/)
  expect(await keptCopies(page)).toEqual([])
})

test("someone else signing in on this browser never sees the last person's house", async ({
  page,
  context,
}) => {
  const kavya = await ownerOnHouseTab(page)
  await anItem(kavya, { category: 'need', title: 'Olive oil' })
  await page.goto(`/h/${kavya.houseId}/needs`)
  await waitForCopyOf(page, 'Olive oil')

  // The session ends without a sign-out (it ran out, or the cookies were cleared).
  await context.clearCookies()
  await page.goto(`/h/${kavya.houseId}/needs`)
  await expect(page).toHaveURL(/\/sign-in$/)
  await expect.poll(() => keptCopies(page)).toEqual([])

  const jo = await anOwner('Jo')
  await anItem(jo, { category: 'need', title: 'Dish soap' })
  await signIn(page, jo.email)
  await expect(page).toHaveURL(new RegExp(`/h/${jo.houseId}$`))
  // The Home Screen guide is the device's, closed already, so it doesn't show again.
  await page.goto(`/h/${jo.houseId}/needs`)
  await expect(page.getByRole('list', { name: 'Needs' })).toContainText('Dish soap')
  await expect(page.getByText('Olive oil')).toHaveCount(0)
  await waitForCopyOf(page, 'Dish soap')
  expect((await keptCopies(page)).join('\n')).not.toContain(kavya.userId)
})
