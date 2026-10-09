#!/usr/bin/env bash
# Records that the owner agreed to this branch (cut it, or open its PR). The hook
# (.claude/hooks/require-branch-check.mjs) checks for the name; the stamp is shared by worktrees.
set -euo pipefail

branch=${1:?usage: stamp.sh <branch>}
stamp="$(git rev-parse --path-format=absolute --git-common-dir)/branch-check.stamp"
grep -qxF "$branch" "$stamp" 2>/dev/null || echo "$branch" >> "$stamp"
echo "branching stamp written for $branch."
