// The copy lint (FRONTEND §7, T37): nothing people read says "overdue", "failed", or "missed".
// It reads every screen and every domain/app module with the TypeScript parser and checks what
// people see: JSX text, copy-like attributes, template literals, and string literals that are
// prose (they contain a space); bare identifiers like 'failed' in a union type aren't copy.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const ROOTS = ['app', 'components', 'lib/domain', 'lib/app', 'lib/client', 'public/sw.js']
const BANNED = /\b(overdue|failed|missed)\b/i
// Items are deleted, not archived, and nothing promises a restore window (PRD D30, T62).
const ITEM_ROOTS = [
  'components/items',
  'components/runs',
  'components/needs',
  'components/chores',
  'components/tasks',
  'components/home',
  'components/activity',
]
const ITEM_BANNED = /\barchiv(e|es|ed|ing)?\b|30 days/i // "archivedAt" is a field, not copy
const COPY_ATTRS = new Set(['aria-label', 'title', 'placeholder', 'label', 'description', 'alt'])

const files = (p: string): string[] =>
  statSync(p).isDirectory()
    ? readdirSync(p).flatMap((f) => files(join(p, f)))
    : /\.(tsx?|js)$/.test(p) && !/\.(test|contract)\.tsx?$/.test(p)
      ? [p]
      : []

/** Every piece of text in a file that a person could read; `words` adds one-word strings too. */
const copyIn = (path: string, words = false): string[] => {
  const src = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true)
  const found: string[] = []
  const visit = (n: ts.Node) => {
    if (ts.isJsxText(n) && n.text.trim()) found.push(n.text.trim())
    else if (ts.isJsxAttribute(n) && COPY_ATTRS.has(n.name.getText()) && n.initializer) {
      found.push(n.initializer.getText())
    } else if (ts.isTemplateExpression(n) || ts.isNoSubstitutionTemplateLiteral(n)) {
      found.push(n.getText())
    } else if (
      ts.isStringLiteral(n) &&
      (words || /\s/.test(n.text)) &&
      !ts.isImportDeclaration(n.parent)
    ) {
      found.push(n.text)
    }
    ts.forEachChild(n, visit)
  }
  visit(src)
  return found
}

describe('copy', () => {
  const all = ROOTS.flatMap(files)

  it('reads the whole app (a sanity check that the lint sees real copy)', () => {
    expect(all.length).toBeGreaterThan(100)
    expect(all.flatMap((f) => copyIn(f))).toContain(
      'Nothing needs attention right now. Enjoy the quiet.',
    )
  })

  it('never says "overdue", "failed", or "missed"', () => {
    const offending = all.flatMap((f) =>
      copyIn(f)
        .filter((text) => BANNED.test(text))
        .map((text) => `${f}: ${text}`),
    )
    expect(offending).toEqual([])
  })

  it('never calls deleting an item "archive" or promises 30 days', () => {
    const offending = ITEM_ROOTS.flatMap(files).flatMap((f) =>
      copyIn(f, true)
        .filter((text) => ITEM_BANNED.test(text))
        .map((text) => `${f}: ${text}`),
    )
    expect(offending).toEqual([])
  })
})
