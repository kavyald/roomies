import { describe, expect, it } from 'vitest'
import {
  asId,
  type ActionId,
  type ContactId,
  type HouseId,
  type ItemId,
  type RoomId,
  type RunId,
  type UserId,
} from './ids'
import {
  archiveItem,
  createItem,
  doChore,
  editItem,
  markDone,
  reopenItem,
  restoreItem,
  type Chore,
  type Need,
  type Task,
} from './items'
import { instant, type LocalDate } from './time'

const house = asId<'house'>('h') as HouseId
const kavya = asId<'user'>('kavya') as UserId
const wren = asId<'user'>('wren') as UserId
const a = asId<'action'>('a') as ActionId
const now = instant(1000)
const ctx = (openNeeds: Need[] = []) => ({
  by: kavya,
  now,
  id: asId<'item'>('new') as ItemId,
  houseId: house,
  actionId: a,
  openNeeds,
})

const need = (title: string, o: Partial<Need> = {}): Need => ({
  id: asId<'item'>(title) as ItemId,
  houseId: house,
  category: 'need',
  title,
  priority: 'normal',
  createdBy: kavya,
  createdAt: instant(0),
  ...o,
})
const chore: Chore = { ...need('Trash'), category: 'chore', repeatDays: 7 }
const task: Task = { ...need('Latch'), category: 'task' }

describe('createItem', () => {
  it('adding something already handed to someone else tells them (an assignment)', () => {
    const r = createItem({ category: 'task', title: 'Fix the latch', assignee: wren }, ctx())
    expect(r.ok && r.value.events.map((e) => e.kind)).toEqual(['item.created', 'item.assigned'])
    expect(r.ok && r.value.events[1]).toMatchObject({ memberId: wren, by: kavya })
    const mine = createItem({ category: 'task', title: 'Fix the latch', assignee: kavya }, ctx())
    expect(mine.ok && mine.value.events.map((e) => e.kind)).toEqual(['item.created'])
  })

  it('needs only a title, trimmed', () => {
    const r = createItem({ category: 'need', title: '  tomatoes ' }, ctx())
    expect(r.ok && r.value.item).toEqual({
      id: 'new',
      houseId: house,
      category: 'need',
      title: 'tomatoes',
      priority: 'normal',
      createdBy: kavya,
      createdAt: now,
    })
    expect(r.ok && r.value.events).toEqual([
      { kind: 'item.created', itemId: 'new', actionId: a, by: kavya },
    ])
  })

  it('points to the need that is already on the list', () => {
    expect(createItem({ category: 'need', title: 'TOMATOES' }, ctx([need('tomatoes')]))).toEqual({
      ok: false,
      error: 'duplicate_need',
      detail: { existingId: 'tomatoes' },
    })
    // Chores and tasks can share a title with a need.
    expect(createItem({ category: 'task', title: 'tomatoes' }, ctx([need('tomatoes')])).ok).toBe(
      true,
    )
  })

  it('makes chores "as needed" by default, or about every N days', () => {
    const asNeeded = createItem({ category: 'chore', title: 'Descale kettle' }, ctx())
    expect(asNeeded.ok && asNeeded.value.item).toMatchObject({
      category: 'chore',
      repeatDays: null,
    })
    const weekly = createItem({ category: 'chore', title: 'Trash', repeatDays: 7 }, ctx())
    expect(weekly.ok && weekly.value.item).toMatchObject({ repeatDays: 7 })
  })

  it('keeps optional fields, and "handled by" for tasks', () => {
    const contactId = asId<'contact'>('super') as ContactId
    const r = createItem(
      {
        category: 'task',
        title: 'Leak under the sink',
        note: ' ',
        roomId: asId<'room'>('kitchen') as RoomId,
        assignee: wren,
        when: { date: '2026-10-02' as LocalDate },
        priority: 'urgent',
        contactId,
      },
      ctx(),
    )
    expect(r.ok && r.value.item).toMatchObject({
      roomId: 'kitchen',
      assignee: wren,
      priority: 'urgent',
      contactId,
      when: { date: '2026-10-02' },
    })
    expect(r.ok && r.value.item).not.toHaveProperty('note')
  })

  it.each([
    [{ category: 'need', title: ' ' }, 'empty_title'],
    [{ category: 'need', title: 'x'.repeat(121) }, 'title_too_long'],
    [{ category: 'need', title: 'Soap', repeatDays: 7 }, 'invalid_for_category'],
    [{ category: 'chore', title: 'Mop', contactId: 'c' }, 'invalid_for_category'],
    [{ category: 'chore', title: 'Mop', repeatDays: 0 }, 'bad_repeat'],
    [{ category: 'chore', title: 'Mop', repeatDays: 2.5 }, 'bad_repeat'],
  ] as const)('refuses %j', (input, error) => {
    expect(createItem(input as never, ctx())).toEqual({ ok: false, error })
  })
})

