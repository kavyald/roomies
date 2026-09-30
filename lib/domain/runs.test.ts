import { describe, expect, it } from 'vitest'
import { activityRowFor, type DomainEvent, type StoredActivityRow } from './events'
import {
  asId,
  type ActionId,
  type ContactId,
  type HouseId,
  type ItemId,
  type RunId,
  type UserId,
} from './ids'
import type { Chore, Item, Need, Task } from './items'
import {
  addToRequest,
  addToRun,
  finishRun,
  handToContact,
  inArrivalOrder,
  planVisit,
  requestMessage,
  sendRequest,
  setVisitDate,
  startRequest,
  visitDateOf,
  itemPath,
  markRunItemsDone,
  moveRunItems,
  returnToPool,
  runLabel,
  runLedger,
  runProgress,
  runSteps,
  startRun,
  type Batch,
  type Request,
  type Run,
  type Visit,
} from './runs'
import { instant, type LocalDate } from './time'

const house = asId<'house'>('h') as HouseId
const kavya = asId<'user'>('kavya') as UserId
const wren = asId<'user'>('wren') as UserId
const landlord = asId<'contact'>('landlord') as ContactId
const T = instant(1_000)
const act = asId<'action'>('a') as ActionId
const ctx = { by: kavya, now: T, actionId: act }

const base = (title: string) => ({
  id: asId<'item'>(title) as ItemId,
  houseId: house,
  title,
  priority: 'normal' as const,
  createdBy: kavya,
  createdAt: instant(0),
})
const need = (title: string, o: Partial<Need> = {}): Need => ({
  ...base(title),
  category: 'need',
  ...o,
})
const task = (title: string, o: Partial<Task> = {}): Task => ({
  ...base(title),
  category: 'task',
  ...o,
})
const chore = (title: string, o: Partial<Chore> = {}): Chore => ({
  ...base(title),
  category: 'chore',
  repeatDays: 7,
  ...o,
})

const runId = (s: string) => asId<'run'>(s) as RunId
const batch = (id = 'groceries', o: Partial<Batch> = {}): Batch => ({
  id: runId(id),
  houseId: house,
  kind: 'batch',
  runner: kavya,
  createdBy: kavya,
  createdAt: T,
  state: { open: true },
  ...o,
})
const request = (state: Request['state'] = { at: 'gathering' }): Request => ({
  id: runId('request'),
  houseId: house,
  kind: 'request',
  contactId: landlord,
  runner: kavya,
  createdBy: kavya,
  createdAt: T,
  state,
})
const visit = (o: Partial<Visit> = {}): Visit => ({
  id: runId('visit'),
  houseId: house,
  kind: 'visit',
  contactId: landlord,
  runner: kavya,
  createdBy: kavya,
  createdAt: T,
  state: { open: true },
  ...o,
})
const on = <I extends Item>(item: I, r: Run): I => ({ ...item, run: { id: r.id, kind: r.kind } })
const kinds = (events: readonly DomainEvent[]) => events.map((e) => e.kind)

describe('startRun', () => {
  it('starts a batch with the selected items on it', () => {
    const r = startRun(
      { title: '  Groceries ', when: { date: '2026-10-03' as LocalDate } },
      [need('Milk'), chore('Mop')],
      { ...ctx, id: runId('g'), houseId: house },
    )
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.run).toMatchObject({
      kind: 'batch',
      title: 'Groceries',
      runner: kavya,
      state: { open: true },
      when: { date: '2026-10-03' },
    })
    expect(r.value.items.map((i) => i.run)).toEqual([
      { id: 'g', kind: 'batch' },
      { id: 'g', kind: 'batch' },
    ])
    expect(kinds(r.value.events)).toEqual(['run.created', 'run.item_added', 'run.item_added'])
  })

  it('needs something selected, open, and not already on a run', () => {
    const start = (items: Item[], title?: string) =>
      startRun({ title }, items, { ...ctx, id: runId('g'), houseId: house })
    expect(start([])).toEqual({ ok: false, error: 'nothing_selected' })
    expect(start([on(need('Milk'), batch('other'))])).toMatchObject({
      ok: false,
      error: 'already_on_a_run',
      detail: { itemId: 'Milk' },
    })
    expect(start([need('Milk', { done: { at: T, by: kavya } })])).toMatchObject({
      error: 'done_item',
    })
    expect(start([need('Milk', { archivedAt: T })])).toMatchObject({ error: 'done_item' })
    expect(start([need('Milk')], 'x'.repeat(81))).toEqual({ ok: false, error: 'title_too_long' })
  })
})

