// Axe on every screen, light and dark (TESTING.md Q4): no critical or serious issues, and no
// Content-Security-Policy violations (T52, ARCHITECTURE §5.4).
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { aPoll, aRun, anItem, anOwner, dismissInstallGuide, signIn } from './support'

/** Collects CSP violations from the console and from `securitypolicyviolation` events. */
const watchCsp = async (page: Page) => {
  const seen: string[] = []
  page.on('console', (m) => {
    if (m.text().includes('Content Security Policy')) seen.push(`console: ${m.text()}`)
  })
  await page.exposeFunction('__reportCspViolation', (v: string) => seen.push(`event: ${v}`))
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => {
      const report = (window as unknown as { __reportCspViolation: (v: string) => void })
        .__reportCspViolation
      report(`${e.effectiveDirective} blocked ${e.blockedURI || 'inline'} on ${location.pathname}`)
    })
  })
  return seen
}

let cspViolations: string[] = []

const check = async (page: Page, screen: string) => {
  expect(cspViolations, `${screen}: CSP violations`).toEqual([])
  const { violations } = await new AxeBuilder({ page }).analyze()
  const bad = violations
    .filter((v) => v.impact === 'critical' || v.impact === 'serious')
    .map((v) => `${screen}: ${v.id} (${v.impact}) × ${v.nodes.length}: ${v.nodes[0]?.target}`)
  expect(bad, bad.join('\n')).toEqual([])
}

for (const colorScheme of ['light', 'dark'] as const) {
  test(`every screen passes axe in ${colorScheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme })
    cspViolations = await watchCsp(page)
    const signInPage = await page.goto('/sign-in')
    const csp = (await signInPage?.allHeaders())?.['content-security-policy'] ?? ''
    expect(csp).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/)
    expect(csp).toContain("frame-ancestors 'none'")
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
    const seededPoll = await aPoll(owner, 'Movie night?')
    const seededRun = await aRun(owner, 'Groceries')
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
    // The emoji tray on a row, and + on Needs (straight to a need, with Add another).
    await page.goto(`${h}/needs`)
    await page.getByRole('button', { name: 'Share a feeling: Olive oil' }).click()
    await expect(page.getByRole('group', { name: 'How do you feel about this?' })).toBeVisible()
    await check(page, 'emoji tray')
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    await expect(page.getByRole('dialog', { name: 'A need' })).toBeVisible()
    await check(page, 'add sheet (a need)')
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog', { name: 'A need' })).toBeHidden()

    await page.goto(`${h}/i/${task}`)
    await expect(page.getByRole('dialog', { name: 'Fix the latch' })).toBeVisible()
    await check(page, 'item')

    // The deep link moves itself back to Home (OpenItem); wait for that instead of racing it.
    await expect(page).toHaveURL(new RegExp(`${h}$`))
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog', { name: 'Fix the latch' })).toBeHidden()

    // Poll and run links (notifications) open their sheets the same way (T58).
    for (const [path, name, what] of [
      [`/p/${seededPoll}`, 'Movie night?', 'poll'],
      [`/r/${seededRun}`, 'Groceries', 'run'],
    ] as const) {
      await page.goto(h + path)
      await expect(page.getByRole('dialog', { name })).toBeVisible()
      await check(page, what)
      await expect(page).toHaveURL(new RegExp(`${h}$`))
      await page.keyboard.press('Escape')
      await expect(page.getByRole('dialog', { name })).toBeHidden()
      await page.goto(`${h}${path.slice(0, 3)}not-a-real-id`)
      await expect(page.getByText(`We couldn't find that ${what}.`, { exact: false })).toBeVisible()
      await check(page, `${what} (unknown id)`)
    }

    await page.goto(h)
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    await expect(page.getByRole('dialog', { name: 'Add something' })).toBeVisible()
    await check(page, 'add sheet')

    // A run's sheet, with its header's rename and point-person controls open (T56).
    await page.keyboard.press('Escape')
    await page.goto(`${h}/needs`)
    await page.getByRole('button', { name: 'Start a run' }).click()
    const start = page.getByRole('dialog', { name: 'Start a run' })
    await start.getByRole('checkbox', { name: 'Olive oil', exact: true }).check()
    await start.getByRole('button', { name: 'More options' }).click()
    await check(page, 'start a run (more options)')
    await start.getByRole('button', { name: 'Start run' }).click()
    const run = page.getByRole('dialog', { name: "Kavya's run" })
    await run.getByLabel('Spent (optional)').fill('12')
    await check(page, 'run sheet (one-tap rows, Spent beside Finish)')
    await run.getByRole('button', { name: "Change who's on it" }).click()
    await expect(run.getByLabel("Who's on it?", { exact: true })).toBeVisible()
    await check(page, 'run sheet (point person)')
    await run.getByRole('button', { name: 'Rename this run' }).click()
    await expect(run.getByRole('textbox', { name: 'Name', exact: true })).toBeVisible()
    await check(page, 'run sheet (rename)')

    // The poll sheet (T55): voted (the take-it-back hint), the deadline editor, and closed.
    await page.goto(h)
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    await page
      .getByRole('dialog', { name: 'Add something' })
      .getByRole('button', { name: /^A poll/ })
      .click()
    const newPoll = page.getByRole('dialog', { name: 'A poll' })
    await newPoll.getByLabel('Question').fill('House name?')
    await newPoll.getByLabel('Option 1', { exact: true }).fill('The Nest')
    await newPoll.getByLabel('Option 2', { exact: true }).fill('Burrow')
    await newPoll.getByRole('button', { name: 'Start poll' }).click()
    const pollSheet = page.getByRole('dialog', { name: 'House name?' })
    await pollSheet.getByRole('radio', { name: /The Nest/ }).click()
    await expect(pollSheet).toContainText('Tap your pick again')
    await check(page, 'poll sheet')
    await pollSheet.getByRole('button', { name: 'Add a deadline' }).click()
    await expect(pollSheet.getByLabel('Closes', { exact: true })).toBeVisible()
    await check(page, 'poll sheet (deadline)')
    await pollSheet.getByRole('button', { name: 'Cancel' }).click()
    await pollSheet.getByRole('button', { name: 'Close poll' }).click()
    await expect(pollSheet.getByRole('button', { name: 'Reopen poll' })).toBeVisible()
    await check(page, 'poll sheet (closed)')
  })
}
