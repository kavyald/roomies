// The UnitOfWork contract: one suite, run against every adapter (memory now, Postgres from T08).
// Each test builds its own house, so the suite can share a database without cleanup.

import { beforeAll, describe, expect, it } from 'vitest'
import {
  AccessDenied,
  ConstraintViolation,
  type IdGenerator,
  type UnitOfWork,
} from '../../app/ports'
import type { Actor, HouseActor } from '../../domain/actor'
import type { StoredActivityRow } from '../../domain/events'
import {
  defaultHouseSettings,
  type Contact,
  type House,
  type Invite,
  type Member,
  type Profile,
  type Role,
  type Room,
} from '../../domain/house'
import type { ActionId, HouseId, UserId } from '../../domain/ids'
import { err, ok } from '../../domain/result'
import { instant, type LocalTime } from '../../domain/time'

export type UnitOfWorkHarness = {
  readonly uow: UnitOfWork
  readonly ids: IdGenerator
  /** Creates an auth user (Supabase Auth owns these in production). */
  createUser(): Promise<UserId>
  /** Reads a house's activity rows, bypassing access rules. */
  activity(houseId: HouseId): Promise<StoredActivityRow[]>
}

const T0 = instant(Date.UTC(2026, 8, 29, 16, 0))

/**
 * An item or run as read back, without the version the store stamps on it (§7.5), so a round
 * trip compares what was written. Checks the version is there.
 */
export const unversioned = <T extends { version?: string }>(x: T | undefined): T | undefined => {
  if (x === undefined) return x
  expect(x.version).toEqual(expect.any(String))
  const { version: _v, ...rest } = x
  return rest as T
}

export const system = (houseId: HouseId): HouseActor => ({ kind: 'system', houseId })
export const asMember = (houseId: HouseId, userId: UserId): HouseActor => ({
  kind: 'member',
  houseId,
  userId,
})

type SeededHouse = { house: House; admin: UserId; member: UserId }

/** A house with an admin and a member, written as the system actor. */
export const seedHouse = async (h: UnitOfWorkHarness): Promise<SeededHouse> => {
  const admin = await h.createUser()
  const member = await h.createUser()
  const house: House = {
    id: h.ids.newId(),
    name: 'The apartment',
    settings: defaultHouseSettings('America/New_York'),
    createdBy: admin,
    createdAt: T0,
  }
  const profile = (id: UserId, displayName: string): Profile => ({
    id,
    displayName,
    theme: 'auto',
    createdAt: T0,
  })
  const joined = (userId: UserId, role: Role): Member => ({
    houseId: house.id,
    userId,
    role,
    joinedAt: T0,
    status: { active: true },
  })
  await h.uow.run(system(house.id), async (r) => {
    await r.profiles.save(profile(admin, 'Kavya'))
    await r.profiles.save(profile(member, 'Wren'))
    await r.houses.save(house)
    await r.members.save(joined(admin, 'admin'))
    await r.members.save(joined(member, 'member'))
  })
  return { house, admin, member }
}

