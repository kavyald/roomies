// PreToolUse hook (Bash): Claude may only `git commit` a staged diff that has passed the
// docs-check skill. The skill's stamp.sh records a hash of the staged diff; this compares it.
// Anything that isn't a git commit passes through untouched. Commits from a terminal are not
// affected (this only sees Claude's Bash calls).

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const deny = (reason) => {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: reason,
      },
    }),
  )
  process.exit(0)
}

let input
try {
  input = JSON.parse(readFileSync(0, 'utf8'))
} catch {
  process.exit(0)
}
const command = input?.tool_input?.command
if (typeof command !== 'string') process.exit(0)

// Find `git [global options] commit …` anywhere in the command (after cd, &&, ;, etc.).
const tokens = command.match(/"(?:\\.|[^"\\])*"|'[^']*'|&&|\|\||[;&|()]|[^\s;&|()]+/g) ?? []
const unquote = (t) => t.replace(/^(['"])(.*)\1$/s, '$2')
let commit = -1
let gitDir = null
for (let i = 0; i < tokens.length && commit < 0; i++) {
  if (tokens[i] !== 'git') continue
  let j = i + 1
  let dir = null
  while (j < tokens.length && tokens[j].startsWith('-')) {
    if (tokens[j] === '-C') dir = unquote(tokens[++j] ?? '')
    else if (tokens[j] === '-c') j++
    j++
  }
  if (tokens[j] === 'commit') {
    commit = j
    gitDir = dir
  }
}
if (commit < 0) process.exit(0)

// `-a` / `--all` commit unstaged changes the check never saw. Option scanning stops at the
// first message/file option, so a message containing "-a" isn't mistaken for the flag.
for (let k = commit + 1; k < tokens.length; k++) {
  const t = tokens[k]
  if (/^(&&|\|\||[;&|()])$/.test(t)) break
  if (t === '--all') {
    deny('docs-check: don\'t use `git commit -a/--all`. Stage exactly what you\'ll commit, run the docs-check skill, then `git commit` without -a.')
  }
  if (/^(-m|-F|--message|--file)(=|$)/.test(t)) break
  if (/^-[A-Za-z]+$/.test(t)) {
    const flags = t.slice(1)
    const argAt = flags.search(/[mF]/)
    const before = argAt < 0 ? flags : flags.slice(0, argAt)
    if (before.includes('a')) {
      deny('docs-check: don\'t use `git commit -a`. Stage exactly what you\'ll commit, run the docs-check skill, then `git commit` without -a.')
    }
    if (argAt >= 0) break
  }
}

const cwd = path.resolve(input.cwd ?? process.cwd(), gitDir ?? '.')
let diff
let stampPath
try {
  diff = execFileSync('git', ['diff', '--cached', '--binary', '--no-color', '--no-ext-diff'], {
    cwd,
    maxBuffer: 512 * 1024 * 1024,
  })
  stampPath = path.resolve(
    cwd,
    execFileSync('git', ['rev-parse', '--git-path', 'docs-check.stamp'], { cwd, encoding: 'utf8' }).trim(),
  )
} catch {
  process.exit(0) // not a git repo, or git failed: let the command itself report it
}
if (diff.length === 0) process.exit(0) // nothing staged (message-only amend, --allow-empty)

const hash = createHash('sha256').update(diff).digest('hex')
let stamped = ''
try {
  stamped = readFileSync(stampPath, 'utf8').trim()
} catch {}
if (stamped !== hash) {
  deny(
    'docs-check: the staged diff hasn\'t passed the docs consistency check. Stage exactly what you\'ll commit (separately, before the commit command), run the docs-check skill (/docs-check), resolve or get the owner\'s sign-off on any findings, run its stamp.sh, then commit again.',
  )
}
