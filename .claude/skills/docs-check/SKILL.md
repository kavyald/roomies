---
name: docs-check
description: Check that staged code changes agree with the docs in docs/ (ARCHITECTURE, PRD, FRONTEND, TESTING, DEPLOYMENT, architecture-guide) and with CLAUDE.md and README.md at the repo root. Run it before every git commit in this repo, after the code changes and tests are done. The commit hook refuses commits whose staged diff hasn't passed it. Also usable report-only on the working tree or a commit range.
---

# docs-check

Make sure a commit leaves code, `docs/`, `CLAUDE.md` and `README.md` in agreement. When they disagree, show the owner what disagrees and a proposed fix. Never quietly edit docs or code to make the check pass.

`docs/archive/` is out of scope. Ignore everything in it.

## Process

1. **Scope.** Stage exactly what you'll commit, then look at `git diff --cached --name-status` and `git diff --cached`. If nothing is staged, check the working-tree diff (or a commit range passed as an argument) in **report-only mode**: say so, and don't stamp at the end.

2. **Context and coverage.** Run:
   ```bash
   bash .claude/skills/docs-check/scripts/context.sh [range]
   ```
   It prints:
   - the files in scope,
   - docs under `docs/` (plus `CLAUDE.md` and `README.md`) that this skill has no section for,
   - sections whose doc no longer exists,
   - every non-empty Owner guidance list.

   If any doc is uncovered or missing, tell the owner first. Name the file, say this skill has no guidance for it, and ask them to have the skill updated. Don't invent guidance for it; carry on with the covered docs.

3. **Match.** From the diff, decide which covered docs it affects (see the per-doc sections below). Skim each affected doc's headings and read only the relevant sections. Don't read whole files when a section will do.

4. **Check.** Compare the diff with the rules, descriptions, tables and examples in those sections. Also take into account every Owner guidance bullet that `context.sh` printed, alongside the doc itself. If a bullet seems to conflict with its doc, say so in the report. Look both ways:
   - the code breaks something the doc requires, or
   - the doc now describes something the code no longer does, or leaves out something new that the doc covers (a new table, port, route, component, decision, command, count or status line).

5. **Classify** each finding:
   - **(a) Doc is stale.** Propose the exact doc edit: section, before text, after text.
   - **(b) Code violates the doc.** Propose the code change, with `file:line`.
   - **(c) Owner decision.** Product decisions, anything marked **[DECIDED] (owner)**, or cases where either side could be right. Show both options.

6. **If there are findings:** report them as a table, then stop and ask with AskUserQuestion. Don't stamp yet.

   | # | Doc § | Code | What disagrees | Type | Proposal |
   |---|---|---|---|---|---|

   The options to offer: apply the doc edits / apply the code fixes / commit anyway / I'll handle it. Apply only what the owner picks. After changes, re-stage and run the check again from step 1.

7. **If there are no findings** (or the owner said to commit anyway), stamp the staged diff and commit:
   ```bash
   bash .claude/skills/docs-check/scripts/stamp.sh
   ```
   Say "docs-check passed for <n> staged files" (or "committed over N open findings, per owner"). Any change to the index after stamping means running the check again; the hook compares hashes.

## Per-doc guidance

Each covered doc has a section below. `context.sh` treats each `### <file>` heading as a covered doc (a path relative to `docs/`, so the root files are `../CLAUDE.md` and `../README.md`), so adding a doc means adding a section. **Owner guidance** is for the owner to fill in over time. Treat each bullet there as an extra check for this doc, alongside what the doc itself says.

### ARCHITECTURE.md
Governs: code structure (layers, ports & adapters, DI), schema and RLS, the activity log, use cases and the function catalog, jobs, realtime, and the frontend route tree.
Notes: deviating from it, or making a new technical decision, needs a new A-row in the §13 decision log in the same commit. Other judgment calls go in the Weyve card's notes (see CLAUDE.md), not in docs.
Owner guidance:
- (none yet)

### PRD.md
Governs: product behavior (needs, chores, tasks, polls, runs, money, calendar, feelings, priority, activity, membership, notifications) and each milestone's exit criteria (§12).
Notes: a code change that contradicts a decided product rule is type (c), never a quiet doc edit. Building anything from §13 "Later" is scope creep; flag it.
Owner guidance:
- (none yet)

### FRONTEND.md
Governs: visual language (color tokens, typography, shape, icons), people and rooms, key screens, delight, voice and copy (§7), motion, and the implementation guidance (§9: the token setup and UI kit component list).
Owner guidance:
- (none yet)

### TESTING.md
Governs: how tests are split, which layer goes where, the commands, test data and isolation, CI, and what each milestone's test task proves.
Owner guidance:
- (none yet)

### DEPLOYMENT.md
Governs: the M5 hosting and launch plan: the decisions (which branch is production, the two Vercel projects, how migrations run, backups), staging vs prod, the GitHub branches and environments, what goes into Supabase, Vercel and GitHub secrets, what still has to be built, and the order of the M5 cards.
Notes: until M5 is built, it's newer than ARCHITECTURE §9 and TESTING §5 and §7 where they disagree; the owner chose to update those docs as each piece is built, so that disagreement alone isn't a finding. Flag a diff that builds a deploy piece without updating both this plan and the doc that piece belongs to, or that contradicts a decision here (type (c)).
Owner guidance:
- (none yet)

### architecture-guide.html
Governs: nothing on its own. It's a hand-written, interactive summary of the build: the layers and modules, the system map and journeys, decisions, stats, the "unfinished" list, recommendations, and a footer naming its sources and commit.
Notes: check it for staleness against both the code and the other docs. Its facts are in the page text and in JS constants (`LAYERS`, `NODES`, `EDGES`, `FLOWS`, `NODE_INFO`, and so on). Small drift in counts can wait for a milestone or Q-task commit; wrong structure or decisions can't.
Owner guidance:
- (none yet)

### ../CLAUDE.md
Governs: how Claude works in this repo. "Current state" (which milestones are done, what runs locally, the repo tree, the surprises list), the Weyve rules (task IDs, milestones, tags, edges, the card-update table), the definition of done, how to build (branches, docs-check, commit and push rules), and the architecture rules summary.
Notes: check it fully, not lightly. Flag a diff that makes any statement in it wrong: a milestone or card finished without updating "Current state", a new top-level folder or `lib/` module missing from the tree, a new gotcha worth a "Surprises" bullet, a changed command, a branch or push rule that the workflow no longer follows, or an RLS addition beyond the base pattern that isn't in the list. Its architecture rules summarize ARCHITECTURE §4.1; if they drift apart, that's a finding on both. Changes to its process rules (Weyve, branches, commits) are type (c).
Owner guidance:
- (none yet)

### ../README.md
Governs: the public face of the repo: the problem, what Roomies does, the prototype link, the Docs table, the stack, the roadmap, how to run and test it, and the repo layout.
Notes: check it fully. Flag a diff that adds, renames or removes a doc without updating the Docs table and the repo layout, changes a setup or test command or a prerequisite (Node, pnpm, Docker), changes the stack, or finishes a milestone without updating the roadmap. The repo is public: flag anything in it that looks like a secret, a real email or a hosted URL that shouldn't be there.
Owner guidance:
- (none yet)
