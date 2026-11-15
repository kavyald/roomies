// T110: onboarding. Joining (and setup) land on a welcome, then a notifications step that fits
// the device, then House. The push half is stubbed as an installed iPhone (support.ts), since
// Playwright can't reach a real push service; the plain iPhone profile (Safari, not installed)
// is m1-join's journey. Setup runs once per database, so its journey starts where setup lands.
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import {
  anInviteLink,
  anOwner,
  joinWith,
  signIn,
  stubInstalledIphonePush as installedIphone,
} from './support'

const axeClean = async (page: Page, screen: string) => {
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme })
    const { violations } = await new AxeBuilder({ page }).analyze()
    const bad = violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')
    expect(bad, `${screen} (${colorScheme})`).toEqual([])
  }
}

const welcome = async (page: Page) => {
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Welcome to The apartment 👋')
  const tabs = page.getByRole('list', { name: 'The tabs' }).getByRole('listitem')
  await expect(tabs).toHaveText([/^Needs/, /^Tasks/, /^Chores/, /^House/])
  // Onboarding comes before the app: no tab bar and no sheet on top.
  await expect(page.getByRole('navigation')).toHaveCount(0)
  await expect(page.getByRole('dialog')).toHaveCount(0)
}

const landsOnHouse = async (page: Page, houseId: string) => {
  await expect(page).toHaveURL(new RegExp(`/h/${houseId}$`))
  await expect(page.getByRole('heading', { level: 1, name: 'House' })).toBeVisible()
  await page.waitForTimeout(500) // the prompt on open decides just after load
  await expect(page.getByRole('dialog')).toHaveCount(0)
}

test('joining on an installed iPhone: welcome, Turn on, then House', async ({ page }) => {
  await installedIphone(page)
  const owner = await anOwner('Kavya')
  await joinWith(page, await anInviteLink(owner), 'Maya', 'Fire')

  await welcome(page)
  await axeClean(page, 'welcome')
  await page.getByRole('button', { name: 'Next' }).click()

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Turn on notifications?')
  await axeClean(page, 'notifications')
  await page.getByRole('button', { name: 'Turn on' }).click()
  await expect(page.getByText('Notifications are on. 🔔')).toBeVisible()
  await landsOnHouse(page, owner.houseId)

  await page.goto(`/h/${owner.houseId}/me/notifications`)
  await expect(page.getByRole('group', { name: 'This device' })).toContainText(
    'On for this device.',
  )
})

test('joining with notifications blocked: the steps inline, then Skip for now', async ({
  page,
}) => {
  await installedIphone(page, 'denied')
  const owner = await anOwner('Kavya')
  await joinWith(page, await anInviteLink(owner), 'Sam', 'Water')

  await welcome(page)
  await page.getByRole('button', { name: 'Next' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Notifications are blocked')
  await expect(
    page.getByRole('list', { name: 'How to turn them on' }).getByRole('listitem'),
  ).toHaveText([
    /Open the Settings app/,
    /Tap Notifications, then scroll down and tap Roomies/,
    /Turn on Allow Notifications/,
    /turn on by themselves/,
  ])
  await axeClean(page, 'notifications blocked')
  await page.getByRole('button', { name: 'Skip for now' }).click()
  await landsOnHouse(page, owner.houseId)
})

test('after setup: Not now says where to turn them on later, and is remembered', async ({
  page,
}) => {
  await installedIphone(page)
  const owner = await anOwner('Kavya')
  await signIn(page, owner.email)
  await expect(page).toHaveURL(new RegExp(`/h/${owner.houseId}$`))
  // Where setup lands (SetupFlow.test covers the redirect): the owner's own onboarding.
  await page.goto(`/h/${owner.houseId}/welcome`)
  await welcome(page)
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByRole('button', { name: 'Not now' }).click()
  await expect(
    page.getByText('No problem. You can turn them on later from You → Notifications.'),
  ).toBeVisible()
  await landsOnHouse(page, owner.houseId)
  await page.reload()
  await landsOnHouse(page, owner.houseId)
})
