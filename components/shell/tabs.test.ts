import { describe, expect, it } from 'vitest'
import { addKindFor, houseTabs } from './tabs'

describe('houseTabs (T107)', () => {
  it('is House, Needs, Tasks, Chores, in that order, with House at the house itself', () => {
    const tabs = houseTabs('/h/h1')
    expect(tabs.map((t) => t.label)).toEqual(['House', 'Needs', 'Tasks', 'Chores'])
    expect(tabs.map((t) => t.href)).toEqual(['/h/h1', '/h/h1/needs', '/h/h1/tasks', '/h/h1/chores'])
  })

  it('has a + only on Needs, Tasks and Chores', () => {
    expect(addKindFor('/h/h1', '/h/h1/needs')).toBe('need')
    expect(addKindFor('/h/h1', '/h/h1/tasks')).toBe('task')
    expect(addKindFor('/h/h1', '/h/h1/chores')).toBe('chore')
    expect(addKindFor('/h/h1', '/h/h1')).toBeUndefined()
  })
})
