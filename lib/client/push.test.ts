import { describe, expect, it } from 'vitest'
import { applicationServerKey } from './push'

describe('applicationServerKey', () => {
  it('turns the base64url VAPID key into bytes (padding and URL-safe characters included)', () => {
    // "\xfb\xff" is "-_8" in base64url ("+/8=" in plain base64).
    expect([...applicationServerKey('-_8')]).toEqual([0xfb, 0xff])
    expect([...applicationServerKey('AQID')]).toEqual([1, 2, 3])
  })
})
