#!/usr/bin/env bash
# Prints what docs-check needs: files in scope, docs coverage, and the owner's guidance.
# Read-only. Usage: context.sh [commit-range]
set -euo pipefail

root=$(git rev-parse --show-toplevel)
cd "$root"
skill=".claude/skills/docs-check/SKILL.md"

echo "== Files in scope"
if [ $# -gt 0 ]; then
  echo "(commit range $1, report-only)"
  git diff --name-status "$1"
elif ! git diff --cached --quiet; then
  echo "(staged)"
  git diff --cached --name-status
else
  echo "(nothing staged: working tree, report-only)"
  git diff --name-status
  git ls-files --others --exclude-standard | sed 's/^/?\t/'
fi

# Covered docs are the "### " headings under "## Per-doc guidance".
covered=$(awk '/^## Per-doc guidance/{on=1; next} on && /^## /{on=0} on && /^### /{sub(/^### /,""); print}' "$skill")

echo
echo "== Docs coverage (docs/, CLAUDE.md and README.md; docs/archive/ is ignored)"
problems=0
while IFS= read -r f; do
  rel=${f#docs/}
  if ! grep -qxF "$rel" <<<"$covered"; then
    echo "UNCOVERED: $f has no section in $skill. Ask the owner to add guidance for it."
    problems=1
  fi
done < <(find docs -type f ! -path 'docs/archive/*' ! -name '.DS_Store' | sort)
for f in CLAUDE.md README.md; do
  if ! grep -qxF "../$f" <<<"$covered"; then
    echo "UNCOVERED: $f has no section (### ../$f) in $skill. Ask the owner to add guidance for it."
    problems=1
  fi
done
while IFS= read -r c; do
  if [ ! -e "docs/$c" ]; then
    echo "MISSING: $skill has a section for docs/$c, which doesn't exist. Ask the owner to update the skill."
    problems=1
  fi
done <<<"$covered"
[ $problems -eq 0 ] && echo "All docs covered."

echo
echo "== Owner guidance (take into account alongside each doc)"
awk '
  /^## Per-doc guidance/ {on=1; next}
  on && /^## / {on=0}
  !on {next}
  /^### / {doc=substr($0,5); inlist=0; next}
  /^Owner guidance:/ {inlist=1; next}
  inlist && /^- / {
    if ($0 ~ /^- \(none yet\)$/) next
    print doc ": " substr($0,3); found=1; next
  }
  inlist && !/^[[:space:]]/ {inlist=0}
  inlist && /^[[:space:]]+[^[:space:]]/ {print "    " $0}
  END { if (!found) print "(none yet)" }
' "$skill"
