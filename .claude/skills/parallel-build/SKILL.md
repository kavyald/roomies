---
name: parallel-build
description: Run several Weyve cards at once with builder agents in their own worktrees, and wind down cleanly before a usage limit. Covers when to fan out, the builder launch prompt, merging, usage checks, the handoff file and the wind-down steps. Use when the owner asks to build several tasks in parallel, "use subagents", "fan out", or run a milestone or chain of cards in one go.
---

# parallel-build

You're the orchestrator: you pick the work, launch builder agents, merge their branches into the build branch (the chunk's branch, chosen with `/branching`; builder branches are internal and never pushed or PR'd), and stop cleanly before a usage limit. Builders build; you own Weyve status, the slow tests, screenshots and merges.

## 1. Plan the fan-out
- `find_tasks` with `ready: true`, then group the cards into dependency chains.
- **At most 4 builders at a time,** one per chain. Never run two builders whose cards edit the same files at once; serialize those.
- Small or tightly coupled cards: build them yourself rather than paying an agent's cold start.
- Reserve a migration filename per card that needs one, so builders don't collide.
- Show the owner the plan (chains, which agent gets what, what runs later) and wait for a go-ahead.

## 2. Launch builders
Use the `builder` agent (`.claude/agents/builder.md`), a template with a slim tool set. Launch with `subagent_type: "builder"`, `isolation: "worktree"`, in the background, and a prompt in this shape:

```
Cards: T45, then T46
Base: <build branch> @ <commit>
Migration: supabase/migrations/<timestamp>_<name>.sql (or "none")
Notes: <anything specific to this run, e.g. files another agent owns>
```

`start_task` each card on Weyve as its builder starts. Worktrees are cut from the repo's default branch (`main`), not the build branch; the builder resets onto `Base` itself (template step 1), so don't message it about that. At merge, confirm the base before anything else: `git merge-base --is-ancestor <base commit> <builder commit>` must succeed, or the branch isn't built on the build branch. Process changes (test commands, branch rules, commit format) go in the template, not in launch prompts. Sessions only pick up agent-file edits after they restart.

## 3. Merge
For each finished builder, in dependency order: rebase its branch on the build branch, run the slow checks the builder skipped (`pnpm test:db`, `pnpm test:e2e`, the untracked `e2e/zz-<card>-shots.spec.ts` for 375pt light and dark screenshots), look at the screenshots, fast-forward the build branch, and `complete_task` with the commit hash. Run the slow suites once per batch of merges where you can, not once per card.

## 4. Handoff file
Keep `.claude/handoff.md` in the main checkout (untracked, listed in `.git/info/exclude`) current for the whole run: the plan, each agent → card → worktree/branch, what's merged, and what's next. Rewrite it at each milestone (a builder reports, a merge lands). Keep it short; it points at git and Weyve, it isn't a log.

## 5. Watch usage
Call `get_usage` (desktop app) after each merge, each builder report, and before each launch. Note how much the 5-hour window rose since the last check. Builders can't check usage, so you do it for them.

**Wind down** when the 5-hour budget left is under about twice the last interval's rise (working alone: at about 85%):
1. Launch nothing new.
2. Message running builders to commit their work in progress (`WIP <card id>` on their branch) or stop and leave the worktree as is.
3. `append_note` on each in-flight card with where it stopped.
4. Update the handoff file, then stop and tell the owner how to pick up (`/resume-build` in a fresh session).

## 6. Keep the context small
- Don't read builders' full transcripts or diffs into your context; read their short reports and `git diff --stat`.
- Read screenshots only for the screens a card changed.
- Prefer `find_tasks` / `get_task` over `get_project_graph`.
- Don't do a large audit or exploration in the same session that then orchestrates: put its results on Weyve and orchestrate from a fresh session.
