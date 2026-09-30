import { expect, test } from '@playwright/test'
import { asOwner } from '../lib/testing/db'
import { aRoommate, ownerOnHouseTab } from './support'

test('"Which vacuum?" on a need and a standalone "House name?" both work, and 2–2 is a tie', async ({
  page,
}) => {
  const owner = await ownerOnHouseTab(page)
  const roommates = [
    await aRoommate(owner, 'Sam'),
    await aRoommate(owner, 'Wren'),
    await aRoommate(owner, 'Jo'),
  ]

  // A poll about a need.
  await page.goto(`/h/${owner.houseId}/needs`)
  const weNeed = page.getByLabel('We need…')
  await weNeed.fill('Vacuum')
  await weNeed.press('Enter')
  const needs = page.getByRole('list', { name: 'Needs' })
  await needs.getByRole('button', { name: /^Vacuum/ }).click()
  await page
    .getByRole('dialog', { name: 'Vacuum' })
    .getByRole('button', { name: 'Poll about this' })
    .click()
  let sheet = page.getByRole('dialog', { name: 'Poll about this' })
  await sheet.getByLabel('Question').fill('Which vacuum?')
  await sheet.getByLabel('Option 1', { exact: true }).fill('Dyson V8')
  await sheet.getByLabel('Note for option 1').fill('$189')
  await sheet.getByLabel('Option 2', { exact: true }).fill('Shark')
  await sheet.getByRole('button', { name: 'Start poll' }).click()

  let poll = page.getByRole('dialog', { name: 'Which vacuum?' })
  await expect(poll).toContainText('About: Vacuum')
  await expect(poll).toContainText('0 of 4 voted')
  await poll.getByRole('radio', { name: /Dyson V8/ }).click()
  await expect(poll.getByRole('radio', { name: /Dyson V8/ })).toHaveAttribute(
    'aria-checked',
    'true',
  )
  await expect(poll).toContainText('1 of 4 voted')
  await poll.getByRole('button', { name: 'Add an option' }).click()
  await poll.getByLabel('Option', { exact: true }).fill('Bissell')
  await poll.getByRole('button', { name: 'Add option' }).click()
  await expect(poll.getByRole('radio', { name: /Bissell/ })).toContainText('Added by you')
  await page.keyboard.press('Escape')
  await expect(needs.getByRole('listitem').filter({ hasText: 'Vacuum' })).toContainText('Poll')

  // A standalone poll from +, voted 2–2.
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await page
    .getByRole('dialog', { name: 'Add something' })
    .getByRole('button', { name: /^A poll/ })
    .click()
  sheet = page.getByRole('dialog', { name: 'A poll' })
  await sheet.getByLabel('Question').fill('House name?')
  await sheet.getByLabel('Option 1', { exact: true }).fill('The Nest')
  await sheet.getByLabel('Option 2', { exact: true }).fill('Burrow')
  await sheet.getByRole('button', { name: 'Start poll' }).click()
  poll = page.getByRole('dialog', { name: 'House name?' })
  await poll.getByRole('radio', { name: /The Nest/ }).click()
  await expect(poll).toContainText('1 of 4 voted')

  // The others vote from their phones.
  await asOwner(async (db) => {
    const { rows } = await db.query(
      `select o.id, o.label, o.poll_id from poll_options o join polls p on p.id = o.poll_id
        where p.house_id = $1 and p.question = 'House name?'`,
      [owner.houseId],
    )
    const id = (label: string) => rows.find((r) => r.label === label)!.id
    for (const [who, label] of [
      [roommates[0]!, 'The Nest'],
      [roommates[1]!, 'Burrow'],
      [roommates[2]!, 'Burrow'],
    ] as const) {
      await db.query(
        'insert into poll_votes (poll_id, user_id, house_id, option_id) values ($1, $2, $3, $4)',
        [rows[0].poll_id, who.userId, owner.houseId, id(label)],
      )
    }
  })
  await page.keyboard.press('Escape')
  await page.getByRole('link', { name: 'Home' }).click()
  const openPolls = page.getByRole('region', { name: 'Open polls' })
  await expect(openPolls).toContainText('House name?')
  await expect(openPolls).toContainText('4/4 voted')
  await expect(openPolls).toContainText('Which vacuum?')

  await openPolls.getByRole('button', { name: /^House name\?/ }).click()
  poll = page.getByRole('dialog', { name: 'House name?' })
  await poll.getByRole('button', { name: 'Close poll' }).click()
  await expect(poll.getByRole('status')).toHaveText("It's a tie. Talk it out?")
  await page.keyboard.press('Escape')
  await expect(openPolls).not.toContainText('House name?')

  await openPolls.getByRole('button', { name: /^Which vacuum\?/ }).click()
  poll = page.getByRole('dialog', { name: 'Which vacuum?' })
  await poll.getByRole('button', { name: 'Close poll' }).click()
  await expect(poll.getByRole('status')).toHaveText('Dyson V8 wins (1–0)')
})
