// Personal settings (PRD §11, FRONTEND §5.1 "your avatar → personal settings"): theme and quiet
// hours. They're yours alone, so they're not house activity. Pure.

import type { Profile, Theme } from './house'
import type { QuietHours } from './notifications'
import { err, ok, type Result } from './result'

export type SettingsPatch = {
  readonly theme?: Theme
  /** null: back to the default (10pm–8am). Start = end: no quiet hours at all. */
  readonly quietHours?: QuietHours | null
}

const isTime = (t: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t)

export const updateSettings = (
  p: Profile,
  patch: SettingsPatch,
): Result<Profile, 'bad_time' | 'no_change'> => {
  const q = patch.quietHours
  if (q && (!isTime(q.start) || !isTime(q.end))) return err('bad_time')
  const next: Profile = {
    ...p,
    ...(patch.theme && { theme: patch.theme }),
    ...(q !== undefined && { quietHours: q ?? undefined }),
  }
  if (q === null) delete (next as { quietHours?: QuietHours }).quietHours
  const same =
    next.theme === p.theme &&
    next.quietHours?.start === p.quietHours?.start &&
    next.quietHours?.end === p.quietHours?.end
  return same ? err('no_change') : ok(next)
}