describe('addToRun', () => {
  it("won't add to a finished run or a sent request, and requests and visits take tasks only", () => {
    expect(
      addToRun(batch('g', { state: { open: false, finishedAt: T } }), [need('Milk')], ctx),
    ).toEqual({ ok: false, error: 'finished' })
    expect(addToRun(request({ at: 'sent', sentAt: T, via: 'text' }), [task('Leak')], ctx)).toEqual({
      ok: false,
      error: 'request_sent',
    })
    expect(addToRun(visit(), [need('Milk')], ctx)).toMatchObject({ error: 'tasks_only' })
  })

  it('a task on a request or visit is handled by its contact', () => {
    const r = addToRun(request(), [task('Leak')], ctx)
    expect(r.ok && r.value.items[0]).toMatchObject({
      run: { id: 'request', kind: 'request' },
      contactId: landlord,
    })
  })
})

describe('actions on a selection', () => {
  const g = batch()

  it('Done marks items done (chores: last done) and takes them off the run', () => {
    const r = markRunItemsDone(g, [on(need('Milk'), g), on(chore('Mop'), g)], {
      ...ctx,
      remainingOnRun: 3,
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.items[0]).toEqual({ ...need('Milk'), done: { at: T, by: kavya } })
    expect(r.value.items[1]).toEqual({ ...chore('Mop'), lastDone: { at: T, by: kavya } })
    expect(kinds(r.value.events)).toEqual(['run.item_done', 'run.item_done'])
    expect(markRunItemsDone(g, [need('Eggs')], { ...ctx, remainingOnRun: 1 })).toEqual({
      ok: false,
      error: 'not_on_run',
    })
    expect(markRunItemsDone(g, [], { ...ctx, remainingOnRun: 1 })).toMatchObject({
      error: 'nothing_selected',
    })
  })

  it('Move to… points items at another open run, with a note', () => {
    const saturday = batch('saturday')
    const r = moveRunItems(g, saturday, [on(need('Milk'), g)], {
      ...ctx,
      note: ' next time ',
      remainingOnFrom: 2,
    })
    expect(r.ok && r.value.items[0]?.run).toEqual({ id: 'saturday', kind: 'batch' })
    expect(r.ok && r.value.events).toEqual([
      {
        kind: 'run.item_moved',
        runId: 'groceries',
        toRunId: 'saturday',
        itemId: 'Milk',
        note: 'next time',
        actionId: act,
        by: kavya,
      },
    ])
    const milk = on(need('Milk'), g)
    const move = (to: Run, items: Item[] = [milk]) =>
      moveRunItems(g, to, items, { ...ctx, remainingOnFrom: 2 })
    expect(move(g)).toMatchObject({ error: 'same_run' })
    expect(move(batch('done', { state: { open: false, finishedAt: T } }))).toMatchObject({
      error: 'target_closed',
    })
    expect(move(visit())).toMatchObject({ error: 'tasks_only' })
    expect(move(saturday, [need('Eggs')])).toMatchObject({ error: 'not_on_run' })
  })

  it('moving tasks from a request to a visit hands them to the contact, and the empty request closes itself', () => {
    const req = request({ at: 'sent', sentAt: T, via: 'text' })
    const leak = on(task('Leak'), req)
    const r = moveRunItems(req, visit(), [leak], { ...ctx, remainingOnFrom: 1 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.items[0]).toMatchObject({ run: { id: 'visit' }, contactId: landlord })
    expect(r.value.from.state).toEqual({ at: 'closed', closedAt: T })
    expect(kinds(r.value.events)).toEqual(['run.item_moved', 'request.closed'])
  })

  it('Back to the pool takes items off with a note, and can put "Handled by" back to One of us', () => {
    const req = request()
    const leak = on(task('Leak', { contactId: landlord }), req)
    const window = on(task('Window', { contactId: landlord }), req)
    const r = returnToPool(req, [leak], {
      ...ctx,
      note: "That one's on us",
      clearContact: true,
      remainingOnFrom: 2,
    })
    expect(r.ok && r.value.items[0]).toEqual(task('Leak'))
    expect(r.ok && r.value.from.state).toEqual({ at: 'gathering' }) // the window is still on it
    expect(r.ok && r.value.events[0]).toMatchObject({
      kind: 'run.item_returned',
      note: "That one's on us",
    })
    const kept = returnToPool(req, [window], { ...ctx, clearContact: false, remainingOnFrom: 1 })
    expect(kept.ok && kept.value.items[0]).toEqual(task('Window', { contactId: landlord }))
    expect(kept.ok && kept.value.events[0]).toMatchObject({ note: 'Not done this time' })
    expect(kept.ok && kinds(kept.value.events)).toEqual(['run.item_returned', 'request.closed'])
    expect(
      returnToPool(req, [task('Door')], { ...ctx, clearContact: false, remainingOnFrom: 1 }),
    ).toMatchObject({ error: 'not_on_run' })
    expect(
      returnToPool(req, [], { ...ctx, clearContact: false, remainingOnFrom: 1 }),
    ).toMatchObject({ error: 'nothing_selected' })
  })

  it('Finish returns whatever is left, "Not done this time"', () => {
    const r = finishRun(g, [on(need('Eggs'), g)], { ...ctx, doneOnRun: 2 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.run.state).toEqual({ open: false, finishedAt: T })
    expect(r.value.items).toEqual([need('Eggs')])
    expect(r.value.events.at(-1)).toMatchObject({
      kind: 'run.finished',
      payload: { done: 2, returned: 1 },
    })
    expect(r.value.events[0]).toMatchObject({
      kind: 'run.item_returned',
      note: 'Not done this time',
    })
    expect(finishRun(r.value.run, [], { ...ctx, doneOnRun: 0 })).toEqual({
      ok: false,
      error: 'finished',
    })
    expect(finishRun(request(), [], { ...ctx, doneOnRun: 0 })).toEqual({
      ok: false,
      error: 'not_finishable',
    })
  })
})

describe('reading history back', () => {
  let seq = 0
  const rows = (events: DomainEvent[]): StoredActivityRow[] =>
    events.map((e) => ({ ...activityRowFor(e, house, T), id: ++seq }))

  it('an item keeps its path through runs, and the run sheet shows where each item went', () => {
    const g = batch()
    const sat = batch('saturday')
    const history = rows([
      { kind: 'run.item_added', runId: g.id, itemId: 'Milk' as ItemId, actionId: act, by: kavya },
      { kind: 'run.item_added', runId: g.id, itemId: 'Eggs' as ItemId, actionId: act, by: kavya },
      { kind: 'run.item_added', runId: g.id, itemId: 'Soap' as ItemId, actionId: act, by: kavya },
      { kind: 'run.item_added', runId: g.id, itemId: 'Mop' as ItemId, actionId: act, by: kavya },
      { kind: 'run.item_done', runId: g.id, itemId: 'Milk' as ItemId, actionId: act, by: wren },
      {
        kind: 'run.item_moved',
        runId: g.id,
        toRunId: sat.id,
        itemId: 'Eggs' as ItemId,
        note: 'Sold out',
        actionId: act,
        by: wren,
      },
      {
        kind: 'run.item_returned',
        runId: g.id,
        itemId: 'Soap' as ItemId,
        note: 'We have some',
        actionId: act,
        by: wren,
      },
      { kind: 'item.archived', itemId: 'Mop' as ItemId, runId: g.id, actionId: act, by: kavya },
      { kind: 'item.created', itemId: 'Other' as ItemId, actionId: act, by: kavya },
    ])
    expect(itemPath(history, 'Eggs' as ItemId).map((s) => s.what)).toEqual([
      'added',
      { movedTo: 'saturday' },
    ])
    const ledger = runLedger(g.id, runSteps(history), [])
    expect(ledger).toEqual([
      { itemId: 'Milk', state: { at: 'done', when: T } },
      { itemId: 'Eggs', state: { at: 'moved', to: 'saturday', note: 'Sold out' } },
      { itemId: 'Soap', state: { at: 'returned', note: 'We have some' } },
      { itemId: 'Mop', state: { at: 'returned', note: 'Archived' } },
    ])
    expect(runProgress(ledger)).toEqual({ done: 1, total: 4 })

    // On Saturday's run, the eggs arrived by a move and are still there.
    const eggs = on(need('Eggs'), sat)
    expect(runLedger(sat.id, runSteps(history), [eggs])).toEqual([
      { itemId: 'Eggs', state: { at: 'pending' } },
    ])
  })

  it('checking an item off from its own tab while it is on a run counts as done there', () => {
    const g = batch()
    const history = rows([
      { kind: 'run.item_added', runId: g.id, itemId: 'Milk' as ItemId, actionId: act, by: kavya },
      { kind: 'item.done', itemId: 'Milk' as ItemId, runId: g.id, actionId: act, by: kavya },
      { kind: 'run.item_added', runId: g.id, itemId: 'Mop' as ItemId, actionId: act, by: kavya },
      { kind: 'chore.done', itemId: 'Mop' as ItemId, runId: g.id, actionId: act, by: kavya },
    ])
    expect(runProgress(runLedger(g.id, runSteps(history), []))).toEqual({ done: 2, total: 2 })
  })
})

describe('requests and visits', () => {
  const sctx = { ...ctx, id: runId('new'), houseId: house }
  const plumber = asId<'contact'>('plumber') as ContactId

  it('a request may start empty; a visit can have a date, or not', () => {
    const r = startRequest({ contactId: landlord }, [], sctx)
    expect(r.ok && r.value.run).toMatchObject({ kind: 'request', state: { at: 'gathering' } })
    expect(r.ok && r.value.events).toEqual([
      { kind: 'run.created', runId: 'new', contactId: landlord, actionId: act, by: kavya },
    ])
    const v = planVisit(
      { contactId: landlord, when: { date: '2026-10-01' as LocalDate } },
      [task('Leak')],
      sctx,
    )
    expect(v.ok && v.value.run).toMatchObject({ kind: 'visit', when: { date: '2026-10-01' } })
    expect(v.ok && v.value.items[0]).toMatchObject({ contactId: landlord, run: { kind: 'visit' } })
    expect(planVisit({ contactId: landlord }, [need('Milk')], sctx)).toMatchObject({
      error: 'tasks_only',
    })
  })

  it('"Add to Landlord list" joins the gathering request, or starts one', () => {
    const leak = task('Leak', { contactId: landlord })
    const fresh = addToRequest(leak, [], sctx)
    expect(fresh.ok && fresh.value).toMatchObject({ created: true, run: { kind: 'request' } })
    const existing = request()
    const joined = addToRequest(leak, [batch(), existing], sctx)
    expect(joined.ok && joined.value).toMatchObject({ created: false, run: { id: 'request' } })
    expect(addToRequest(task('Door'), [], sctx)).toMatchObject({ error: 'no_contact' })
    expect(addToRequest(need('Milk'), [], sctx)).toMatchObject({ error: 'tasks_only' })
    // A sent request is waiting; a new list starts instead.
    const sent = request({ at: 'sent', sentAt: T, via: 'text' })
    expect(addToRequest(leak, [sent], sctx)).toMatchObject({ ok: true, value: { created: true } })
  })

  it('composes the message and marks the request sent', () => {
    const msg = requestMessage(
      'Dana',
      [
        { title: 'Leak under the sink', room: 'Kitchen', note: 'Drips overnight' },
        { title: 'Window latch' },
      ],
      { address: '12 Elm St', unit: '3' },
    )
    expect(msg).toBe(
      'Hi Dana, could you take a look at these at 12 Elm St, Unit 3?\n\n1. Leak under the sink (Kitchen) — Drips overnight\n2. Window latch\n\nThank you!',
    )
    expect(requestMessage('Dana', [{ title: 'Leak' }])).toBe(
      'Hi Dana, could you take a look at this?\n\n1. Leak\n\nThank you!',
    )
    const r = sendRequest(request(), 'text', msg, 2, ctx)
    expect(r.ok && r.value.run.state).toEqual({ at: 'sent', sentAt: T, via: 'text' })
    expect(r.ok && r.value.events[0]).toMatchObject({
      kind: 'request.sent',
      payload: { via: 'text', message: msg },
    })
    expect(sendRequest(request(), 'text', msg, 0, ctx)).toMatchObject({ error: 'empty' })
    expect(
      sendRequest(request({ at: 'sent', sentAt: T, via: 'call' }), 'text', msg, 1, ctx),
    ).toMatchObject({ error: 'not_gathering' })
    expect(sendRequest(batch(), 'text', msg, 1, ctx)).toMatchObject({ error: 'not_a_request' })
  })

  it('"Hand to…" moves tasks to another contact\'s unsent list, starting one if needed', () => {
    const req = request({ at: 'sent', sentAt: T, via: 'text' })
    const leak = on(task('Leak', { contactId: landlord }), req)
    const r = handToContact(req, [leak], plumber, [req], {
      ...sctx,
      note: 'Call a plumber yourselves',
      remainingOnFrom: 2,
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value).toMatchObject({ created: true, to: { kind: 'request', contactId: plumber } })
    expect(r.value.items[0]).toMatchObject({ contactId: plumber, run: { id: 'new' } })
    expect(kinds(r.value.events)).toEqual(['run.created', 'run.item_moved'])
    const theirs: Request = { ...request(), id: runId('plumber-list'), contactId: plumber }
    const again = handToContact(req, [leak], plumber, [req, theirs], {
      ...sctx,
      remainingOnFrom: 1,
    })
    expect(again.ok && again.value).toMatchObject({ created: false, to: { id: 'plumber-list' } })
    expect(again.ok && kinds(again.value.events)).toEqual(['run.item_moved', 'request.closed'])
    expect(
      handToContact(g(), [on(need('Milk'), g())], plumber, [], { ...sctx, remainingOnFrom: 1 }),
    ).toMatchObject({ error: 'tasks_only' })
  })

  it("sets, changes, and clears a visit's date", () => {
    const v = visit()
    const set = setVisitDate(v, { date: '2026-10-02' as LocalDate }, ctx)
    expect(set.ok && set.value.run.when).toEqual({ date: '2026-10-02' })
    expect(set.ok && set.value.events[0]).toMatchObject({
      kind: 'run.date_set',
      changes: { when: [null, { date: '2026-10-02' }] },
    })
    const cleared = set.ok && setVisitDate(set.value.run, null, ctx)
    expect(cleared && cleared.ok && cleared.value.run.when).toBeUndefined()
    expect(setVisitDate(v, null, ctx)).toMatchObject({ error: 'no_change' })
    expect(setVisitDate(batch(), null, ctx)).toMatchObject({ error: 'not_a_visit' })
  })

  it("finds a task's visit date for the feed rule", () => {
    const v = visit({ when: { date: '2026-10-02' as LocalDate } })
    const runs = new Map<string, Run>([[v.id, v]])
    expect(visitDateOf(on(task('Leak'), v), runs)).toBe('2026-10-02')
    expect(visitDateOf(task('Leak'), runs)).toBeUndefined()
    expect(visitDateOf(on(task('Leak'), visit({ id: runId('other') })), runs)).toBeUndefined()
  })
})

const g = () => batch()

describe('inArrivalOrder', () => {
  it('orders items the way they came onto the run; strangers go last', () => {
    const ledger = [
      { itemId: 'Leak' as ItemId, state: { at: 'pending' as const } },
      { itemId: 'Mold' as ItemId, state: { at: 'pending' as const } },
    ]
    expect(
      inArrivalOrder([task('Other'), task('Mold'), task('Leak')], ledger).map((t) => t.title),
    ).toEqual(['Leak', 'Mold', 'Other'])
  })
})

describe('runLabel', () => {
  const names = {
    person: (id: string) => (id === kavya ? 'Kavya' : undefined),
    contact: (id: string) => (id === landlord ? 'Landlord' : undefined),
  }
  it('uses the title, or names it after the runner or the contact', () => {
    expect(runLabel(batch('g', { title: 'Groceries' }), names)).toBe('Groceries')
    expect(runLabel(batch(), names)).toBe("Kavya's run")
    expect(runLabel(batch('x', { runner: wren }), names)).toBe("Someone's run")
    expect(runLabel(visit(), names)).toBe('Landlord visit')
    expect(runLabel(request(), names)).toBe('Landlord request')
    expect(runLabel({ ...visit(), contactId: 'gone' as ContactId }, names)).toBe('Contact visit')
  })
})
