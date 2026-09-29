import { expect, test, type Page } from '@playwright/test'
import { latestCode } from '../lib/testing/mailpit'
import { anOwner, freshEmail } from './support'

const signIn = async (page: Page, email: string) => {
  await page.goto('/sign-in')
  await page.getByLabel('Your email').fill(email)
  await page.getByRole('button', { name: 'Send me a code' }).click()
  await page.getByLabel('6-digit code').fill(await latestCode(email))
}

const dismissInstallGuide = async (page: Page) => {
  const guide = page.getByRole('dialog', { name: 'Add Roomies to your Home Screen' })
  await guide.getByRole('button', { name: 'Maybe later' }).click()
  await expect(guide).toBeHidden()
}

test('the owner invites, and a roommate joins with a code and picks their room', async ({
  browser,
}) => {
  const owner = await anOwner('Kavya')

  // The owner, in their own browser, makes an invite link on the House tab.
  const ownerCtx = await browser.newContext()
  const ownerPage = await ownerCtx.newPage()
  await signIn(ownerPage, owner.email)
  await expect(ownerPage).toHaveURL(new RegExp(`/h/${owner.houseId}$`))
  await dismissInstallGuide(ownerPage)
  await ownerPage.goto(`/h/${owner.houseId}/house`)
  await ownerPage.getByRole('button', { name: 'Make an invite link' }).click()
  const inviteSection = ownerPage.getByRole('region', { name: 'Invite link' })
  await expect(inviteSection).toContainText('for up to 4 people') // four free bedrooms
  const link = (await inviteSection.locator('p.font-mono').textContent())!.trim()
  expect(link).toMatch(/\/join\/[A-Za-z0-9_-]{22}$/)

  // A roommate, in a separate browser, opens the link.
  const mayaCtx = await browser.newContext()
  const maya = await mayaCtx.newPage()
  const mayaEmail = freshEmail('maya')
  await maya.goto(link)
  await expect(maya.getByRole('heading', { level: 1 })).toHaveText(
    'Kavya invited you to The apartment 🏠',
  )
  await maya.getByLabel('Your name').fill('Maya')
  await maya.getByLabel('Your email').fill(mayaEmail)
  await maya.getByRole('button', { name: 'Send me a code' }).click()
  await maya.getByLabel('6-digit code').fill(await latestCode(mayaEmail))

  await expect(maya.getByRole('heading', { name: 'Which room is yours?' })).toBeVisible()
  await maya.getByRole('radio', { name: 'Fire' }).click()
  await maya.getByRole('button', { name: 'Join the house' }).click()
  await expect(maya).toHaveURL(new RegExp(`/h/${owner.houseId}$`))
  await dismissInstallGuide(maya)

  // Maya sees the house, and herself in Fire.
  await maya.goto(`/h/${owner.houseId}/house`)
  const roommates = maya.getByRole('list', { name: 'Roommates' })
  await expect(roommates.getByRole('img', { name: 'Maya, Fire room' })).toBeVisible()
  await expect(roommates).toContainText('Kavya')

  // Everyone gets the join in the activity log.
  await ownerPage.goto(`/h/${owner.houseId}/activity`)
  await expect(ownerPage.getByRole('list', { name: 'Activity' })).toContainText(
    'Maya joined the house',
  )

  // The link keeps working for the other open rooms, and says how many are used.
  await ownerPage.goto(`/h/${owner.houseId}/house`)
  await expect(ownerPage.getByRole('list', { name: 'Invite links' })).toContainText('1 of 4 used')

  await ownerCtx.close()
  await mayaCtx.close()
})

test('a bad link explains itself kindly', async ({ page }) => {
  await page.goto('/join/not-a-real-token-at-all')
  await expect(
    page.getByText("This invite link doesn't work. Ask a roommate for a fresh one."),
  ).toBeVisible()
})
