import { describe, expect, it } from 'vitest'
import { shouldShowInstallGuide } from './install'

const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
const IPHONE_CHROME =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1'
const DESKTOP_CHROME =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'

describe('shouldShowInstallGuide', () => {
  it.each([
    ['iPhone Safari, in the browser', IPHONE_SAFARI, false, false, true],
    ['iPhone Safari, already installed', IPHONE_SAFARI, true, false, false],
    ['iPhone Safari, closed the guide', IPHONE_SAFARI, false, true, false],
    ['Chrome on iPhone', IPHONE_CHROME, false, false, false],
    ['desktop', DESKTOP_CHROME, false, false, false],
  ])('%s → %s', (_label, userAgent, standalone, dismissed, expected) => {
    expect(shouldShowInstallGuide({ userAgent, standalone, dismissed })).toBe(expected)
  })
})
