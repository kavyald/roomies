import { expect, test } from '@playwright/test'
import { aRoommate, anOwner, dismissInstallGuide, signIn } from './support'

test('a need added on one phone appears on another within a couple of seconds', async ({
  browser,
}) => {
  const owner = await anOwner('Kavya')
  const sam = await aRoommate(owner, 'Sam')
  const open = async (email: string) => {
    const page = await (await browser.newContext()).newPage()
    await signIn(page, email)
    await expect(page).toHaveURL(new RegExp(`/h/${owner.houseId}$`))
    await dismissInstallGuide(page)
    await page.goto(`/h/${owner.houseId}/needs`)
    return page
  }
  const kavya = await open(owner.email)
  const samPage = await open(sam.email)
  await expect(kavya.getByText('Nothing to buy. Nice.')).toBeVisible()

  const weNeed = samPage.getByLabel('We need…')
  await weNeed.fill('Paper towels')
  await weNeed.press('Enter')
  await expect(samPage.getByRole('list', { name: 'Needs' })).toContainText('Paper towels')

  // No reload on Kavya's phone.
  await expect(kavya.getByRole('list', { name: 'Needs' })).toContainText('Paper towels', {
    timeout: 3000,
  })
})
