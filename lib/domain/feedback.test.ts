import { describe, expect, it } from 'vitest'
import { makeFeedback, MAX_FEEDBACK, MAX_USER_AGENT } from './feedback'
import { asId } from './ids'
import { instant } from './time'

const ctx = {
  id: asId<'feedback'>('f1'),
  houseId: asId<'house'>('h1'),
  by: asId<'user'>('u1'),
  now: instant(Date.UTC(2026, 9, 14, 16, 0)),
  appVersion: 'a1b2c3d',
  userAgent: 'Mozilla/5.0 (iPhone)',
}

describe('makeFeedback', () => {
  it('trims the message and keeps who sent it, from which house and app', () => {
    expect(makeFeedback({ kind: 'bug', message: '  The calendar is blank \n' }, ctx)).toEqual({
      ok: true,
      value: {
        id: ctx.id,
        houseId: ctx.houseId,
        userId: ctx.by,
        kind: 'bug',
        message: 'The calendar is blank',
        appVersion: 'a1b2c3d',
        userAgent: 'Mozilla/5.0 (iPhone)',
        createdAt: ctx.now,
      },
    })
  })

  it('refuses an empty or too-long message', () => {
    expect(makeFeedback({ kind: 'idea', message: '  ' }, ctx)).toEqual({
      ok: false,
      error: 'empty',
    })
    expect(makeFeedback({ kind: 'idea', message: 'x'.repeat(MAX_FEEDBACK) }, ctx).ok).toBe(true)
    expect(makeFeedback({ kind: 'idea', message: 'x'.repeat(MAX_FEEDBACK + 1) }, ctx)).toEqual({
      ok: false,
      error: 'too_long',
    })
  })

  it('caps a long user agent, leaves out a missing one, and falls back to dev', () => {
    const long = makeFeedback(
      { kind: 'praise', message: 'Love it' },
      { ...ctx, userAgent: 'u'.repeat(1000) },
    )
    expect(long.ok && long.value.userAgent).toHaveLength(MAX_USER_AGENT)
    const bare = makeFeedback(
      { kind: 'praise', message: 'Love it' },
      { ...ctx, userAgent: null, appVersion: ' ' },
    )
    expect(bare.ok && bare.value).not.toHaveProperty('userAgent')
    expect(bare.ok && bare.value.appVersion).toBe('dev')
  })
})
