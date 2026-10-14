import { describe, expect, it } from 'vitest'
import { houseTabs } from './tabs'

describe('houseTabs (T67)', () => {
  it('is Home, Needs, Tasks, Chores, Admin, in that order', () => {
    const tabs = houseTabs('/h/h1')
    expect(tabs.map((t) => t.label)).toEqual(['Home', 'Needs', 'Tasks', 'Chores', 'Admin'])
    expect(tabs.map((t) => t.href)).toEqual([
      '/h/h1',
      '/h/h1/needs',
      '/h/h1/tasks',
      '/h/h1/chores',
      '/h/h1/admin',
    ])
  })
})
