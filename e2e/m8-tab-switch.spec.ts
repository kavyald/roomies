import { expect, test } from '@playwright/test'
import { anItem, ownerOnHouseTab } from './support'

// T88 (ARCHITECTURE A40): the tab pages are fetched ahead of the tap, so a switch doesn't wait on
// the server. `pnpm perf` times it; this proves it by refusing the server once they're in.
test('switching tabs needs nothing from the server once the tab pages are prefetched', async ({
  page,
}) => {
  const prefetched = new Set<string>()
  page.on('response', (res) => {
    const url = new URL(res.url())
    if (url.searchParams.has('_rsc') && res.ok()) prefetched.add(url.pathname)
  })
  const owner = await ownerOnHouseTab(page)
  await anItem(owner, { category: 'need', title: 'Olive oil' })
  await page.reload()
  await expect(page.getByRole('heading', { level: 1, name: 'House' })).toBeVisible()

  const base = `/h/${owner.houseId}`
  await expect
    .poll(() => ['needs', 'tasks', 'chores'].every((t) => prefetched.has(`${base}/${t}`)))
    .toBe(true)

  // From here, any request for a page fails.
  await page.route(
    (url) => url.searchParams.has('_rsc'),
    (route) => route.abort(),
  )
  const tabs = page.getByRole('navigation', { name: 'Tabs' })
  await tabs.getByRole('link', { name: 'Needs' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Needs' })).toBeVisible()
  await expect(page.getByRole('list', { name: 'Needs' })).toContainText('Olive oil')
  await tabs.getByRole('link', { name: 'Chores' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Chores' })).toBeVisible()
  await tabs.getByRole('link', { name: 'Tasks' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Tasks' })).toBeVisible()
  await tabs.getByRole('link', { name: 'House' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'House' })).toBeVisible()
})
