import { expect, test } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { asOwner } from '../lib/testing/db'
import { aRoommate, ownerOnHouseTab } from './support'

test('a run from Needs: done, moved to another run, put back with a note, and finishing returns the rest', async ({
  page,
}) => {
  const owner = await ownerOnHouseTab(page)
  await page.goto(`/h/${owner.houseId}/needs`)
  const weNeed = page.getByLabel('We need…')
  const needs = page.getByRole('list', { name: 'Needs' })
  for (const title of ['Milk', 'Eggs', 'Soap', 'Bread', 'Oat milk']) {
    await weNeed.fill(title)
    await weNeed.press('Enter')
    await expect(needs).toContainText(title)
  }

  // A second run first, so there's somewhere to move things.
  // Every open need starts checked (T44): uncheck what you won't get.
  const startRun = async (title: string, skip: string[]) => {
    await page.getByRole('button', { name: 'Start a run' }).click()
    const sheet = page.getByRole('dialog', { name: 'Start a run' })
    for (const p of skip) await sheet.getByRole('checkbox', { name: p, exact: true }).uncheck()
    await sheet.getByRole('button', { name: 'More options' }).click()
    await sheet.getByLabel('Title (optional)').fill(title)
    await sheet.getByRole('button', { name: 'Start run' }).click()
    await expect(sheet).toBeHidden()
    const run = page.getByRole('dialog', { name: title })
    await expect(run).toBeVisible()
    return run
  }
  let run = await startRun('Saturday', ['Milk', 'Eggs', 'Soap', 'Bread'])
  await page.keyboard.press('Escape')
  await expect(run).toBeHidden()

  // Only what's not on a run is offered, and each item shows the run it's on.
  run = await startRun('Groceries', [])
  const rows = run.getByRole('list', { name: 'On this run' })
  await expect(rows.getByRole('checkbox')).toHaveCount(4)
  await expect(run).toContainText('0 of 4 done')

  // In a batch one tap marks a row done, and tapping it again puts it back on the run (T44).
  await rows.getByRole('checkbox', { name: 'Milk' }).check()
  await expect(run).toContainText('✓ Done')
  await expect(run).toContainText('1 of 4 done')
  await rows.getByRole('checkbox', { name: 'Milk' }).uncheck()
  await expect(run).toContainText('0 of 4 done')
  await rows.getByRole('checkbox', { name: 'Milk' }).check()
  await expect(run).toContainText('1 of 4 done')

  // Moving and putting back still work on a selection, behind "Move or put back…".
  await run.getByRole('button', { name: 'Move or put back…' }).click()
  await rows.getByRole('checkbox', { name: 'Eggs' }).check()
  await run.getByRole('button', { name: 'Move to…' }).click()
  await run.getByLabel(/Move it to/).selectOption({ label: 'Saturday' })
  await run.getByLabel('Note').fill('Sold out')
  await run.getByRole('button', { name: 'Move', exact: true }).click()
  await expect(run).toContainText('Moved → Saturday · Sold out')

  await run.getByRole('button', { name: 'Move or put back…' }).click()
  await rows.getByRole('checkbox', { name: 'Soap' }).check()
  await run.getByRole('button', { name: 'Back to the pool…' }).click()
  await run.getByLabel('Note').fill('We have some')
  await run.getByRole('button', { name: 'Put back' }).click()
  await expect(run).toContainText('Back in the pool · We have some')

  // An empty amount finishes with no cost.
  await run.getByRole('button', { name: 'Finish' }).click()
  await expect(
    page.getByRole('status').filter({ hasText: 'Finished. 1 thing went back to the pool.' }),
  ).toBeVisible()

  // Needs: milk is gotten; eggs are on Saturday's run; soap and bread are back in the pool.
  await expect(needs).not.toContainText('Milk')
  const row = (t: string) => needs.getByRole('listitem').filter({ hasText: new RegExp(`^${t}`) })
  await expect(row('Eggs')).toContainText('On Saturday')
  await expect(row('Soap')).not.toContainText('On ')
  await expect(row('Bread')).not.toContainText('On ')

  // Eggs keep their history; Home lists the run still going.
  await row('Eggs').getByRole('button', { name: /^Eggs/ }).click()
  const detail = page.getByRole('dialog', { name: 'Eggs' })
  const history = detail.getByRole('region', { name: 'Run history' })
  await history.getByRole('button', { name: 'History' }).click()
  await expect(history).toContainText('Added to Groceries')
  await expect(history).toContainText('Moved to Saturday · Sold out')
  await page.keyboard.press('Escape')
  await page.getByRole('link', { name: 'Home' }).click()
  const inProgress = page.getByRole('region', { name: 'Runs in progress' })
  await expect(inProgress).toContainText('Saturday')
  await expect(inProgress).toContainText('0/2')
  await expect(inProgress).not.toContainText('Groceries')
})

