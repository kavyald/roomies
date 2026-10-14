// The service worker opens only this app's own pages when a notification is tapped
// (DEPLOYMENT §8). Runs public/sw.js in a sandbox with a fake `self`.

import { readFileSync } from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { describe, expect, it } from 'vitest'

const ORIGIN = 'https://roomies.example'
const source = readFileSync(path.join(import.meta.dirname, 'sw.js'), 'utf8')

type Listener = (event: unknown) => void

const tap = async (url: unknown, open: { url: string }[] = []) => {
  const listeners = new Map<string, Listener>()
  const opened: string[] = []
  const navigated: string[] = []
  const windows = open.map((w) => ({
    ...w,
    navigate: async (to: string) => {
      navigated.push(to)
      return null
    },
    focus: async () => undefined,
  }))
  const self = {
    location: { origin: ORIGIN },
    addEventListener: (type: string, fn: Listener) => listeners.set(type, fn),
    clients: {
      matchAll: async () => windows,
      openWindow: async (to: string) => {
        opened.push(to)
        return null
      },
    },
  }
  vm.runInNewContext(source, { self, URL, caches: {} })
  let done: Promise<unknown> = Promise.resolve()
  listeners.get('notificationclick')!({
    notification: { data: { url }, close: () => undefined },
    waitUntil: (p: Promise<unknown>) => {
      done = p
    },
  })
  await done
  return { opened, navigated }
}

describe('service worker: tapping a notification', () => {
  it('opens a path in the app', async () => {
    expect((await tap('/h/1/needs')).opened).toEqual([`${ORIGIN}/h/1/needs`])
  })

  it('opens Home for a URL on another origin', async () => {
    expect((await tap('https://evil.example/phish')).opened).toEqual([`${ORIGIN}/`])
    expect((await tap('//evil.example/phish')).opened).toEqual([`${ORIGIN}/`])
    expect((await tap('javascript:alert(1)')).opened).toEqual([`${ORIGIN}/`])
  })

  it('opens Home when there is no URL', async () => {
    expect((await tap(undefined)).opened).toEqual([`${ORIGIN}/`])
  })

  it('reuses an open window of the app, still only for its own pages', async () => {
    const { opened, navigated } = await tap('https://evil.example/', [{ url: `${ORIGIN}/h/1` }])
    expect(opened).toEqual([])
    expect(navigated).toEqual([`${ORIGIN}/`])
  })
})
