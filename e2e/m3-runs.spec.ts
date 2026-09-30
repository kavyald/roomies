import { expect, test } from '@playwright/test'
import { ownerOnHouseTab } from './support'

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
  const startRun = async (title: string, picks: string[]) => {
    await page.getByRole('button', { name: 'Start a run' }).click()
    const sheet = page.getByRole('dialog', { name: 'Start a run' })
    for (const p of picks) await sheet.getByRole('checkbox', { name: p, exact: true }).check()
    await sheet.getByLabel('Title (optional)').fill(title)
    await sheet.getByRole('button', { name: 'Start run' }).click()
    await expect(sheet).toBeHidden()
    const run = page.getByRole('dialog', { name: title })
    await expect(run).toBeVisible()
    return run
  }
  let run = await startRun('Saturday', ['Oat milk'])
  await page.keyboard.press('Escape')
  await expect(run).toBeHidden()

  // Only what's not on a run is offered, and each item shows the run it's on.
  run = await startRun('Groceries', ['Milk', 'Eggs', 'Soap', 'Bread'])
  const rows = run.getByRole('list', { name: 'On this run' })
  await expect(rows.getByRole('checkbox')).toHaveCount(4)
  await expect(run).toContainText('0 of 4 done')

  await rows.getByRole('checkbox', { name: 'Milk' }).check()
  await run.getByRole('button', { name: 'Done', exact: true }).click()
  await expect(run).toContainText('✓ Done')
  await expect(run).toContainText('1 of 4 done')

  await rows.getByRole('checkbox', { name: 'Eggs' }).check()
  await run.getByRole('button', { name: 'Move to…' }).click()
  await run.getByLabel(/Move it to/).selectOption({ label: 'Saturday' })
  await run.getByLabel('Note').fill('Sold out')
  await run.getByRole('button', { name: 'Move', exact: true }).click()
  await expect(run).toContainText('Moved → Saturday · Sold out')

  await rows.getByRole('checkbox', { name: 'Soap' }).check()
  await run.getByRole('button', { name: 'Back to the pool…' }).click()
  await run.getByLabel('Note').fill('We have some')
  await run.getByRole('button', { name: 'Put back' }).click()
  await expect(run).toContainText('Back in the pool · We have some')

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
  await expect(history).toContainText('Added to Groceries')
  await expect(history).toContainText('Moved to Saturday · Sold out')
  await page.keyboard.press('Escape')
  await page.getByRole('link', { name: 'Home' }).click()
  const inProgress = page.getByRole('region', { name: 'Runs in progress' })
  await expect(inProgress).toContainText('Saturday')
  await expect(inProgress).toContainText('0/2')
  await expect(inProgress).not.toContainText('Groceries')
})
