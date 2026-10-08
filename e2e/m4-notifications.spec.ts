import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { asOwner } from '../lib/testing/db'
import { aRoommate, anOwner, dismissInstallGuide, signIn } from './support'

/** The local cron secret (CI writes .env.local too, with `pnpm env:local`). */
const cronSecret = () =>
  process.env.CRON_SECRET ??
  readFileSync('.env.local', 'utf8').match(/^CRON_SECRET=(.+)$/m)?.[1] ??
  ''

const outboxFor = (userId: string) =>
  asOwner(
    async (db) =>
      (
        await db.query<{
          category: string
          title: string
          sent_at: Date | null
          error: string | null
        }>(
          'select category, title, sent_at, error from notifications_outbox where user_id = $1 order by id',
          [userId],
        )
      ).rows,
  )

test('a 😰 on my task reaches my outbox, a poll I turned off does not, and the sender closes it', async ({
  browser,
  request,
}) => {
  const owner = await anOwner('Kavya')
  const sam = await aRoommate(owner, 'Sam')
  await asOwner((db) =>
    db.query(
      `insert into items (id, house_id, category, title, assignee_id, created_by)
       values ($1, $2, 'task', 'Fix the latch', $3, $3)`,
      [randomUUID(), owner.houseId, owner.userId],
    ),
  )
  const open = async (email: string) => {
    const page = await (await browser.newContext()).newPage()
    await signIn(page, email)
    await expect(page).toHaveURL(new RegExp(`/h/${owner.houseId}$`))
    await dismissInstallGuide(page)
    return page
  }

  // Kavya turns polls off, and quiet hours off so nothing waits for the morning.
  const kavya = await open(owner.email)
  await kavya.goto(`/h/${owner.houseId}/me`)
  const polls = kavya.getByRole('switch', { name: 'Polls' })
  await polls.click()
  await expect(polls).toHaveAttribute('aria-checked', 'false')
  const quiet = kavya.getByRole('switch', { name: 'Quiet hours' })
  await quiet.click()
  await expect(quiet).toHaveAttribute('aria-checked', 'false')
  await kavya.reload() // both saved
  await expect(quiet).toHaveAttribute('aria-checked', 'false')
  await expect(polls).toHaveAttribute('aria-checked', 'false')

  // Sam feels 😰 about Kavya's task, then starts a poll.
  const samPage = await open(sam.email)
  await samPage.goto(`/h/${owner.houseId}/tasks`)
  await samPage.getByRole('button', { name: 'Fix the latch', exact: true }).click()
  const detail = samPage.getByRole('dialog', { name: 'Fix the latch' })
  await detail.getByRole('button', { name: '🙂+ Share a feeling' }).click()
  await detail.getByRole('button', { name: 'Anxious', exact: true }).click()
  await expect(detail.getByRole('region', { name: 'How the house feels' })).toContainText(
    'You · 😰 Anxious',
  )
  await samPage.keyboard.press('Escape')
  // On Tasks, + opens a task; the form leads back to the picker for a poll.
  await samPage.getByRole('button', { name: 'Add', exact: true }).click()
  await samPage
    .getByRole('dialog', { name: 'A task' })
    .getByRole('button', { name: 'A poll or a run instead?' })
    .click()
  await samPage
    .getByRole('dialog', { name: 'Add something' })
    .getByRole('button', { name: /^A poll/ })
    .click()
  const sheet = samPage.getByRole('dialog', { name: 'A poll' })
  await sheet.getByLabel('Question').fill('House name?')
  await sheet.getByLabel('Option 1', { exact: true }).fill('The Nest')
  await sheet.getByLabel('Option 2', { exact: true }).fill('Burrow')
  await sheet.getByRole('button', { name: 'Start poll' }).click()
  await expect(samPage.getByRole('dialog', { name: 'House name?' })).toBeVisible()

  // Kavya's outbox: the feeling, and no poll.
  await expect
    .poll(async () => (await outboxFor(owner.userId)).map((m) => m.category))
    .toEqual(['feelings'])
  expect((await outboxFor(owner.userId))[0]!.title).toContain('Fix the latch')

  // The sender closes it (Kavya has no browser signed up, so it says why instead of retrying).
  const res = await request.post('/api/cron/send-notifications', {
    headers: { 'x-cron-secret': cronSecret() },
  })
  expect(res.status()).toBe(200)
  const [sent] = await outboxFor(owner.userId)
  expect(sent!.sent_at).not.toBeNull()
  expect(sent!.error).toBe('no_subscription')

  // Without the secret, the job doesn't run.
  expect((await request.post('/api/cron/send-notifications')).status()).toBe(401)
})
