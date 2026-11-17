// `pnpm perf` (T88, TESTING.md §3): how long the app takes to open, to switch tabs and to answer
// three taps, on a slowed-down phone-sized Chromium. It prints a table and writes
// test-results/perf-<label>.json. Numbers, not assertions: it fails only if a screen never shows.
//
//   BASE_URL                the site (unset: a local production build, keys from .env.local)
//   PERF_SUPABASE_URL       the project's API URL       } never prod
//   PERF_SERVICE_ROLE_KEY   its service-role key        }
//   PERF_EMAIL              the perf account. Its house is "Perf house", emptied and refilled on
//                           every run, so it must not be the smoke account or a real person.
//   PERF_RUNS               samples per measurement (default 5; the table shows the median)
//   PERF_LABEL              names the output file (default "local" or the BASE_URL's host)
//   PERF_THROTTLE=off       no CPU or network throttle
//   PERF_IDLE_S             also time one switch to each tab after sitting idle this many seconds
//
// The throttle is DevTools' "Fast 4G" (165 ms latency, 9 Mbps down, 1.5 Mbps up) and a 4× slower
// CPU, applied between the browser and the site. Two things it doesn't slow: the page's own
// first request (Chromium's throttle skips the navigation, so TTFB reads about 165 ms low), and the
// site's calls to Supabase, so a local run understates anything that waits on the server. Compare
// before with after on the same site, and take staging's numbers as the real ones.
import { randomUUID } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { test, type Browser, type BrowserContext, type Page } from '@playwright/test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { adminClient } from '../lib/adapters/supabase/server'
import { accountFor, activeHouseOf, check, freshCode, newHouse, PROD_REF } from './smoke-support'

const env = process.env
const RUNS = Number(env.PERF_RUNS ?? 5)
const THROTTLE = env.PERF_THROTTLE !== 'off'
const HOUSE_NAME = 'Perf house'
const NEEDS = 30
const TASKS = 12

type Tab = { key: string; path: string; title: string; shows: string }
const TABS: readonly Tab[] = [
  { key: 'House', path: '', title: 'House', shows: 'Routines' },
  { key: 'Needs', path: '/needs', title: 'Needs', shows: 'Perf need 01' },
  { key: 'Tasks', path: '/tasks', title: 'Tasks', shows: 'Perf task 01' },
  { key: 'Chores', path: '/chores', title: 'Chores', shows: 'Perf sink' },
]

const median = (xs: readonly number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return Math.round(s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2)
}

/** An emptied "Perf house" with enough in it to look like a real one. */
const perfHouse = async (admin: SupabaseClient, email: string) => {
  const userId = await accountFor(admin, email, 'Perf')
  const existing = await activeHouseOf(admin, userId)
  if (existing && existing.name !== HOUSE_NAME)
    throw new Error(
      `${email} lives in "${existing.name}". The perf run empties its house, so give it its own account (PERF_EMAIL).`,
    )
  if (existing) {
    // Rows that point at items without a cascade go first.
    check(
      'old chore rooms',
      (await admin.from('chore_rooms').delete().eq('house_id', existing.houseId)).error,
    )
    check('old house', (await admin.from('houses').delete().eq('id', existing.houseId)).error)
  }
  const houseId = await newHouse(admin, userId, HOUSE_NAME)
  const item = (category: string, title: string, more: Record<string, unknown> = {}) => ({
    id: randomUUID(),
    house_id: houseId,
    category,
    title,
    created_by: userId,
    ...more,
  })
  const nn = (i: number) => String(i + 1).padStart(2, '0')
  const sink = item('chore', 'Perf sink', { chore_kind: 'deep_clean' })
  check(
    'items',
    (
      await admin
        .from('items')
        .insert([
          ...Array.from({ length: NEEDS }, (_, i) => item('need', `Perf need ${nn(i)}`)),
          ...Array.from({ length: TASKS }, (_, i) => item('task', `Perf task ${nn(i)}`)),
          sink,
          item('chore', 'Perf counters', { chore_kind: 'deep_clean' }),
          ...['Bins', 'Plants', 'Recycling', 'Mail'].map((t) =>
            item('chore', `Perf ${t}`, { chore_kind: 'upkeep' }),
          ),
        ])
    ).error,
  )
  const routineId = randomUUID()
  check(
    'routine',
    (
      await admin.from('routines').insert({
        id: routineId,
        house_id: houseId,
        name: 'Perf kitchen',
        icon: 'broom',
        resets: 'weekly',
        starts_on: new Date().toISOString().slice(0, 10),
        fixed_member_id: userId,
      })
    ).error,
  )
  const kitchen = await admin
    .from('rooms')
    .update({ routine_id: routineId })
    .eq('house_id', houseId)
    .eq('name', 'Kitchen')
    .select('id')
  check('kitchen', kitchen.error)
  const roomId = kitchen.data?.[0]?.id as string
  check(
    'chore rooms',
    (
      await admin
        .from('chore_rooms')
        .insert(
          [sink.id, undefined].flatMap((id) =>
            id ? [{ house_id: houseId, item_id: id, room_id: roomId }] : [],
          ),
        )
    ).error,
  )
  return { userId, houseId }
}