describe('editItem', () => {
  it('records field changes in one edit, and assignee / handled-by as their own events', () => {
    const contactId = asId<'contact'>('super') as ContactId
    const r = editItem(
      task,
      { title: 'Fix the latch', assignee: wren, contactId, priority: 'high' },
      { by: kavya, actionId: a, openNeeds: [] },
    )
    if (!r.ok) throw new Error(r.error)
    expect(r.value.item).toMatchObject({
      title: 'Fix the latch',
      assignee: wren,
      contactId,
      priority: 'high',
      category: 'task',
    })
    expect(r.value.events.map((e) => e.kind)).toEqual([
      'item.edited',
      'item.assigned',
      'item.handled_by_changed',
    ])
    expect(r.value.events[0]).toMatchObject({
      changes: { title: ['Latch', 'Fix the latch'], priority: ['normal', 'high'] },
    })
    expect(r.value.events[1]).toMatchObject({ memberId: wren })
  })

  it('clears optional fields with null', () => {
    const withStuff: Task = {
      ...task,
      note: 'n',
      assignee: wren,
      when: { date: '2026-10-02' as LocalDate },
    }
    const r = editItem(
      withStuff,
      { note: null, assignee: null, when: null },
      { by: kavya, actionId: a, openNeeds: [] },
    )
    expect(r.ok && r.value.item).not.toHaveProperty('note')
    expect(r.ok && r.value.item).not.toHaveProperty('assignee')
    expect(r.ok && r.value.item).not.toHaveProperty('when')
    expect(r.ok && r.value.events.find((e) => e.kind === 'item.assigned')).toMatchObject({
      memberId: null,
    })
  })

  it('changes how often a chore repeats', () => {
    const r = editItem(chore, { repeatDays: null }, { by: kavya, actionId: a, openNeeds: [] })
    expect(r.ok && (r.value.item as Chore).repeatDays).toBeNull()
  })

  it.each([
    [need('Soap'), { repeatDays: 3 }, 'invalid_for_category'],
    [chore, { contactId: 'c' }, 'invalid_for_category'],
    [task, { title: '' }, 'empty_title'],
    [task, { title: 'Latch' }, 'no_change'],
    [chore, { repeatDays: 999 }, 'bad_repeat'],
  ] as const)('refuses a bad edit %#', (item, patch, error) => {
    expect(editItem(item, patch as never, { by: kavya, actionId: a, openNeeds: [] })).toEqual({
      ok: false,
      error,
    })
  })

  it("won't rename a need into one that's already open", () => {
    expect(
      editItem(
        need('Soap'),
        { title: 'milk' },
        { by: kavya, actionId: a, openNeeds: [need('Soap'), need('Milk')] },
      ),
    ).toEqual({
      ok: false,
      error: 'duplicate_need',
      detail: { existingId: 'Milk' },
    })
    expect(
      editItem(
        need('Soap'),
        { title: 'SOAP' },
        { by: kavya, actionId: a, openNeeds: [need('Soap')] },
      ).ok,
    ).toBe(true)
  })

  it('"handled by" follows the request or visit a task is on; moving it is how that changes', () => {
    const landlord = asId<'contact'>('landlord') as ContactId
    const plumber = asId<'contact'>('plumber') as ContactId
    const run = asId<'run'>('r') as RunId
    const by = { by: kavya, actionId: a, openNeeds: [] }
    for (const kind of ['request', 'visit'] as const) {
      const onRun: Task = { ...task, contactId: landlord, run: { id: run, kind } }
      for (const contactId of [plumber, null])
        expect(editItem(onRun, { contactId }, by)).toEqual({
          ok: false,
          error: 'on_a_run',
          detail: { runId: run },
        })
      // The same contact isn't a change, and the rest of the task can still be edited.
      const r = editItem(onRun, { contactId: landlord, title: 'Leak' }, by)
      expect(r.ok && r.value.events.map((e) => e.kind)).toEqual(['item.edited'])
    }
    // A batch has no contact, so a task on one can be handed to anyone.
    const onBatch: Task = { ...task, run: { id: run, kind: 'batch' } }
    expect(editItem(onBatch, { contactId: plumber }, by).ok).toBe(true)
  })
})

