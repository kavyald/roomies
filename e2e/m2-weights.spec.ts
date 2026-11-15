import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { asOwner } from '../lib/testing/db'
import { aRoommate, anOwner, dismissInstallGuide, signIn } from './support'

test('a roommate who is not an organizer sets 😰 to +40, and Needs re-ranks for everyone', async ({
  browser,
}) => {
  const owner = await anOwner('Kavya')
  const sam = await aRoommate(owner, 'Sam')
  // Needs ranks the ones people feel about by their feelings' weights (FRONTEND §5.5): dish soap
  // (😤 15 + 😤 15 = 30) above toilet paper (😰 20), until 😰 is worth 40.
  const paper = randomUUID()
  const soap = randomUUID()
  await asOwner(async (db) => {
    await db.query(
      `insert into items (id, house_id, category, title, created_by)
       values ($1, $2, 'need', 'Toilet paper', $3), ($4, $2, 'need', 'Dish soap', $3)`,
      [paper, owner.houseId, owner.userId, soap],
    )
    await db.query(
      `insert into feelings (item_id, user_id, house_id, kind)
       values ($1, $2, $3, 'anxious'), ($4, $2, $3, 'frustrated'), ($4, $5, $3, 'frustrated')`,
      [paper, sam.userId, owner.houseId, soap, owner.userId],
    )
  })

  const open = async (email: string) => {
    const page = await (await browser.newContext()).newPage()
    await signIn(page, email)
    await expect(page).toHaveURL(new RegExp(`/h/${owner.houseId}$`))
    await dismissInstallGuide(page)
    return page
  }
  const kavya = await open(owner.email)
  await kavya.goto(`/h/${owner.houseId}/needs`)
  const needs = kavya.getByRole('list', { name: 'Needs' }).getByRole('listitem')
  await expect(needs.first()).toContainText('Dish soap')
  await expect(needs.nth(1)).toContainText('Toilet paper')

  // Sam (a member, not an organizer) changes the weights from House → Priority.
  const samPage = await open(sam.email)
  await samPage.getByRole('button', { name: /^How feelings raise priority/ }).click()
  const sheet = samPage.getByRole('dialog', { name: 'Feeling weights' })
  await expect(sheet.getByRole('status', { name: 'Anxious weight' })).toHaveText('+20')
  for (let i = 0; i < 4; i++) await sheet.getByRole('button', { name: 'Raise Anxious' }).click()
  await expect(sheet.getByRole('status', { name: 'Anxious weight' })).toHaveText('+40')
  await expect(sheet.getByRole('button', { name: 'Raise Anxious' })).toBeDisabled()
  await sheet.getByRole('button', { name: 'Save' }).click()
  await expect(
    samPage.getByRole('status').filter({ hasText: 'Saved. Priorities change for everyone.' }),
  ).toBeVisible()

  // Kavya's Needs re-ranks live (no reload), and House has a card saying why.
  await expect(needs.first()).toContainText('Toilet paper')
  await expect(needs.nth(1)).toContainText('Dish soap')
  await kavya.getByRole('navigation', { name: 'Tabs' }).getByRole('link', { name: 'House' }).click()
  await expect(kavya.getByRole('complementary', { name: 'Feeling weights changed' })).toContainText(
    'Sam set 😰 Anxious to +40',
  )
})
