// Every text/background pair the kit uses must pass WCAG AA (4.5:1) in light and dark
// (FRONTEND §3.1). Reads the real tokens from app/globals.css.

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(path.join(process.cwd(), 'app/globals.css'), 'utf8')

const tokensIn = (selector: string): Record<string, string> => {
  const start = css.indexOf(selector)
  if (start < 0) throw new Error(`No ${selector} block in globals.css`)
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start))
  return Object.fromEntries(
    [...body.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1]!, m[2]!]),
  )
}

const light = tokensIn(":root,\n[data-theme='light']")
const dark = tokensIn("[data-theme='dark'] {")
const systemDark = tokensIn(":root:not([data-theme='light'])")

const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}

// [text token, background token]
const PAIRS = [
  ['ink', 'paper'],
  ['ink', 'card'],
  ['ink-soft', 'paper'],
  ['ink-soft', 'card'],
  ['neutral-ink', 'neutral-fill'],
  ['on-accent', 'accent'],
  ['accent-ink', 'paper'],
  ['accent-ink', 'card'],
  ['top-ink', 'top-fill'],
  ['air-ink', 'air-fill'],
  ['fire-ink', 'fire-fill'],
  ['water-ink', 'water-fill'],
  ['earth-ink', 'earth-fill'],
  ['paper', 'ink'], // toasts
] as const

describe.each([
  ['light', light],
  ['dark', dark],
])('contrast (%s)', (_name, tokens) => {
  it.each(PAIRS)('%s on %s is at least 4.5:1', (fg, bg) => {
    expect(tokens[fg], fg).toBeDefined()
    expect(tokens[bg], bg).toBeDefined()
    expect(contrast(tokens[fg]!, tokens[bg]!)).toBeGreaterThanOrEqual(4.5)
  })
})

it('the system dark theme and the forced dark theme are identical', () => {
  expect(systemDark).toEqual(dark)
})
