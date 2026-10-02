// Axe on every screen, light and dark (TESTING.md Q4): no critical or serious issues.
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { anItem, anOwner, dismissInstallGuide, signIn } from './support'

const check = async (page: Page, screen: string) => {
  const { violations } = await new AxeBuilder({ page }).analyze()
  const bad = violations
    .filter((v) => v.impact === 'critical' || v.impact === 'serious')
    .map((v) => `${screen}: ${v.id} (${v.impact}) × ${v.nodes.length}: ${v.nodes[0]?.target}`)
  expect(bad, bad.join('\n')).toEqual([])
}

for (const colorScheme of ['light', 'dark'] as const) {
  test(`every screen passes axe in ${colorScheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme })
    await page.goto('/sign-in')
    await expect(page.getByLabel('Your email')).toBeVisible()
    await check(page, 'sign-in')
    await page.goto('/join/not-a-real-token')
    await expect(page.getByText("This invite link doesn't work.", { exact: false })).toBeVisible()
    await check(page, 'join (bad link)')
    await page.goto('/offline')
    await check(page, 'offline')

    const owner = await anOwner('Kavya')
    const task = await anItem(owner, { category: 'task', title: 'Fix the latch' })
    await anItem(owner, { category: 'need', title: 'Olive oil' })
    await anItem(owner, { category: 'chore', title: 'Trash', repeatDays: 7, lastDoneDaysAgo: 9 })
    await signIn(page, owner.email)
    await expect(page).toHaveURL(new RegExp(`/h/${owner.houseId}$`))
    await dismissInstallGuide(page)
    await check(page, 'home')

    const h = `/h/${owner.houseId}`
    for (const [path, heading] of [
      ['/needs', 'Needs'],
      ['/chores', 'Chores'],
      ['/tasks', 'Tasks'],
      ['/house', 'House'],
      ['/activity', 'Activity'],
      ['/calendar', 'Calendar'],
      ['/me', 'You'],
    ] as const) {
      await page.goto(h + path)
      await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible()
      await check(page, path)
    }
    await page.goto(`${h}/i/${task}`)
    await expect(page.getByRole('dialog', { name: 'Fix the latch' })).toBeVisible()
    await check(page, 'item')

    // The deep link moves itself back to Home (OpenItem); wait for that instead of racing it.
    await expect(page).toHaveURL(new RegExp(`${h}$`))
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog', { name: 'Fix the latch' })).toBeHidden()
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    await expect(page.getByRole('dialog', { name: 'Add something' })).toBeVisible()
    await check(page, 'add sheet')

    // A run's sheet, with its header's rename and point-person controls open (T56).
    await page.keyboard.press('Escape')
    await page.goto(`${h}/needs`)
    await page.getByRole('button', { name: 'Start a run' }).click()
    const start = page.getByRole('dialog', { name: 'Start a run' })
    await start.getByRole('checkbox', { name: 'Olive oil', exact: true }).check()
    await start.getByRole('button', { name: 'Start run' }).click()
    const run = page.getByRole('dialog', { name: "Kavya's run" })
    await run.getByRole('button', { name: "Change who's on it" }).click()
    await expect(run.getByLabel("Who's on it?", { exact: true })).toBeVisible()
    await check(page, 'run sheet (point person)')
    await run.getByRole('button', { name: 'Rename this run' }).click()
    await expect(run.getByRole('textbox', { name: 'Name', exact: true })).toBeVisible()
    await check(page, 'run sheet (rename)')
  })
}
