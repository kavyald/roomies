import { describe, expect, it } from 'vitest'
import { asId, type ContactId, type HouseId, type ItemId, type UserId } from './ids'
import type { Item, Task } from './items'
import { taskList } from './lists'
import { instant, type LocalDate, type LocalTime } from './time'

const me = asId<'user'>('me') as UserId
const you = asId<'user'>('you') as UserId
const t = (title: string, o: Partial<Task> = {}, created = 0): Task => ({
  id: asId<'item'>(title) as ItemId,
  houseId: asId<'house'>('h') as HouseId,
  category: 'task',
  title,
  priority: 'normal',
  createdBy: me,
  createdAt: instant(created),
  ...o,
})

const items: Item[] = [
  t('Undated old', {}, 1),
  t('Undated new', { assignee: me }, 2),
  t('Thu 10:00', {
    when: { date: '2026-10-01' as LocalDate, time: '10:00' as LocalTime },
    contactId: asId<'contact'>('super') as ContactId,
  }),
  t('Thu any time', { when: { date: '2026-10-01' as LocalDate }, assignee: you }),
  t('Wed', { when: { date: '2026-09-30' as LocalDate }, assignee: me }),
  t('Done', { done: { at: instant(5), by: me } }),
  t('Archived', { archivedAt: instant(5) }),
  { ...t('A need'), category: 'need' } as Item,
]

describe('taskList', () => {
  it('lists open tasks: dated soonest first, then undated newest first', () => {
    expect(taskList(items, 'all', me).map((x) => x.title)).toEqual([
      'Wed',
      'Thu 10:00',
      'Thu any time',
      'Undated new',
      'Undated old',
    ])
  })

  it('filters to mine and to outside help', () => {
    expect(taskList(items, 'mine', me).map((x) => x.title)).toEqual(['Wed', 'Undated new'])
    expect(taskList(items, 'outside', me).map((x) => x.title)).toEqual(['Thu 10:00'])
  })
})
