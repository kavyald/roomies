#!/usr/bin/env bash
# Records that docs-check passed for the currently staged diff. The commit hook
# (.claude/hooks/require-docs-check.mjs) compares this hash before letting Claude commit.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"
if git diff --cached --quiet; then
  echo "Nothing staged; nothing to stamp." >&2
  exit 1
fi
stamp=$(git rev-parse --git-path docs-check.stamp)
git diff --cached --binary --no-color --no-ext-diff | shasum -a 256 | cut -d' ' -f1 > "$stamp"
echo "docs-check stamp written for $(git diff --cached --name-only | wc -l | tr -d ' ') staged files."
