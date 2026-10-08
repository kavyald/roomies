import { describe, expect, it } from 'vitest'
import type { Profile } from './house'
import { asId, type UserId } from './ids'
import { updateSettings } from './profile'
import { instant, type LocalTime } from './time'

const me: Profile = {
  id: asId<'user'>('me') as UserId,
  displayName: 'Kavya',
  theme: 'auto',
  createdAt: instant(0),
}
const q = (start: string, end: string) => ({ start: start as LocalTime, end: end as LocalTime })

describe('updateSettings', () => {
  it('changes the theme and quiet hours, and can go back to the default hours', () => {
    const dark = updateSettings(me, { theme: 'dark' })
    expect(dark.ok && dark.value.theme).toBe('dark')
    const late = updateSettings(me, { quietHours: q('23:00', '07:30') })
    expect(late.ok && late.value.quietHours).toEqual(q('23:00', '07:30'))
    const back = late.ok && updateSettings(late.value, { quietHours: null })
    expect(back && back.ok && back.value).toEqual(me)
    const none = updateSettings(me, { quietHours: q('00:00', '00:00') })
    expect(none.ok && none.value.quietHours).toEqual(q('00:00', '00:00'))
  })

  it('refuses bad times, and says when nothing changed', () => {
    expect(updateSettings(me, { quietHours: q('25:00', '07:00') })).toEqual({
      ok: false,
      error: 'bad_time',
    })
    expect(updateSettings(me, { quietHours: q('22:00', '7:00') })).toMatchObject({
      error: 'bad_time',
    })
    expect(updateSettings(me, { theme: 'auto' })).toEqual({ ok: false, error: 'no_change' })
    expect(updateSettings(me, { quietHours: null })).toEqual({ ok: false, error: 'no_change' })
  })
})
