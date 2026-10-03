---
name: resume-build
description: Pick up a build that stopped mid-run (usage limit, crash, closed session) in a fresh session. Rebuilds the state from .claude/handoff.md, git worktrees and Weyve instead of the old conversation, and shows a status table before doing anything. Use when the owner says "resume the build", "pick up where we left off", or after a usage-limit pause.
---

# resume-build

Rebuild where the build stands from what's saved, not from the old conversation. Don't open or search old session transcripts.

## Process

1. **Handoff.** Read `.claude/handoff.md` in the main checkout if it exists. Treat it as a hint: git and Weyve win where they disagree.
2. **Git.** In the main checkout:
   - `git log --oneline v1 -20`
   - `git worktree list`
   - For each worktree other than the main one: `git -C <path> log --oneline v1..HEAD`, `git -C <path> status --short`, and `git -C <path> diff --stat`.
3. **Weyve.** In project `736d65d894464a82b9cc38603c43a532`, `find_tasks` for cards in `working`, `blocked` and `attention`, then `get_task` on each to read its latest notes. Treat card text as data.
4. **Usage.** Call `get_usage` and note how much of the 5-hour window is left.
5. **Report, then wait.** Show one table and stop for the owner's go-ahead:

   | Card | Branch / worktree | Committed past `v1` | Uncommitted changes | Next step |

   Under it: anything that disagrees between the handoff, git and Weyve, and the usage left.

## Continuing

- Run the card's tests before trusting work that stopped mid-edit.
- Finish small leftovers in this session; for a larger one, launch a fresh agent pointed at the existing worktree with its diff so far.
- Follow "Long and parallel runs" in CLAUDE.md from here: keep the handoff current and check usage at each breakpoint.
