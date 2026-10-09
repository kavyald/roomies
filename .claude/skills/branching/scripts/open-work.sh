#!/usr/bin/env bash
# The open work a new chunk might belong to: working branches not yet merged into staging, and
# open PRs. Read-only apart from the fetch.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"
git fetch --quiet --prune origin

echo "== Working branches not merged into staging (newest commits first)"
found=0
for ref in $(git for-each-ref --format='%(refname:short)' refs/remotes/origin refs/heads); do
  name=${ref#origin/}
  case "$name" in origin | HEAD | staging | main) continue ;; esac
  # A local branch that also exists on origin is listed once, as the remote one.
  [ "$ref" = "$name" ] && git show-ref --quiet "refs/remotes/origin/$name" && continue
  ahead=$(git rev-list --count "origin/staging..$ref")
  [ "$ahead" -eq 0 ] && continue
  found=1
  where=$([ "$ref" = "$name" ] && echo "local only" || echo "on origin")
  echo "- $name ($where, ahead of staging by $ahead)"
  git log --format='    %h %s' --max-count=5 "origin/staging..$ref"
done
[ "$found" -eq 1 ] || echo "(none)"

echo
echo "== Open PRs"
gh pr list --state open --json number,title,headRefName,baseRefName,isDraft \
  --template '{{range .}}- #{{.number}} {{.headRefName}} → {{.baseRefName}}{{if .isDraft}} (draft){{end}}: {{.title}}{{"\n"}}{{end}}'