test("a run can be renamed, handed to a roommate, and named back; a visit's point person changes; Activity says so (T56)", async ({
  page,
}) => {
  const owner = await ownerOnHouseTab(page)
  await aRoommate(owner, 'Sam')
  const landlord = randomUUID()
  await asOwner((db) =>
    db.query(`insert into contacts (id, house_id, name) values ($1, $2, 'Landlord')`, [
      landlord,
      owner.houseId,
    ]),
  )

  await page.goto(`/h/${owner.houseId}/needs`)
  const weNeed = page.getByLabel('We need…')
  await weNeed.fill('Milk')
  await weNeed.press('Enter')
  await page.getByRole('button', { name: 'Start a run' }).click()
  const start = page.getByRole('dialog', { name: 'Start a run' })
  await expect(start.getByRole('checkbox', { name: 'Milk', exact: true })).toBeChecked()
  await start.getByRole('button', { name: 'Start run' }).click()

  let run = page.getByRole('dialog', { name: "Kavya's run" })
  await expect(run).toContainText("Kavya's on it")
  await run.getByRole('button', { name: 'Rename this run' }).click()
  await expect(run.getByRole('textbox', { name: 'Name', exact: true })).toHaveAttribute(
    'placeholder',
    "Kavya's run",
  )
  await run.getByRole('textbox', { name: 'Name', exact: true }).fill('Saturday shop')
  await run.getByRole('button', { name: 'Save' }).click()
  run = page.getByRole('dialog', { name: 'Saturday shop' })
  await expect(run).toBeVisible()

  await run.getByRole('button', { name: "Change who's on it" }).click()
  await run.getByLabel("Who's on it?", { exact: true }).selectOption({ label: 'Sam' })
  await run.getByRole('button', { name: 'Save' }).click()
  await expect(run).toContainText("Sam's on it")
  await expect(page.getByRole('status').filter({ hasText: "Sam's on it now." })).toBeVisible()

  await run.getByRole('button', { name: 'Rename this run' }).click()
  await run.getByRole('button', { name: "Use “Sam's run”" }).click()
  await expect(page.getByRole('dialog', { name: "Sam's run" })).toBeVisible()
  await page.keyboard.press('Escape')

  // A visit has a point person instead.
  await page.goto(`/h/${owner.houseId}/tasks`)
  const section = page.getByRole('region', { name: 'Requests & visits' })
  await section.getByRole('button', { name: 'New', exact: true }).click()
  const newRun = page.getByRole('dialog', { name: 'New request or visit' })
  await newRun.getByRole('button', { name: "They've agreed" }).click()
  await newRun.getByLabel('Who', { exact: true }).selectOption({ label: 'Landlord' })
  await newRun.getByRole('button', { name: 'Plan visit' }).click()
  const visit = page.getByRole('dialog', { name: 'Landlord visit' })
  await expect(visit).toContainText('Point person: Kavya')
  await visit.getByRole('button', { name: 'Change the point person' }).click()
  await visit.getByLabel('Point person', { exact: true }).selectOption({ label: 'Sam' })
  await visit.getByRole('button', { name: 'Save' }).click()
  await expect(visit).toContainText('Point person: Sam')
  await page.keyboard.press('Escape')

  await page.goto(`/h/${owner.houseId}/activity`)
  await expect(page.getByText("Kavya renamed Sam's run to Saturday shop")).toBeVisible()
  // Lines name a run as it is now: by the end it's untitled again, so the hand-over reads by runner.
  await expect(page.getByText("Kavya handed Kavya's run to Sam")).toBeVisible()
  await expect(page.getByText("Kavya renamed Saturday shop to Sam's run")).toBeVisible()
  await expect(page.getByText('Kavya made Sam the point person for Landlord visit')).toBeVisible()
})