const throttle = async (context: BrowserContext, page: Page) => {
  if (!THROTTLE) return
  const cdp = await context.newCDPSession(page)
  await cdp.send('Network.enable')
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 165,
    downloadThroughput: (9_000_000 / 8) * 0.9,
    uploadThroughput: (1_500_000 / 8) * 0.9,
  })
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
}

/** Records, in the page, when its title and a piece of its data are both on screen. */
const watchForContent = (page: Page, tab: Tab) =>
  page.addInitScript(
    ({ title, shows }) => {
      const w = window as unknown as { __perf: { content?: number; lcp?: number } }
      w.__perf = {}
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) w.__perf.lcp = e.startTime
      }).observe({ type: 'largest-contentful-paint', buffered: true })
      const look = () => {
        if (w.__perf.content !== undefined) return
        const main = document.querySelector('main')
        if (
          document.querySelector('h1')?.textContent === title &&
          main?.textContent?.includes(shows)
        )
          w.__perf.content = performance.now()
        else requestAnimationFrame(look)
      }
      requestAnimationFrame(look)
    },
    { title: tab.title, shows: tab.shows },
  )

type Open = { ttfb: number; lcp: number; content: number }

/** One load of a tab's URL, timed from the start of the navigation. */
const open = async (page: Page, url: string): Promise<Open> => {
  await page.goto(url, { waitUntil: 'commit' })
  await page.waitForFunction(
    () => (window as unknown as { __perf?: { content?: number } }).__perf?.content !== undefined,
    undefined,
    { timeout: 60_000 },
  )
  await page.waitForTimeout(500) // let the last largest-contentful-paint entry arrive
  return page.evaluate(() => {
    const w = window as unknown as { __perf: { content: number; lcp?: number } }
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming
    return {
      ttfb: nav.responseStart,
      lcp: w.__perf.lcp ?? w.__perf.content,
      content: w.__perf.content,
    }
  })
}

/** A signed-in context with nothing cached, as on a phone that has never opened the app. */
const freshContext = async (browser: Browser, storageState: string) =>
  browser.newContext({ storageState })

/** Taps a tab and times, in the page, until the new tab's title and data are on screen. */
const switchTab = (page: Page, base: string, to: Tab) =>
  page.evaluate(
    ({ href, title, shows }) =>
      new Promise<number>((resolve, reject) => {
        const link = document.querySelector<HTMLAnchorElement>(
          `nav[aria-label="Tabs"] a[href="${href}"]`,
        )
        if (!link) return reject(new Error(`No tab link to ${href}`))
        const t0 = performance.now()
        const look = () => {
          if (performance.now() - t0 > 30_000) return reject(new Error(`${title} never showed`))
          const main = document.querySelector('main')
          if (
            document.querySelector('h1')?.textContent === title &&
            main?.textContent?.includes(shows)
          )
            resolve(performance.now() - t0)
          else requestAnimationFrame(look)
        }
        link.click()
        requestAnimationFrame(look)
      }),
    { href: `${base}${to.path}`, title: to.title, shows: to.shows },
  )

