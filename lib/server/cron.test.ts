import { describe, expect, it, vi } from 'vitest'
import { handleCron } from './cron'

const SECRET = 's'.repeat(48)
const env = (jobs = {}) => {
  const log = vi.fn()
  let t = 1000
  return { cronSecret: SECRET, jobs, now: () => (t += 5), log }
}

describe('handleCron', () => {
  it('runs the named job with the right secret, and logs success', async () => {
    const e = env({ tick: async () => ({ checked: 0 }) })
    expect(await handleCron('tick', SECRET, e)).toEqual({
      status: 200,
      body: { job: 'tick', ok: true, checked: 0 },
    })
    expect(e.log).toHaveBeenCalledWith('[cron] tick ok in 5ms {"checked":0}')
  })

  it('refuses a missing or wrong secret, and unknown jobs', async () => {
    const tick = vi.fn(async () => ({}))
    for (const s of [null, '', 'nope', SECRET + 'x']) {
      expect((await handleCron('tick', s, env({ tick }))).status).toBe(401)
    }
    expect(tick).not.toHaveBeenCalled()
    expect((await handleCron('toString', SECRET, env({ tick }))).status).toBe(404)
    expect((await handleCron('nope', SECRET, env({ tick }))).status).toBe(404)
  })

  it('reports a failing job without leaking its error', async () => {
    const e = env({ boom: async () => Promise.reject(new Error('db down')) })
    expect(await handleCron('boom', SECRET, e)).toEqual({
      status: 500,
      body: { job: 'boom', ok: false },
    })
    expect(e.log).toHaveBeenCalledWith('[cron] boom error: db down')
  })
})
