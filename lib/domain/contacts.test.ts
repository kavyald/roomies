import { describe, expect, it } from 'vitest'
import { editContact, removeContact } from './contacts'
import type { Contact } from './house'
import { asId, type ActionId, type ContactId, type HouseId, type UserId } from './ids'
import { instant } from './time'

const c: Contact = {
  id: asId<'contact'>('c') as ContactId,
  houseId: asId<'house'>('h') as HouseId,
  name: 'Super',
  phone: '555-0100',
}
const by = asId<'user'>('u') as UserId
const a = asId<'action'>('a') as ActionId

describe('editContact', () => {
  it('records what changed, and clears a phone set to blank', () => {
    const r = editContact(c, { name: 'Super (Joe)', phone: ' ', note: 'Texts are best' }, by, a)
    expect(r.ok && r.value.contact).toEqual({
      id: c.id,
      houseId: c.houseId,
      name: 'Super (Joe)',
      note: 'Texts are best',
    })
    expect(r.ok && r.value.events[0]).toMatchObject({
      kind: 'contact.edited',
      changes: {
        name: ['Super', 'Super (Joe)'],
        phone: ['555-0100', null],
        note: [null, 'Texts are best'],
      },
    })
  })

  it('refuses a blank name or no change', () => {
    expect(editContact(c, { name: ' ' }, by, a)).toEqual({ ok: false, error: 'empty_name' })
    expect(editContact(c, { name: 'Super' }, by, a)).toEqual({ ok: false, error: 'no_change' })
  })
})

describe('removeContact', () => {
  it('archives once', () => {
    const r = removeContact(c, by, instant(5), a)
    expect(r.ok && r.value.contact.archivedAt).toEqual(instant(5))
    expect(removeContact({ ...c, archivedAt: instant(1) }, by, instant(5), a)).toEqual({
      ok: false,
      error: 'already_removed',
    })
  })
})