describe('done, did it, undo, archive', () => {
  it('marks a need done, leaving any run, and refuses twice', () => {
    const onRun = need('Milk', { run: { id: asId('run1'), kind: 'batch' } })
    const r = markDone(onRun, wren, now, a)
    expect(r.ok && r.value.item).toMatchObject({ done: { at: now, by: wren } })
    expect(r.ok && r.value.item).not.toHaveProperty('run')
    expect(r.ok && r.value.events).toEqual([
      { kind: 'item.done', itemId: 'Milk', runId: 'run1', actionId: a, by: wren },
    ])
    expect(markDone(need('Milk', { done: { at: now, by: wren } }), wren, now, a)).toEqual({
      ok: false,
      error: 'already_done',
    })
    expect(markDone(need('Milk', { archivedAt: now }), wren, now, a)).toEqual({
      ok: false,
      error: 'archived',
    })
  })

  it('records "Did it" on a chore as last done, never done', () => {
    const r = doChore(chore, wren, now, a)
    expect(r.ok && r.value.chore).toMatchObject({ lastDone: { at: now, by: wren } })
    expect(r.ok && r.value.chore).not.toHaveProperty('done')
    expect(r.ok && r.value.events[0]!.kind).toBe('chore.done')
    expect(doChore({ ...chore, archivedAt: now }, wren, now, a)).toEqual({
      ok: false,
      error: 'archived',
    })
  })

  it('undoes Got it, unless the same need was added again meanwhile', () => {
    const done = need('Milk', { done: { at: now, by: wren } })
    const r = reopenItem(done, wren, a, [])
    expect(r.ok && r.value.item).not.toHaveProperty('done')
    expect(r.ok && r.value.events[0]!.kind).toBe('item.reopened')
    expect(reopenItem(need('Milk'), wren, a, [])).toEqual({ ok: false, error: 'not_done' })
    expect(reopenItem(done, wren, a, [need('milk', { id: asId('other') })])).toMatchObject({
      ok: false,
      error: 'duplicate_need',
    })
  })

  it('archives and restores', () => {
    const archived = archiveItem(
      need('Milk', { run: { id: asId('r'), kind: 'batch' } }),
      kavya,
      now,
      a,
    )
    expect(archived.ok && archived.value.item).toMatchObject({ archivedAt: now })
    expect(archived.ok && archived.value.item).not.toHaveProperty('run')
    if (!archived.ok) return
    expect(archiveItem(archived.value.item, kavya, now, a)).toEqual({
      ok: false,
      error: 'already_archived',
    })
    const back = restoreItem(archived.value.item, kavya, a, [])
    expect(back.ok && back.value.item).not.toHaveProperty('archivedAt')
    expect(restoreItem(need('Milk'), kavya, a, [])).toEqual({ ok: false, error: 'not_archived' })
    expect(
      restoreItem(archived.value.item, kavya, a, [need('milk', { id: asId('x') })]),
    ).toMatchObject({ error: 'duplicate_need' })
  })
})