/** Clicks the button with this accessible label and times until `until` holds. */
const tap = (
  page: Page,
  label: string,
  until:
    | { kind: 'row-gone' | 'row-has'; list: string; row: string; text?: string }
    | 'pressed'
    | 'unpressed',
) =>
  page.evaluate(
    ({ label, until }) =>
      new Promise<number>((resolve, reject) => {
        const button = [...document.querySelectorAll<HTMLElement>('button')].find(
          (b) => b.getAttribute('aria-label') === label || b.textContent?.trim() === label,
        )
        if (!button) return reject(new Error(`No button "${label}"`))
        const done = () => {
          if (until === 'pressed') return button.getAttribute('aria-pressed') === 'true'
          if (until === 'unpressed') return button.getAttribute('aria-pressed') === 'false'
          const rows = [
            ...document.querySelectorAll(
              `[role="list"][aria-label="${until.list}"] li, ul[aria-label="${until.list}"] li`,
            ),
          ]
          const row = rows.find((r) => r.textContent?.includes(until.row))
          return until.kind === 'row-gone' ? !row : !!row?.textContent?.includes(until.text ?? '')
        }
        const t0 = performance.now()
        const look = () => {
          if (performance.now() - t0 > 30_000) return reject(new Error(`"${label}" never answered`))
          if (done()) resolve(performance.now() - t0)
          else requestAnimationFrame(look)
        }
        button.click()
        requestAnimationFrame(look)
      }),
    { label, until },
  )