export const unitOfWorkContract = (name: string, makeHarness: () => Promise<UnitOfWorkHarness>) =>
  describe(`UnitOfWork contract: ${name}`, () => {
    let h: UnitOfWorkHarness
    beforeAll(async () => {
      h = await makeHarness()
    })

    const aContact = (houseId: HouseId, extra: Partial<Contact> = {}): Contact => ({
      id: h.ids.newId(),
      houseId,
      name: 'Super',
      ...extra,
    })

    describe('round trips', () => {
      it('houses, with settings', async () => {
        const { house } = await seedHouse(h)
        const full: House = { ...house, address: '12 Elm St', unit: '2' }
        await h.uow.run(system(house.id), (r) => r.houses.save(full))
        const back = await h.uow.run(system(house.id), (r) => r.houses.get(house.id))
        expect(back).toEqual(full)
        expect(await h.uow.run(system(house.id), (r) => r.houses.any())).toBe(true)
      })

      it('profiles, with and without optional fields', async () => {
        const { house, member } = await seedHouse(h)
        const p: Profile = {
          id: member,
          displayName: 'Wren',
          theme: 'dark',
          timezone: 'Europe/London',
          quietHours: { start: '22:00' as LocalTime, end: '07:30' as LocalTime },
          createdAt: T0,
        }
        await h.uow.run(asMember(house.id, member), (r) => r.profiles.save(p))
        expect(await h.uow.run(system(house.id), (r) => r.profiles.get(member))).toEqual(p)
      })

      it('members, including moving out', async () => {
        const { house, member } = await seedHouse(h)
        const room: Room = {
          id: h.ids.newId(),
          houseId: house.id,
          name: 'Water',
          floor: 'first',
          kind: 'bedroom',
          element: 'water',
          sortOrder: 3,
        }
        await h.uow.run(system(house.id), async (r) => {
          await r.rooms.save(room)
          const m = await r.members.get(house.id, member)
          await r.members.save({ ...m!, roomId: room.id })
        })
        const withRoom = await h.uow.run(system(house.id), (r) => r.members.get(house.id, member))
        expect(withRoom?.roomId).toBe(room.id)

        const left: Member = { ...withRoom!, status: { active: false, leftAt: T0 } }
        await h.uow.run(system(house.id), (r) => r.members.save(left))
        expect(await h.uow.run(system(house.id), (r) => r.members.get(house.id, member))).toEqual(
          left,
        )
        const all = await h.uow.run(system(house.id), (r) => r.members.listByHouse(house.id))
        expect(all).toHaveLength(2)
      })

      it('rooms, sorted', async () => {
        const { house } = await seedHouse(h)
        const room = (name: string, sortOrder: number, extra: Partial<Room> = {}): Room => ({
          id: h.ids.newId(),
          houseId: house.id,
          name,
          floor: 'basement',
          kind: 'common',
          sortOrder,
          ...extra,
        })
        const laundry = room('Laundry', 2, { kind: 'utility', archivedAt: T0 })
        const earth = room('Earth', 1, { kind: 'bedroom', element: 'earth' })
        await h.uow.run(system(house.id), async (r) => {
          await r.rooms.save(laundry)
          await r.rooms.save(earth)
        })
        const rooms = await h.uow.run(system(house.id), (r) => r.rooms.listByHouse(house.id))
        expect(rooms).toEqual([earth, laundry])
        expect(await h.uow.run(system(house.id), (r) => r.rooms.get(earth.id))).toEqual(earth)
      })

      it('contacts, sorted by name', async () => {
        const { house } = await seedHouse(h)
        const landlord = aContact(house.id, { name: 'Landlord', phone: '(555) 010-2231' })
        const sup = aContact(house.id, { name: 'Super', note: 'Texts are best' })
        await h.uow.run(system(house.id), async (r) => {
          await r.contacts.save(sup)
          await r.contacts.save(landlord)
        })
        const list = await h.uow.run(system(house.id), (r) => r.contacts.listByHouse(house.id))
        expect(list).toEqual([landlord, sup])
      })

      it('invites, by id and by token hash', async () => {
        const { house, admin } = await seedHouse(h)
        const invite: Invite = {
          id: h.ids.newId(),
          houseId: house.id,
          tokenHash: `hash-${house.id}`,
          createdBy: admin,
          expiresAt: T0,
          maxUses: 3,
          uses: 0,
        }
        await h.uow.run(asMember(house.id, admin), (r) => r.invites.save(invite))
        const revoked = { ...invite, uses: 1, revokedAt: T0 }
        await h.uow.run(asMember(house.id, admin), (r) => r.invites.save(revoked))
        const byHash = await h.uow.run(system(house.id), (r) =>
          r.invites.findByTokenHash(invite.tokenHash),
        )
        expect(byHash).toEqual(revoked)
        expect(await h.uow.run(system(house.id), (r) => r.invites.get(invite.id))).toEqual(revoked)
        expect(
          await h.uow.run(asMember(house.id, admin), (r) => r.invites.listByHouse(house.id)),
        ).toEqual([revoked])
      })
    })

    describe('access rules', () => {
      it("a member reads their own house and nothing of another's", async () => {
        const mine = await seedHouse(h)
        const theirs = await seedHouse(h)
        const secret = aContact(theirs.house.id)
        await h.uow.run(system(theirs.house.id), (r) => r.contacts.save(secret))

        const me = asMember(mine.house.id, mine.member)
        await h.uow.run(me, async (r) => {
          expect(await r.houses.get(mine.house.id)).toBeDefined()
          expect(await r.houses.get(theirs.house.id)).toBeUndefined()
          expect(await r.contacts.get(secret.id)).toBeUndefined()
          expect(await r.contacts.listByHouse(theirs.house.id)).toEqual([])
          expect(await r.members.listByHouse(theirs.house.id)).toEqual([])
          expect(await r.profiles.get(theirs.member)).toBeUndefined()
          expect(await r.profiles.get(mine.admin)).toBeDefined()
        })
      })

      it("a member can't write into another house", async () => {
        const mine = await seedHouse(h)
        const theirs = await seedHouse(h)
        const me = asMember(mine.house.id, mine.member)
        await expect(
          h.uow.run(me, (r) => r.contacts.save(aContact(theirs.house.id))),
        ).rejects.toBeInstanceOf(AccessDenied)
        await expect(
          h.uow.run(me, (r) =>
            r.events.record(
              theirs.house.id,
              [{ kind: 'house.created', actionId: h.ids.newId(), by: mine.member }],
              T0,
            ),
          ),
        ).rejects.toBeInstanceOf(AccessDenied)
      })

      it("only admins manage invites and members; a member can't edit someone's profile", async () => {
        const { house, admin, member } = await seedHouse(h)
        const me = asMember(house.id, member)
        const invite: Invite = {
          id: h.ids.newId(),
          houseId: house.id,
          tokenHash: `member-${house.id}`,
          createdBy: member,
          expiresAt: T0,
          maxUses: 1,
          uses: 0,
        }
        await expect(h.uow.run(me, (r) => r.invites.save(invite))).rejects.toBeInstanceOf(
          AccessDenied,
        )
        await expect(
          h.uow.run(me, async (r) => {
            const m = await r.members.get(house.id, member)
            await r.members.save({ ...m!, role: 'admin' })
          }),
        ).rejects.toBeInstanceOf(AccessDenied)
        await expect(
          h.uow.run(me, async (r) => {
            const p = await r.profiles.get(admin)
            await r.profiles.save({ ...p!, displayName: 'Not you' })
          }),
        ).rejects.toBeInstanceOf(AccessDenied)
      })

      it('any member may change the feeling weights, but only admins change the rest of the house', async () => {
        const { house, admin, member } = await seedHouse(h)
        const me = asMember(house.id, member)
        const withWeights = (weights: Partial<House['settings']['feelingWeights']>) => ({
          ...house,
          settings: {
            ...house.settings,
            feelingWeights: { ...house.settings.feelingWeights, ...weights },
          },
        })
        await h.uow.run(me, (r) => r.houses.save(withWeights({ anxious: 40 })))
        expect(
          (await h.uow.run(me, (r) => r.houses.get(house.id)))?.settings.feelingWeights.anxious,
        ).toBe(40)
        await expect(
          h.uow.run(me, (r) =>
            r.houses.save({ ...withWeights({ anxious: 40 }), name: 'Mine now' }),
          ),
        ).rejects.toBeInstanceOf(AccessDenied)
        await expect(
          h.uow.run(me, (r) =>
            r.houses.save({
              ...withWeights({ anxious: 40 }),
              settings: { ...withWeights({ anxious: 40 }).settings, timezone: 'UTC' },
            }),
          ),
        ).rejects.toBeInstanceOf(AccessDenied)
        await h.uow.run(asMember(house.id, admin), (r) =>
          r.houses.save({ ...withWeights({ anxious: 40 }), name: 'Ours' }),
        )
        await expect(
          h.uow.run(me, (r) => r.houses.save({ ...withWeights({ anxious: 45 }), name: 'Ours' })),
        ).rejects.toBeInstanceOf(ConstraintViolation)
      })

      it('a signed-in user outside any house context lists only their own memberships', async () => {
        const mine = await seedHouse(h)
        const theirs = await seedHouse(h)
        const me: Actor = { kind: 'user', userId: mine.member }
        const found = await h.uow.run(me, (r) => r.members.listForUser(mine.member))
        expect(found.map((m) => m.houseId)).toEqual([mine.house.id])
        expect(await h.uow.run(me, (r) => r.members.listForUser(theirs.member))).toEqual([])
      })

      it('someone who moved out sees only their own membership', async () => {
        const { house, member } = await seedHouse(h)
        await h.uow.run(system(house.id), async (r) => {
          await r.contacts.save(aContact(house.id))
          const m = await r.members.get(house.id, member)
          await r.members.save({ ...m!, status: { active: false, leftAt: T0 } })
        })
        await h.uow.run(asMember(house.id, member), async (r) => {
          expect(await r.houses.get(house.id)).toBeUndefined()
          expect(await r.contacts.listByHouse(house.id)).toEqual([])
          expect((await r.members.get(house.id, member))?.status.active).toBe(false)
        })
      })
    })

    describe('transactions', () => {
      it('commits when the work succeeds', async () => {
        const { house, member } = await seedHouse(h)
        const c = aContact(house.id)
        const out = await h.uow.run(asMember(house.id, member), async (r) => {
          await r.contacts.save(c)
          return ok(c.id)
        })
        expect(out).toEqual(ok(c.id))
        expect(await h.uow.run(system(house.id), (r) => r.contacts.get(c.id))).toEqual(c)
      })

      it('rolls back when the work throws', async () => {
        const { house, member } = await seedHouse(h)
        const c = aContact(house.id)
        await expect(
          h.uow.run(asMember(house.id, member), async (r) => {
            await r.contacts.save(c)
            throw new Error('boom')
          }),
        ).rejects.toThrow('boom')
        expect(await h.uow.run(system(house.id), (r) => r.contacts.get(c.id))).toBeUndefined()
      })

      it('rolls back when the work returns a failed Result', async () => {
        const { house, member } = await seedHouse(h)
        const c = aContact(house.id)
        const out = await h.uow.run(asMember(house.id, member), async (r) => {
          await r.contacts.save(c)
          await r.events.record(
            house.id,
            [{ kind: 'contact.created', contactId: c.id, actionId: h.ids.newId(), by: member }],
            T0,
          )
          return err('changed_my_mind')
        })
        expect(out).toEqual(err('changed_my_mind'))
        expect(await h.uow.run(system(house.id), (r) => r.contacts.get(c.id))).toBeUndefined()
        expect(await h.activity(house.id)).toEqual([])
      })
    })

    describe('event sink', () => {
      it('records one row per event, in order, with typed subjects', async () => {
        const { house, admin, member } = await seedHouse(h)
        const actionId = h.ids.newId<'action'>() as ActionId
        const c = aContact(house.id)
        await h.uow.run(asMember(house.id, admin), async (r) => {
          await r.contacts.save(c)
          await r.events.record(
            house.id,
            [
              { kind: 'contact.created', contactId: c.id, actionId, by: admin },
              {
                kind: 'member.role_changed',
                memberId: member,
                note: 'Co-admin',
                changes: { role: ['member', 'admin'] },
                actionId,
                by: admin,
              },
              {
                kind: 'invite.created',
                payload: { maxUses: 2, expiresAt: '2026-10-06' },
                actionId,
                by: admin,
              },
            ],
            T0,
          )
        })
        const rows = await h.activity(house.id)
        expect(rows.map((r) => r.kind)).toEqual([
          'contact.created',
          'member.role_changed',
          'invite.created',
        ])
        expect(rows[0]!.id).toBeLessThan(rows[1]!.id)
        expect(rows[0]).toMatchObject({ contactId: c.id, actorId: admin, actionId, at: T0 })
        expect(rows[1]).toMatchObject({
          memberId: member,
          note: 'Co-admin',
          changes: { role: ['member', 'admin'] },
        })
        expect(rows[2]!.payload).toEqual({ v: 1, maxUses: 2, expiresAt: '2026-10-06' })
      })

      it("a member can't record events in someone else's name", async () => {
        const { house, admin, member } = await seedHouse(h)
        await expect(
          h.uow.run(asMember(house.id, member), (r) =>
            r.events.record(
              house.id,
              [{ kind: 'house.created', actionId: h.ids.newId(), by: admin }],
              T0,
            ),
          ),
        ).rejects.toBeInstanceOf(AccessDenied)
      })

      it('the system actor records events as Roomies', async () => {
        const { house } = await seedHouse(h)
        await h.uow.run(system(house.id), (r) =>
          r.events.record(
            house.id,
            [{ kind: 'house.created', actionId: h.ids.newId(), by: null }],
            T0,
          ),
        )
        expect((await h.activity(house.id))[0]).toMatchObject({
          kind: 'house.created',
          actorId: null,
        })
      })
    })
  })
