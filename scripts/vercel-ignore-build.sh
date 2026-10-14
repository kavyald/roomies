#!/bin/sh
# Vercel's Ignored Build Step (vercel.json `ignoreCommand`, DEPLOYMENT D3): exit 0 skips the build,
# exit 1 builds. Both Vercel projects share vercel.json, so the rule is an env var: roomies-prod
# sets ROOMIES_BUILD_ONLY_BRANCH=main and skips every other branch; roomies-staging leaves it unset
# and builds `staging` and every PR preview.
if [ -n "${ROOMIES_BUILD_ONLY_BRANCH:-}" ] && [ "${VERCEL_GIT_COMMIT_REF:-}" != "$ROOMIES_BUILD_ONLY_BRANCH" ]; then
  echo "Skipping: this project builds only $ROOMIES_BUILD_ONLY_BRANCH."
  exit 0
fi
exit 1
