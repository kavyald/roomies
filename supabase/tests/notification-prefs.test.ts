import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { NOTIFICATION_CATEGORIES } from '../../lib/domain/notifications'
import { aDbHouse, actAs, asUser, pool, refused, type TestHouse } from '../../lib/testing/db'

// Notification settings (T33, T85): one row per category someone switched. Every category the app
// offers is one the table takes (T85 added 'needs'); anything else is refused. You set only your
// own; housemates read them so their events respect them.

let mine: TestHouse
let theirs: TestHouse

beforeAll(async () => {
  ;[mine, theirs] = await Promise.all([aDbHouse(), aDbHouse()])
})

afterAll(() => pool.end())

const set = `insert into notification_prefs (user_id, category, enabled) values ($1, $2, false)`

describe('notification categories', () => {
  it('takes every category the app offers, including needs', async () => {
    await asUser(mine.member, async (db) => {
      for (const c of NOTIFICATION_CATEGORIES) await db.query(set, [mine.member, c])
      const rows = await db.query('select category from notification_prefs where user_id = $1', [
        mine.member,
      ])
      expect(rows.rows.map((r) => r.category).sort()).toEqual([...NOTIFICATION_CATEGORIES].sort())
    })
  })

  it('refuses a category the app does not have', async () => {
    await asUser(mine.member, async (db) => {
      expect(await refused(db, set, [mine.member, 'gossip'])).toBe('23514')
    })
  })

  it('a housemate reads your needs switch; another house does not; nobody sets it for you', async () => {
    await asUser(mine.member, async (db) => {
      await db.query(set, [mine.member, 'needs'])
      const read = 'select enabled from notification_prefs where user_id = $1 and category = $2'
      await actAs(db, mine.admin)
      expect((await db.query(read, [mine.member, 'needs'])).rows).toEqual([{ enabled: false }])
      expect(await refused(db, set, [mine.member, 'feelings'])).toBe('42501')
      await actAs(db, theirs.admin)
      expect((await db.query(read, [mine.member, 'needs'])).rowCount).toBe(0)
      expect(await refused(db, set, [mine.member, 'polls'])).toBe('42501')
    })
  })
})