test('how long opening, switching tabs and tapping take', async ({ browser, baseURL }, info) => {
  const url = env.PERF_SUPABASE_URL
  const key = env.PERF_SERVICE_ROLE_KEY
  const email = env.PERF_EMAIL?.trim().toLowerCase()
  if (!url || !key || !email)
    throw new Error('Needs PERF_SUPABASE_URL, PERF_SERVICE_ROLE_KEY and PERF_EMAIL.')
  if (url.includes(PROD_REF)) throw new Error('Never run the perf suite against prod.')

  const admin = adminClient(url, key)
  const { houseId } = await perfHouse(admin, email)
  const base = `/h/${houseId}`

  // Sign in once, unthrottled, and keep the session for every measurement.
  const statePath = info.outputPath('session.json')
  {
    const context = await browser.newContext()
    const page = await context.newPage()
    await page.goto('/sign-in')
    await page.getByLabel('Your email').fill(email)
    await page.getByRole('button', { name: 'Send me a code' }).click()
    const codeField = page.getByLabel('6-digit code')
    await codeField.waitFor()
    await codeField.fill(await freshCode(admin, email))
    await page.waitForURL(new RegExp(`${base}$`))
    await context.storageState({ path: statePath })
    await context.close()
  }

  const results: Record<string, Record<string, number>> = {}
  const put = (row: string, col: string, samples: readonly number[]) => {
    ;(results[row] ??= {})[col] = median(samples)
  }

  // Opening each tab: with nothing cached, then again in the same browser.
  for (const tab of TABS) {
    const first: Open[] = []
    const again: Open[] = []
    for (let i = 0; i < RUNS; i++) {
      const context = await freshContext(browser, statePath)
      const page = await context.newPage()
      await watchForContent(page, tab)
      await throttle(context, page)
      first.push(await open(page, base + tab.path))
      again.push(await open(page, base + tab.path))
      await context.close()
    }
    put(
      `Open ${tab.key}`,
      'first: TTFB',
      first.map((o) => o.ttfb),
    )
    put(
      `Open ${tab.key}`,
      'first: LCP',
      first.map((o) => o.lcp),
    )
    put(
      `Open ${tab.key}`,
      'first: content',
      first.map((o) => o.content),
    )
    put(
      `Open ${tab.key}`,
      'repeat: content',
      again.map((o) => o.content),
    )
  }

  // Switching tabs and tapping, in one long-lived page like the installed app.
  const context = await freshContext(browser, statePath)
  const page = await context.newPage()
  await watchForContent(page, TABS[0]!)
  await throttle(context, page)
  await open(page, base)
  await page.waitForTimeout(3_000) // prefetches, if any, settle

  const firstVisit: Record<string, number[]> = {}
  const revisit: Record<string, number[]> = {}
  const order = [TABS[1]!, TABS[2]!, TABS[3]!, TABS[0]!]
  for (let i = 0; i <= RUNS; i++) {
    for (const to of order) {
      const ms = await switchTab(page, base, to)
      ;((i === 0 ? firstVisit : revisit)[to.key] ??= []).push(ms)
      await page.waitForTimeout(300)
    }
  }
  for (const to of order) {
    put(`Switch to ${to.key}`, 'first visit', firstVisit[to.key]!)
    put(`Switch to ${to.key}`, 'later visits', revisit[to.key]!)
  }

  // The installed app stays open for hours; the router keeps a prefetched page for 5 minutes.
  const idle = Number(env.PERF_IDLE_S ?? 0)
  if (idle > 0) {
    await page.waitForTimeout(idle * 1000)
    for (const to of order)
      put(`Switch to ${to.key}`, `after ${idle} s idle`, [await switchTab(page, base, to)])
  }

  const nn = (i: number) => String(i + 1).padStart(2, '0')
  await switchTab(page, base, TABS[1]!)
  const feeling: number[] = []
  const got: number[] = []
  for (let i = 0; i < RUNS; i++) {
    const title = `Perf need ${nn(i)}`
    await page.getByRole('button', { name: `Share a feeling: ${title}` }).click()
    await page.getByRole('group', { name: 'How do you feel about this?' }).waitFor()
    feeling.push(
      await tap(page, 'Anxious', { kind: 'row-has', list: 'Needs', row: title, text: '😰' }),
    )
    await page.waitForTimeout(1_500)
  }
  for (let i = 0; i < RUNS; i++) {
    const title = `Perf need ${nn(i)}`
    got.push(await tap(page, `Got it: ${title}`, { kind: 'row-gone', list: 'Needs', row: title }))
    await page.waitForTimeout(1_500)
  }
  put('Tap: share a feeling', 'until the screen changes', feeling)
  put('Tap: got a need', 'until the screen changes', got)

  await switchTab(page, base, TABS[3]!)
  const tick: number[] = []
  for (let i = 0; i < RUNS; i++) {
    tick.push(await tap(page, 'Did it: Perf sink', 'pressed'))
    await page.waitForTimeout(1_500)
    await tap(page, 'Did it: Perf sink', 'unpressed')
    await page.waitForTimeout(1_500)
  }
  put('Tap: tick a chore', 'until the screen changes', tick)
  await context.close()

  const label = env.PERF_LABEL ?? (env.BASE_URL ? new URL(baseURL!).host : 'local')
  const lines = Object.entries(results).map(
    ([row, cols]) =>
      `${row.padEnd(22)} ${Object.entries(cols)
        .map(([c, v]) => `${c} ${v} ms`)
        .join(' · ')}`,
  )
  const head = `pnpm perf · ${label} · ${THROTTLE ? 'Fast 4G, 4× CPU' : 'no throttle'} · median of ${RUNS}`
  console.log(`\n${head}\n${lines.join('\n')}\n`)
  mkdirSync('test-results', { recursive: true })
  writeFileSync(
    `test-results/perf-${label}.json`,
    JSON.stringify({ label, throttle: THROTTLE, runs: RUNS, results }, null, 2),
  )
})
