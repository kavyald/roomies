// CI's `source` job (DEPLOYMENT §3, D2): a PR into `main` must come from this repo's `staging`
// branch, since GitHub can't restrict a PR's source branch by itself. PRs into any other branch
// pass. Runs with Node's type stripping: node scripts/pr-source.ts (the PR comes from env, below).

export type PullRequest = {
  /** The branch the PR merges into. */
  readonly base: string
  /** The PR's source branch. */
  readonly head: string
  /** `owner/name` of the repo the source branch lives in (a fork's differs). */
  readonly headRepo: string
  /** `owner/name` of this repo. */
  readonly repo: string
}

export const checkPrSource = (pr: PullRequest): { ok: true } | { ok: false; reason: string } => {
  if (pr.base !== 'main') return { ok: true }
  if (pr.headRepo !== pr.repo) {
    return { ok: false, reason: 'PRs into main come from this repo, not a fork.' }
  }
  if (pr.head !== 'staging') {
    return { ok: false, reason: 'PRs into main come from the staging branch.' }
  }
  return { ok: true }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const env = process.env
  const r = checkPrSource({
    base: env.BASE_REF ?? '',
    head: env.HEAD_REF ?? '',
    headRepo: env.HEAD_REPO ?? '',
    repo: env.REPO ?? '',
  })
  if (!r.ok) {
    console.error(r.reason)
    process.exit(1)
  }
  console.log('PR source is fine.')
}
