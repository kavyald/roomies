// T95: notifications on from the start. The first open from the Home Screen offers push once;
// either answer is remembered on this device. The browser's push half is stubbed (an installed
// iPhone with push available and off), since Playwright can't reach a real push service.
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { anOwner, signIn } from './support'

const installedIphoneWithPushOff = (
  page: Page,
  permission: 'default' | 'denied' | 'granted' = 'default',
) =>
  page.addInitScript((permission) => {
    Object.defineProperty(navigator, 'standalone', { value: true, configurable: true })
    // Kept across page loads, like a real subscription and permission.
    const KEY = 'e2e.push'
    const endpoint =
      sessionStorage.getItem(KEY) ??
      'https://push.example.test/e2e-' + Math.random().toString(36).slice(2)
    const sub = {
      endpoint,
      toJSON() {
        return { endpoint: this.endpoint, keys: { p256dh: 'BKey', auth: 'auth' } }
      },
    }
    const subscribed = () => sessionStorage.getItem(KEY) !== null
    const pushManager = {
      getSubscription: async () => (subscribed() ? sub : null),
      subscribe: async () => (sessionStorage.setItem(KEY, endpoint), sub),
    }
    const reg = { pushManager }
    Object.defineProperty(navigator, 'serviceWorker', {
      value: {
        getRegistration: async () => reg,
        getRegistrations: async () => [reg],
        register: async () => reg,
        ready: Promise.resolve(reg),
        controller: null,
        addEventListener: () => {},
        removeEventListener: () => {},
      },
      configurable: true,
    })
    ;(window as unknown as { PushManager: unknown }).PushManager = function PushManager() {}
    ;(window as unknown as { Notification: unknown }).Notification = {
      get permission() {
        return subscribed() ? 'granted' : permission
      },
      requestPermission: async () => 'granted',
    }
  }, permission)

test('the first open offers notifications, and Turn on turns them on', async ({ page }) => {
  await installedIphoneWithPushOff(page)
  const owner = await anOwner('Kavya')
  await signIn(page, owner.email)
  const prompt = page.getByRole('dialog', { name: 'Turn on notifications?' })
  await expect(prompt).toBeVisible()
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme })
    const { violations } = await new AxeBuilder({ page }).analyze()
    const bad = violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')
    expect(bad, colorScheme).toEqual([])
  }

  await prompt.getByRole('button', { name: 'Turn on' }).click()
  await expect(page.getByText('Notifications are on. 🔔')).toBeVisible()
  await expect(prompt).toBeHidden()

  // Me → Notifications agrees, and the prompt doesn't come back.
  await page.goto(`/h/${owner.houseId}/me/notifications`)
  await expect(page.getByRole('group', { name: 'This device' })).toContainText(
    'On for this device.',
  )
  await page.goto(`/h/${owner.houseId}`)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(prompt).toHaveCount(0)
})

test('Not now is remembered on this device', async ({ page }) => {
  await installedIphoneWithPushOff(page)
  const owner = await anOwner('Kavya')
  await signIn(page, owner.email)
  const prompt = page.getByRole('dialog', { name: 'Turn on notifications?' })
  await prompt.getByRole('button', { name: 'Not now' }).click()
  await expect(prompt).toBeHidden()

  await page.reload()
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await page.waitForTimeout(500) // the prompt decides just after load
  await expect(prompt).toHaveCount(0)
  await page.goto(`/h/${owner.houseId}/me/notifications`)
  await expect(page.getByRole('button', { name: 'Turn on notifications' })).toBeVisible()
})

test('blocked: the sheet walks an iPhone through Settings, step by step', async ({ page }) => {
  await installedIphoneWithPushOff(page, 'denied')
  const owner = await anOwner('Kavya')
  await signIn(page, owner.email)
  const prompt = page.getByRole('dialog', { name: 'Notifications are blocked' })
  const steps = prompt.getByRole('list', { name: 'How to turn them on' })
  await expect(steps.getByRole('listitem')).toHaveText([
    /Open the Settings app/,
    /Tap Notifications, then scroll down and tap Roomies/,
    /Turn on Allow Notifications/,
    /turn on by themselves/,
  ])
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme })
    const { violations } = await new AxeBuilder({ page }).analyze()
    const bad = violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')
    expect(bad, colorScheme).toEqual([])
  }
  await prompt.getByRole('button', { name: 'Got it' }).click()
  await expect(prompt).toBeHidden()

  // The same steps stay in Me → Notifications.
  await page.goto(`/h/${owner.houseId}/me/notifications`)
  await expect(page.getByRole('list', { name: 'How to turn them on' })).toBeVisible()
})

test('allowed in Settings, then back in Roomies: on by itself, with no tap', async ({ page }) => {
  await installedIphoneWithPushOff(page, 'granted') // allowed, but not connected to anyone yet
  const owner = await anOwner('Kavya')
  await signIn(page, owner.email)
  await expect(page.getByText('Notifications are on. 🔔')).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.goto(`/h/${owner.houseId}/me/notifications`)
  await expect(page.getByRole('group', { name: 'This device' })).toContainText(
    'On for this device.',
  )
})
