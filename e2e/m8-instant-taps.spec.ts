import { expect, test, type Page } from '@playwright/test'
import { aRoutine, anItem, ownerOnHouseTab } from './support'

// T113 (ARCHITECTURE A41): the frequent taps show at once and save behind the screen. Every server
// action here takes 2 seconds, so anything that shows sooner didn't wait for it.
const SLOW_MS = 2_000
const AT_ONCE = { timeout: 500 }

const slowServer = (page: Page) =>
  page.route(
    (url) => url.pathname.startsWith('/h/'),
    async (route) => {
      if (route.request().method() !== 'POST') return route.fallback()
      await new Promise((r) => setTimeout(r, SLOW_MS))
      await route.fallback()
    },
  )

test('Got it and a feeling show at once while the server is still saving', async ({ page }) => {
  const owner = await ownerOnHouseTab(page)
  await anItem(owner, { category: 'need', title: 'Olive oil' })
  await anItem(owner, { category: 'need', title: 'Toilet paper' })
  await page.goto(`/h/${owner.houseId}/needs`)
  const list = page.getByRole('list', { name: 'Needs' })
  await expect(list).toContainText('Olive oil')
  await slowServer(page)

  await page.getByRole('button', { name: 'Share a feeling: Toilet paper' }).click()
  await page
    .getByRole('group', { name: 'How do you feel about this?' })
    .getByRole('button', { name: 'Anxious' })
    .click()
  await expect(list.getByRole('listitem').filter({ hasText: 'Toilet paper' })).toContainText(
    '😰',
    AT_ONCE,
  )

  await list.getByRole('button', { name: 'Got it: Olive oil' }).click()
  await expect(list.getByRole('listitem').filter({ hasText: 'Olive oil' })).toHaveCount(0, AT_ONCE)

  // The server's answers arrive later (two slow saves, one after the other) and change nothing
  // on screen.
  await expect(page.getByRole('status').filter({ hasText: 'Got Olive oil.' })).toBeVisible({
    timeout: 20_000,
  })
  await expect(list.getByRole('listitem').filter({ hasText: 'Olive oil' })).toHaveCount(0)
  await expect(list.getByRole('listitem').filter({ hasText: 'Toilet paper' })).toContainText('😰')
  await page.unrouteAll({ behavior: 'wait' })
  await page.reload()
  await expect(list.getByRole('listitem').filter({ hasText: 'Toilet paper' })).toContainText('😰')
  await expect(list.getByRole('listitem').filter({ hasText: 'Olive oil' })).toHaveCount(0)
})

test('a chore ticks at once, and unticking it straight away lands too', async ({ page }) => {
  const owner = await ownerOnHouseTab(page)
  await aRoutine(owner, { name: 'Kitchen', rooms: ['Kitchen'], holder: owner.userId, fixed: true })
  await anItem(owner, { category: 'chore', title: 'Sink', kind: 'deep_clean', rooms: ['Kitchen'] })
  await page.goto(`/h/${owner.houseId}/chores`)
  const tick = page.getByRole('button', { name: 'Did it: Sink' })
  await expect(tick).toHaveAttribute('aria-pressed', 'false')
  await slowServer(page)

  await tick.click()
  await expect(tick).toHaveAttribute('aria-pressed', 'true', AT_ONCE)
  // The second tap, long before the first has been saved.
  await tick.click()
  await expect(page.getByRole('status').filter({ hasText: 'Back on the list.' })).toBeVisible({
    timeout: 15_000,
  })
  await expect(tick).toHaveAttribute('aria-pressed', 'false')
  await expect(page.getByText(/Nothing to undo|Couldn't undo|Someone just changed/)).toHaveCount(0)

  await page.unrouteAll({ behavior: 'wait' })
  await page.reload()
  await expect(tick).toHaveAttribute('aria-pressed', 'false')
})

test('a tap the server never answers is put back', async ({ page }) => {
  const owner = await ownerOnHouseTab(page)
  await anItem(owner, { category: 'need', title: 'Olive oil' })
  await page.goto(`/h/${owner.houseId}/needs`)
  const list = page.getByRole('list', { name: 'Needs' })
  const row = list.getByRole('listitem').filter({ hasText: 'Olive oil' })
  await expect(row).toHaveCount(1)
  await page.route(
    (url) => url.pathname.startsWith('/h/'),
    async (route) => {
      if (route.request().method() !== 'POST') return route.fallback()
      await new Promise((r) => setTimeout(r, 1_000))
      await route.abort()
    },
  )
  await list.getByRole('button', { name: 'Got it: Olive oil' }).click()
  await expect(row).toHaveCount(0, AT_ONCE)
  await expect(row).toHaveCount(1)
  await expect(page.getByRole('status').filter({ hasText: "Couldn't check it off." })).toBeVisible()
})
