import { describe, expect, it } from 'vitest'
import { checkPrSource } from './pr-source'

const repo = 'kavyald/roomies'

describe('checkPrSource', () => {
  it('lets staging into main', () => {
    expect(checkPrSource({ base: 'main', head: 'staging', headRepo: repo, repo })).toEqual({
      ok: true,
    })
  })

  it('rejects any other branch into main', () => {
    for (const head of ['v1', 'feature/x', 'main', 'Staging']) {
      expect(checkPrSource({ base: 'main', head, headRepo: repo, repo })).toEqual({
        ok: false,
        reason: 'PRs into main come from the staging branch.',
      })
    }
  })

  it("rejects a fork's staging branch", () => {
    expect(
      checkPrSource({ base: 'main', head: 'staging', headRepo: 'someone/roomies', repo }),
    ).toEqual({ ok: false, reason: 'PRs into main come from this repo, not a fork.' })
  })

  it('leaves PRs into other branches alone', () => {
    expect(checkPrSource({ base: 'staging', head: 'v1', headRepo: repo, repo })).toEqual({
      ok: true,
    })
    expect(
      checkPrSource({ base: 'staging', head: 'x', headRepo: 'someone/roomies', repo }),
    ).toEqual({ ok: true })
  })
})
