// T58: a poll or run notification opens that sheet over Home; an unknown link says so kindly.
import { expect, test } from '@playwright/test'
import { asOwner } from '../lib/testing/db'
import { aPoll, aRoommate, aRun, anOwner, dismissInstallGuide, signIn } from './support'

test('a poll push opens the poll, a run link opens the run, and a stranger’s link finds nothing', async ({
  page,
}) => {
  const owner = await anOwner('Kavya')
  const sam = await aRoommate(owner, 'Sam')
  const h = `/h/${owner.houseId}`
  const run = await aRun(owner, 'Groceries')
  const elsewhere = await anOwner('Wren')
  const strangerPoll = await aPoll(elsewhere, 'Paint the door?')

  await signIn(page, owner.email)
  await expect(page).toHaveURL(new RegExp(`${h}$`))
  await dismissInstallGuide(page)

  // Kavya starts a poll; Sam's notification points at it.
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await page
    .getByRole('dialog', { name: 'Add something' })
    .getByRole('button', { name: /^A poll/ })
    .click()
  const sheet = page.getByRole('dialog', { name: 'A poll' })
  await sheet.getByLabel('Question').fill('Movie night?')
  await sheet.getByLabel('Option 1', { exact: true }).fill('Friday')
  await sheet.getByLabel('Option 2', { exact: true }).fill('Saturday')
  await sheet.getByRole('button', { name: 'Start poll' }).click()
  // Once it's saved, the new poll's sheet opens; close it only then (Escape earlier would race the save).
  const started = page.getByRole('dialog', { name: 'Movie night?' })
  await expect(started).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(started).toBeHidden()

  // Sam's outbox row (written in the same transaction) links to exactly this poll.
  const pollId = await asOwner(
    async (db) =>
      (
        await db.query<{ id: string }>(
          "select id from polls where house_id = $1 and question = 'Movie night?'",
          [owner.houseId],
        )
      ).rows[0]?.id,
  )
  expect(pollId).toBeTruthy()
  const samsPollUrl = () =>
    asOwner(
      async (db) =>
        (
          await db.query<{ url: string }>(
            "select url from notifications_outbox where user_id = $1 and category = 'polls'",
            [sam.userId],
          )
        ).rows[0]?.url,
    )
  await expect.poll(samsPollUrl).toBe(`${h}/p/${pollId}`)
  const url = (await samsPollUrl())!

  // Tapping it opens the poll over Home, ready to vote.
  await page.goto(url)
  const poll = page.getByRole('dialog', { name: 'Movie night?' })
  await expect(poll).toBeVisible()
  await expect(page).toHaveURL(new RegExp(`${h}$`))
  await poll.getByRole('radio', { name: /Saturday/ }).click()
  await expect(poll.getByRole('radio', { name: /Saturday/ })).toHaveAttribute(
    'aria-checked',
    'true',
  )
  await page.keyboard.press('Escape')
  await expect(poll).toBeHidden()

  // A run link opens the run.
  await page.goto(`${h}/r/${run}`)
  await expect(page.getByRole('dialog', { name: 'Groceries' })).toBeVisible()
  await expect(page).toHaveURL(new RegExp(`${h}$`))
  await page.keyboard.press('Escape')

  // Another house's poll, or a made-up run, isn't here.
  await page.goto(`${h}/p/${strangerPoll}`)
  await expect(page.getByRole('heading', { name: 'Poll', level: 1 })).toBeVisible()
  await expect(
    page.getByText("We couldn't find that poll. It may have been removed."),
  ).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.goto(`${h}/r/not-a-run`)
  await expect(page.getByText("We couldn't find that run. It may have been removed.")).toBeVisible()
  await page.getByRole('link', { name: 'Go to Home' }).click()
  await expect(page).toHaveURL(new RegExp(`${h}$`))
})
