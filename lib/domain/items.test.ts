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
  choreDoneChange,
  createItem,
  doChore,
  editItem,
  markDone,
  reopenItem,
  restoreItem,
  undoChore,
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

describe('a need for me or for the house (T45)', () => {
  it('"Me" is whoever adds it; only needs can be someone\'s', () => {
    const r = createItem({ category: 'need', title: 'Oat milk', forMe: true }, ctx())
    expect(r.ok && r.value.item).toMatchObject({ category: 'need', forMember: kavya })
    const house = createItem({ category: 'need', title: 'Oat milk', forMe: false }, ctx())
    expect(house.ok && 'forMember' in house.value.item).toBe(false)
    expect(createItem({ category: 'task', title: 'Latch', forMe: true }, ctx())).toMatchObject({
      error: 'invalid_for_category',
    })
  })

  it("the house's Milk and Kavya's Milk aren't duplicates; two of Kavya's are", () => {
    const houseMilk = need('Milk')
    const mine = need('Milk2', { title: 'Milk', forMember: kavya })
    expect(createItem({ category: 'need', title: 'milk', forMe: true }, ctx([houseMilk])).ok).toBe(
      true,
    )
    expect(createItem({ category: 'need', title: 'milk', forMe: true }, ctx([mine]))).toMatchObject(
      { error: 'duplicate_need', detail: { existingId: 'Milk2' } },
    )
    expect(createItem({ category: 'need', title: 'milk' }, ctx([mine])).ok).toBe(true)
    // Wren's Milk is Wren's: Kavya adding hers is fine.
    const wrens = need('Milk3', { title: 'Milk', forMember: wren })
    expect(createItem({ category: 'need', title: 'Milk', forMe: true }, ctx([wrens])).ok).toBe(true)
  })

  it('changing whose it is is an edit, checked for duplicates', () => {
    const mine = need('Soap', { forMember: kavya })
    const r = editItem(mine, { forMember: null }, { by: wren, actionId: a, openNeeds: [mine] })
    expect(r.ok && r.value.item).not.toHaveProperty('forMember')
    expect(r.ok && r.value.events).toEqual([
      {
        kind: 'item.edited',
        itemId: 'Soap',
        changes: { for_member: [kavya, null] },
        actionId: a,
        by: wren,
      },
    ])
    const houseSoap = need('Soap2', { title: 'Soap' })
    expect(
      editItem(mine, { forMember: null }, { by: kavya, actionId: a, openNeeds: [mine, houseSoap] }),
    ).toMatchObject({ error: 'duplicate_need', detail: { existingId: 'Soap2' } })
    expect(editItem(task, { forMember: kavya }, { by: kavya, actionId: a, openNeeds: [] })).toEqual(
      { ok: false, error: 'invalid_for_category' },
    )
  })

  it('reopening checks against the same owner', () => {
    const got = need('Eggs', { forMember: kavya, done: { at: now, by: kavya } })
    expect(reopenItem(got, kavya, a, [need('Eggs2', { title: 'Eggs' })]).ok).toBe(true)
    expect(
      reopenItem(got, kavya, a, [need('Eggs2', { title: 'Eggs', forMember: kavya })]),
    ).toMatchObject({ error: 'duplicate_need' })
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

  it('"Did it" keeps the last done it replaced, for Undo', () => {
    const before = { at: instant(10), by: kavya }
    const first = doChore(chore, wren, now, a)
    expect(first.ok && first.value.events[0]).toMatchObject({
      changes: { lastDone: [null, { at: now, by: wren }] },
    })
    const again = doChore({ ...chore, lastDone: before }, wren, now, a)
    expect(again.ok && again.value.events[0]).toMatchObject({
      changes: { lastDone: [before, { at: now, by: wren }] },
    })
  })

  describe('undoChore', () => {
    const before = { at: instant(10), by: kavya }
    const mine = { at: now, by: wren }
    const didIt = { ...chore, lastDone: mine }

    it('puts the chore back to the last done it had before', () => {
      const r = undoChore(didIt, now, { previous: before, next: mine }, wren, a)
      expect(r.ok && r.value.chore.lastDone).toEqual(before)
      expect(r.ok && r.value.events).toEqual([
        {
          kind: 'chore.undone',
          itemId: 'Trash',
          changes: { lastDone: [mine, before] },
          actionId: a,
          by: wren,
        },
      ])
    })

    it('back to never done when it had never been done', () => {
      const r = undoChore(didIt, now, { previous: null, next: mine }, wren, a)
      expect(r.ok && r.value.chore).not.toHaveProperty('lastDone')
      expect(r.ok && r.value.events[0]).toMatchObject({ changes: { lastDone: [mine, null] } })
    })

    it('refuses once the chore has been done again since, by anyone', () => {
      const later = { at: instant(2000), by: kavya }
      const redone = { ...chore, lastDone: later }
      expect(undoChore(redone, now, { previous: mine, next: later }, wren, a)).toEqual({
        ok: false,
        error: 'done_again',
      })
      // My own later Did it isn't the one being undone either.
      const mineLater = { ...chore, lastDone: { at: instant(2000), by: wren } }
      expect(undoChore(mineLater, now, undefined, wren, a)).toMatchObject({ error: 'done_again' })
      // Someone else's Did it at the same moment isn't mine to undo.
      expect(undoChore(didIt, now, { previous: before, next: mine }, kavya, a)).toMatchObject({
        error: 'done_again',
      })
    })

    it("refuses when there's nothing it can put back", () => {
      expect(undoChore(chore, now, undefined, wren, a)).toEqual({
        ok: false,
        error: 'nothing_to_undo',
      })
      // An older row without changes, or a last done that came from a run, not Did it.
      expect(undoChore(didIt, now, undefined, wren, a)).toMatchObject({ error: 'nothing_to_undo' })
      expect(
        undoChore(didIt, now, { previous: null, next: { at: instant(5), by: wren } }, wren, a),
      ).toMatchObject({ error: 'nothing_to_undo' })
    })

    it('reads back what a chore.done row changed', () => {
      const r = doChore({ ...chore, lastDone: before }, wren, now, a)
      const changes = r.ok ? (r.value.events[0] as { changes: unknown }).changes : undefined
      // As stored: jsonb hands back plain objects.
      expect(choreDoneChange(JSON.parse(JSON.stringify(changes)))).toEqual({
        previous: before,
        next: mine,
      })
      expect(choreDoneChange({ lastDone: [null, mine] })).toEqual({ previous: null, next: mine })
      expect(choreDoneChange(undefined)).toBeUndefined()
      expect(choreDoneChange({ lastDone: [null, null] })).toBeUndefined()
      expect(choreDoneChange({ lastDone: ['x', mine] })).toBeUndefined()
      expect(choreDoneChange({ lastDone: [null] })).toBeUndefined()
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
