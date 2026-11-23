import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import { inOrder, stillSaving, whenSaved } from './in-order'

const deferred = <T>() => {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => ((resolve = res), (reject = rej)))
  return { promise, resolve, reject }
}
const tick = () => new Promise((r) => setTimeout(r, 0))

describe('saving taps on the same thing in order', () => {
  it('the second starts only when the first has been answered', async () => {
    const qc = new QueryClient()
    const first = deferred<string>()
    const log: string[] = []
    const a = inOrder(qc, 'sink', () => (log.push('a starts'), first.promise))
    const b = inOrder(qc, 'sink', async () => (log.push('b starts'), 'b'))
    await tick()
    expect(log).toEqual(['a starts'])
    expect(stillSaving(qc, 'sink')).toBe(2)

    first.resolve('a')
    expect(await a).toBe('a')
    expect(await b).toBe('b')
    expect(log).toEqual(['a starts', 'b starts'])
    expect(stillSaving(qc, 'sink')).toBe(0)
  })

  it("different things don't wait for each other", async () => {
    const qc = new QueryClient()
    const slow = deferred<void>()
    void inOrder(qc, 'sink', () => slow.promise)
    expect(await inOrder(qc, 'bins', async () => 'done')).toBe('done')
    slow.resolve()
  })

  it('a save that throws still lets the next one run, and reaches its own caller', async () => {
    const qc = new QueryClient()
    const a = inOrder(qc, 'sink', async () => {
      throw new Error('offline')
    })
    const b = inOrder(qc, 'sink', async () => 'b')
    await expect(a).rejects.toThrow('offline')
    expect(await b).toBe('b')
  })

  it('whenSaved waits for what is queued now, and is immediate when nothing is', async () => {
    const qc = new QueryClient()
    await whenSaved(qc, 'sink')
    const first = deferred<void>()
    void inOrder(qc, 'sink', () => first.promise)
    let saved = false
    void whenSaved(qc, 'sink').then(() => (saved = true))
    await tick()
    expect(saved).toBe(false)
    first.resolve()
    await tick()
    expect(saved).toBe(true)
  })
})
