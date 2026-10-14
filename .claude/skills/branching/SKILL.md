---
name: branching
description: Decide where new work goes in this repo, and run its PR. Lists the open branches and PRs first, asks the owner before reusing or cutting a branch, and covers chunk size, opening the PR, merging and cleanup. Use before starting new work, cutting a branch, opening or merging a PR into staging or main, or when unsure which branch to commit to. A hook refuses new branches and `gh pr create` until this has run.
---

# branching

PRs are for chunks of work, not single cards. Every PR into `staging` is another CI run, merge, tag and delete, so new work joins an open chunk whenever it fits.

## 1. Look at the open work first
```bash
bash .claude/skills/branching/scripts/open-work.sh
```
It lists working branches with commits past `staging` (and their newest commits) and the open PRs. Throwaway drafts that were never meant to merge don't count as homes for new work.

## 2. Ask before choosing a branch
- **The work fits an open branch** (same theme as its commits or PR): ask the owner with AskUserQuestion whether to use it. Name the branch, its PR if any, and its theme, and recommend one. Offer "new branch" as the other option.
- **Nothing fits:** say so, propose a branch name and the chunk's one-sentence theme, and get the owner's yes.
- **Once the owner agrees:** `bash .claude/skills/branching/scripts/stamp.sh <branch>`. The hook lets that branch be created and its PR opened.
- **Another session may be using an open branch, or this checkout.** If `git status` shows another branch checked out with work in progress, use a worktree (`git worktree add -b <branch> ../roomies-<branch> origin/staging`) rather than switching.

## 3. The chunk rules
- **A chunk is a themed batch**: a group of cards you can describe in one sentence, roughly a day's work. The branch is cut from `staging` and named for the theme (`vercel-deploy`, `workflow-gates`), not for a card.
- **Cards found mid-chunk** (a fix, a follow-up, a process tweak) are their own `Txx` commit on the chunk's branch. They get no new branch or PR.
- **Push freely** as a backup. Pushing a working branch runs no CI; to run it anyway: `gh workflow run CI --ref <branch>`.
- **Own branch only for:** a hotfix for something deployed and broken, or a throwaway experiment (a draft PR, never merged, closed when done).

## 4. Open the PR when the chunk is done
- `pnpm test:all` is green locally, and every card in the chunk is committed.
- **Title it for the whole range** (`git log origin/<base>..<head>`) in plain words about what changed, **never a task ID** (no `T77`, `E2`, `M5`; owner, 2026-10-09). The body lists the range by milestone and card, IDs included.
- CI on a PR into `staging`: `fast` is required, while `full` runs but doesn't block (TESTING §5). Merge when `fast` is green. If `full` is red, fix it first, or merge knowingly and fix it in the next commit. Into `main`, all three must pass.

## 5. Merge and clean up
1. `gh pr merge <n> --squash --subject "<the PR title>"`.
2. Tag the branch tip so the hashes on the Weyve cards still resolve: `git tag archive/<branch> origin/<branch> && git push origin archive/<branch>`.
3. Delete the branch with `git push origin --delete <branch>` and `git branch -D <branch>`, and remove its worktree if it had one. GitHub's auto-delete is off.
