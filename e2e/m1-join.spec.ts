import { expect, test } from '@playwright/test'
import { latestCode } from '../lib/testing/mailpit'
import { anOwner, dismissInstallGuide, freshEmail, signIn } from './support'

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
  await expect(roommates.getByRole('button', { name: /Maya, Fire room/ })).toBeVisible()
  await expect(roommates).toContainText('Kavya')

  // Everyone gets the join in the activity log, as one line (joining and picking a room are one
  // action).
  await ownerPage.goto(`/h/${owner.houseId}/activity`)
  const feed = ownerPage.getByRole('list', { name: 'Activity' })
  await expect(feed).toContainText('Maya joined the house')
  await expect(feed).not.toContainText('Maya moved into Fire')

  // The link keeps working for the other open rooms, and says how many are used.
  await ownerPage.goto(`/h/${owner.houseId}/house`)
  await expect(ownerPage.getByRole('list', { name: 'Invite links' })).toContainText('1 of 4 used')

  // The owner removes Maya; she loses access right away.
  await ownerPage
    .getByRole('list', { name: 'Roommates' })
    .getByRole('button', { name: /Maya/ })
    .click()
  const sheet = ownerPage.getByRole('dialog', { name: 'Maya' })
  await sheet.getByRole('button', { name: 'Remove from the house' }).click()
  await sheet.getByRole('button', { name: 'Remove Maya' }).click()
  await expect(ownerPage.getByRole('list', { name: 'Roommates' })).not.toContainText('Maya')

  await maya.goto(`/h/${owner.houseId}/house`)
  await expect(maya).toHaveURL(/\/$/)
  await expect(
    maya.getByText("You're no longer a member of this house.", { exact: false }),
  ).toBeVisible()

  await ownerCtx.close()
  await mayaCtx.close()
})

test('a bad link explains itself kindly', async ({ page }) => {
  await page.goto('/join/not-a-real-token-at-all')
  await expect(
    page.getByText("This invite link doesn't work. Ask a roommate for a fresh one."),
  ).toBeVisible()
})
