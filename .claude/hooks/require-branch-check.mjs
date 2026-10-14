// PreToolUse hook (Bash): Claude may only cut a new branch or open a PR once the branching skill
// has looked at the open work and the owner has agreed (its stamp.sh records the branch name).
// Builder agents in .claude/worktrees/ aren't checked. Anything else passes through untouched,
// and commands from a terminal are not affected (this only sees Claude's Bash calls).

import { execFileSync } from 'node:child_process'
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
const baseCwd = input.cwd ?? process.cwd()
if (baseCwd.includes(`${path.sep}.claude${path.sep}worktrees${path.sep}`)) process.exit(0)

const tokens = command.match(/"(?:\\.|[^"\\])*"|'[^']*'|&&|\|\||[;&|()]|[^\s;&|()]+/g) ?? []
const unquote = (t) => t.replace(/^(['"])(.*)\1$/s, '$2')
const isOp = (t) => t === undefined || /^(&&|\|\||[;&|()])$/.test(t)

// Each new branch or PR the command would create: { branch, dir } (branch null = the current one).
const wanted = []
for (let i = 0; i < tokens.length; i++) {
  if (tokens[i] === 'gh' && tokens[i + 1] === 'pr' && tokens[i + 2] === 'create') {
    let branch = null
    for (let k = i + 3; !isOp(tokens[k]); k++) {
      if (tokens[k] === '--head' || tokens[k] === '-H') branch = unquote(tokens[k + 1] ?? '')
      else if (/^--head=/.test(tokens[k])) branch = unquote(tokens[k].slice(7))
    }
    wanted.push({ branch, dir: null, what: 'open a PR' })
    continue
  }
  if (tokens[i] !== 'git') continue
  let j = i + 1
  let dir = null
  while (j < tokens.length && tokens[j].startsWith('-')) {
    if (tokens[j] === '-C') dir = unquote(tokens[++j] ?? '')
    else if (tokens[j] === '-c') j++
    j++
  }
  const sub = tokens[j]
  const args = []
  for (let k = j + 1; !isOp(tokens[k]); k++) args.push(unquote(tokens[k]))
  let branch
  if (sub === 'switch' || sub === 'checkout') {
    const at = args.findIndex((a) => ['-c', '-C', '--create', '--force-create', '-b', '-B'].includes(a))
    if (at >= 0) branch = args[at + 1]
  } else if (sub === 'worktree' && args[0] === 'add') {
    const at = args.findIndex((a) => a === '-b' || a === '-B')
    if (at >= 0) branch = args[at + 1]
  } else if (sub === 'branch' && args.length > 0 && !args[0].startsWith('-')) {
    branch = args[0]
  }
  if (branch) wanted.push({ branch, dir, what: `cut branch \`${branch}\`` })
}
if (wanted.length === 0) process.exit(0)

for (const w of wanted) {
  const cwd = path.resolve(baseCwd, w.dir ?? '.')
  let branch = w.branch
  let stampPath
  try {
    branch ??= execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd, encoding: 'utf8' }).trim()
    const common = execFileSync('git', ['rev-parse', '--git-common-dir'], { cwd, encoding: 'utf8' }).trim()
    stampPath = path.resolve(cwd, common, 'branch-check.stamp')
  } catch {
    process.exit(0) // not a git repo, or git failed: let the command itself report it
  }
  let approved = []
  try {
    approved = readFileSync(stampPath, 'utf8').split('\n').map((l) => l.trim())
  } catch {}
  if (!approved.includes(branch)) {
    deny(
      `branching: before you ${w.what}, run the branching skill (/branching). It lists the open branches and PRs; if the work fits one, ask the owner whether to use it. Once the owner has agreed, run \`bash .claude/skills/branching/scripts/stamp.sh ${branch}\`, then try again.`,
    )
  }
}
