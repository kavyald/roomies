import { describe, expect, it } from 'vitest'
import { changeFeedContract } from '../contracts/change-feed.contract'
import { changeForKind } from '../change-for-kind'
import { seqIds } from '../ids'
import { MemoryUnitOfWork } from './db'
import { memoryChangeFeed } from './queries'
import type { UserId } from '../../domain/ids'

changeFeedContract('memory', async () => {
  const uow = new MemoryUnitOfWork()
  const ids = seqIds()
  return {
    uow,
    ids,
    createUser: async () => ids.newId<'user'>() as UserId,
    activity: async () => [],
    feedFor: (userId, houseId) => memoryChangeFeed(uow, { kind: 'member', userId, houseId }),
  }
})

describe('changeForKind', () => {
  it('names the table an activity kind changed', () => {
    expect(
      ['item.created', 'chore.done', 'feeling.removed', 'member.joined', 'room.renamed'].map(
        (k) => changeForKind(k).table,
      ),
    ).toEqual(['items', 'items', 'feelings', 'house_members', 'rooms'])
    expect(changeForKind('contact.added').table).toBe('contacts')
    expect(changeForKind('invite.created').table).toBe('house_invites')
    expect(changeForKind('settings.feeling_weights_changed').table).toBe('houses')
    expect(changeForKind('poll.voted').table).toBe('polls')
    expect(changeForKind('cost.added').table).toBe('costs')
    expect(changeForKind('bill.paid').table).toBe('unknown')
  })
})
