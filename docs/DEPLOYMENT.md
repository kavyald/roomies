# Roomies deployment plan (M5)

**Status:** Plan, decided with the owner on 2026-10-05, 2026-10-06 and 2026-10-08 (§8, security). Nothing here is deployed yet. The tasks are the M5 cards on the Weyve **roomies** board (E1–E6, Q5).  
**Companions:** [ARCHITECTURE.md](./ARCHITECTURE.md) §9 (environments, CI/CD, ops) and A18, A19, A28 · [TESTING.md](./TESTING.md) §5 (CI) and §7 (iPhone checklist)

Where this plan differs from those docs (branches, the second Vercel project, the migration flow), this plan is newer. The docs get updated when the work it describes is built.

---

## 1. Decisions

| # | Question | Decision | Why |
|---|---|---|---|
| D1 | Which branch is production? | **`main` is production.** A new **`staging`** branch is the staging environment. | One branch per environment, so "what's live" is always a branch you can read |
| D2 | How does code reach them? | A working branch → PR → `staging` → PR → `main`. Both long-lived branches change only through PRs with CI green. Merging the `staging` → `main` PR is the owner's release approval. | Every prod change has run on staging first, and the approval is a normal GitHub merge |
| D3 | How many Vercel projects? | **Two**, both in `iad1` (next to Supabase us-east-1): `roomies-staging` (builds `staging` and PR previews) and `roomies-prod` (builds only `main`). | Separate env var lists (prod secrets never sit beside staging values), Instant Rollback on staging, and a clean stable staging URL. A single project with preview protection turned off was the alternative and would also have worked. |
| D4 | Who can open each site? | PR previews keep Vercel's login (only the owner). The staging site is `roomies-staging`'s production deploy, so it isn't behind Vercel's login; prod isn't either. Both rely on the app's own sign-in. | Phones (the installed app keeps its own cookies), pg_cron and the smoke suite must reach staging directly |
| D5 | How do migrations run? | A workflow runs `supabase db push` on every push to `staging` (→ roomies-staging) and to `main` (→ roomies-prod). Vercel builds at the same time, so **a migration must work with the code already running**: add first, remove in a later release. | No custom deploy orchestration, and the order of migration and build can't break anything |
| D6 | Error reporting | Sentry (code already in, A28) ships in the **first** Vercel build. One Sentry project, split by environment (`staging` / `production`), release = commit SHA. | Errors from day one, including the first deploy |
| D7 | Sign-in email | A dedicated house Gmail as custom SMTP on both Supabase projects (A18) | Supabase's built-in sender won't reach roommates |
| D8 | Backups | A weekly `pg_dump` of prod from GitHub Actions, **encrypted before it's stored**. Restore once into staging at launch to prove it works, then wipe it. | The repo is public: any signed-in GitHub user can read workflow logs and download artifacts |
| D9 | Who can write to the database? | **Only the server.** It switches to a new `app_writer` role (a member of `authenticated`, so every RLS policy still applies). The browser's `authenticated` role keeps SELECT (reads, Realtime) and loses every write grant. See §8. | The anon key and every policy are public, so any signed-in roommate could otherwise write through the REST API directly, skipping the app's checks and the activity log |

---

## 2. Staging vs prod

| | **Staging** | **Prod** |
|---|---|---|
| Purpose | Try each change on real hosting before anyone uses it | The app the house uses |
| Data | Throwaway: test accounts and a smoke-test house | Real roommates, real items. Never used for testing |
| Updates when | A PR is merged into `staging` | A PR from `staging` is merged into `main` |
| Sentry environment | `staging` | `production` |
| If it breaks | Annoying | The house can't sign in |

They share the code and nothing else: each has its own database, accounts, secrets, push keys and URL. An account or house on staging doesn't exist on prod, and the reverse.

---

## 3. GitHub

```
working branch ──PR──► staging ──► Vercel roomies-staging ──► Supabase roomies-staging
   └─ every PR gets a preview deploy (behind Vercel's login, uses the staging database)

staging ──PR──► main ──► Vercel roomies-prod ──► Supabase roomies-prod
```

| Branch | What it is | How it changes |
|---|---|---|
| a working branch | Where tasks are built, one commit per task; short-lived, cut from `staging` | Commits; deleted once its PR is squash-merged into `staging` (tip tagged `archive/<branch>` first) |
| `staging` | What runs on staging | Only by merging a PR, with CI green |
| `main` | **Production** | Only by merging a PR from `staging` |

- **Branch protection** on `staging` and `main`: a PR is required, `fast` and `full` must pass, and force pushes and deletion are off. On `main`, an extra CI job fails any PR whose source isn't this repo's `staging` branch (GitHub can't restrict a PR's source branch by itself).
- **Naming:** a PR into `staging` or `main` is titled for everything it brings since the branch last moved (the whole `git log origin/<base>..<head>` range, e.g. `v1 build: M0–M4, M6 and M5 Phase A`), never for its newest commit. Its body lists that range by milestone and card. The title becomes the squash commit's subject, so it is passed explicitly when merging.
- **GitHub Environments:** `staging` and `production`. `production` is limited to `main`, so prod secrets never reach another branch.
- **After a merge:** once a working branch's PR is squash-merged into `staging`, its tip is tagged `archive/<branch>` (so the hashes on the Weyve cards still resolve), and the branch is deleted locally and on GitHub. The next batch of work starts from a fresh branch off `staging`.
- **Today:** `staging` has the build (`6e6c4a2`, PR #2); `main` is still at `052dc1f`. `v1` was deleted after that merge, and its history is the `archive/v1` tag.

---

## 4. What goes where

### Supabase (one project per environment)

| | Staging | Prod |
|---|---|---|
| Project | `roomies-staging`, ref `reubjjgndigvthldvzos`, us-east-1 | `roomies-prod`, ref `iqkriekufaebhvptjzhv`, us-east-1 |
| Gmail SMTP | ✅ saved | ✅ saved |
| Migrations | ✅ all 25 pushed (the T73 four on 2026-10-08) | Pushed by the deploy workflow on the first merge into `main` |
| Auth settings: sign-ups off, 6-digit code, 10 minutes, the code template from `supabase/templates/code.html` | To do (E1) | To do (E1) |
| `app_server` password | Its own: at least 32 random characters | A different one, same length |
| `app_writer` role | Created by a migration; no password, never logs in | The same |
| Enforce SSL (Database settings) | On (E1) | On (E1) |
| Network restrictions | Off for now (decided 2026-10-08, E1). Vercel functions and GitHub Actions connect from IPs that change, and a fixed IP needs Vercel's paid Secure Compute, so an allow-list would break deploys. The database is protected by Enforce SSL, the per-project `app_server` password (Vercel only), the grants and RLS, and MFA on every account. Revisit if the app moves to a plan with fixed outgoing IPs. | The same |
| Site URL / redirect URLs | The staging URL, plus a wildcard for preview URLs | The prod URL |
| Vault: `roomies_app_url`, `roomies_cron_secret` | Staging URL and secret (E3) | Prod URL and secret (E5) |
| Accounts | Test accounts and the smoke house | Roommates only, through `/setup` and invites. No test account. |

`supabase/seed.sql` is local only and never runs on a hosted project. Auth settings are set by hand in the dashboard, not with `supabase config push`, because `config.toml` has localhost URLs and no SMTP block and could overwrite the Gmail settings.

### Vercel (two projects, both in `iad1`)

| Variable | Staging and prod |
|---|---|
| `DATABASE_URL` (the transaction pooler, user `app_server.<ref>`) | Different |
| `SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Different |
| `SETUP_TOKEN`, `CRON_SECRET` | Different; generate fresh ones (`openssl rand -hex 24`) |
| `VAPID_PRIVATE_KEY`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_SUBJECT` | A separate key pair for each |
| `NEXT_PUBLIC_SENTRY_ENVIRONMENT` | `staging` / `production` |
| `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` | The same in both |

`roomies-prod` skips building any branch but `main`: it sets `ROOMIES_BUILD_ONLY_BRANCH=main`, which `vercel.json`'s Ignored Build Step (`scripts/vercel-ignore-build.sh`) reads.

### GitHub secrets

- In the `staging` environment: `SUPABASE_DB_URL` for the deploy workflow (roomies-staging's `postgres` user, session pooler, percent-encoded), and the smoke suite's `SMOKE_SUPABASE_URL`, `SMOKE_SERVICE_ROLE_KEY` and `SMOKE_EMAIL`.
- In the `production` environment: `SUPABASE_DB_URL` for the deploy workflow (roomies-prod), and for the backup workflow `PROD_DB_URL` and `BACKUP_CERT` (the public half of the backup key, an OpenSSL certificate; `scripts/backup.sh` shows how to make the pair).
- Repository variables `DEPLOY_ENABLED` and `BACKUP_ENABLED` turn the two workflows on (E2, E5).
- The private half of the backup key stays with the owner, never on GitHub.

### Sentry

One project, split by environment. Reports are scrubbed before sending (ARCHITECTURE §5.3): no user, bodies, cookies, headers, query strings, emails, or setup and invite tokens.

---

## 5. Scheduled jobs and smoke tests

**pg_cron** is the scheduler inside each Supabase database. The migrations already create four jobs, each calling the app's `/api/cron/<job>` with the shared secret from Vault:

| Job | How often | What it does |
|---|---|---|
| `send-notifications` | every 5 min | Sends queued pushes that didn't go out right after the action |
| `reminders` | every 15 min | Reminders for things coming up |
| `close-polls` | hourly, at :05 | Closes polls past their deadline |
| `tick` | every 15 min | Does nothing; proves the schedule reaches the app |

Until a project's Vault has the app URL and secret, its jobs run but send nothing.

**The smoke suite** (Q5) is a short Playwright journey run against a deployed site after each deploy: sign in to a dedicated smoke house, add a need, see it on Needs, finish it, check Activity. It gets the sign-in code from Supabase's admin API (there's no Mailpit on staging). Against prod it runs read-only. The full e2e suite can't run against a deployed site: `e2e/support.ts` mints tokens with the local secret, writes to the local database, reads codes from Mailpit and uses `@roomies.test` addresses.

---

## 6. What still has to be built

All of the app is built. These deploy pieces aren't, and none of them needs an account to write:

| Piece | For |
|---|---|
| ✅ Built (T72): the deploy workflow (`.github/workflows/deploy.yml`): `supabase db push` on push to `staging` and to `main`, off until E2 sets the repository variable `DEPLOY_ENABLED` to `true` | E2, E5 |
| ✅ Built (T72): the CI check that PRs into `main` come from `staging` (the `source` job in `ci.yml`) | E2 |
| ✅ Built (T72): `vercel.json` (`regions: ["iad1"]`), plus an Ignored Build Step: `roomies-prod` sets `ROOMIES_BUILD_ONLY_BRANCH=main` and skips every other branch | E2 |
| ✅ Built (T72): `pnpm cron:vault set` stores the hosted Vault secrets, `pnpm cron:vault check` shows the jobs' last runs and responses (`scripts/cron-vault.mjs`) | E3 |
| ✅ Built (T72): the smoke suite: `pnpm test:smoke`, `e2e/smoke.spec.ts`, sign-in through the admin API, the smoke house, a read-only mode (TESTING §5) | Q5 |
| ✅ Built (T72): the encrypted weekly backup workflow (`backup.yml`, off until `BACKUP_ENABLED`) and `scripts/restore.sh` (ARCHITECTURE §9) | E5 |
| A deliberate error for the Sentry check, on a throwaway preview branch so it never reaches `staging` | E2 |

**To check on the first deploy** (none of this shows up locally):

1. **Database TLS:** `pg` 8.23 treats `sslmode=require` as full certificate checking, and Supabase's pooler certificate may need its CA or `uselibpqcompat=true`.
2. **`app_server` through the transaction pooler** (port 6543, user `app_server.<ref>`): `set local role` should work, since it lasts only for the transaction.
3. **New Supabase API keys:** new projects come with publishable and secret keys; they should work where the code expects the anon and service-role keys.
4. **Staging may pause:** free Supabase projects pause after about a week without use. Unpause from the dashboard.

---

## 7. The plan

**Order:** build the pieces in §6 → E1 → E6 → E2 → E3 → Q5 → E4 → E5

### Phase A: code and repo, no accounts needed
The code changes come first, all on `v1`. The PR into `staging` opens only once they're done, and Phase A ends when it's squash-merged.

1. Build the pieces in §6 on `v1`, each with its doc updates (ARCHITECTURE §9 and a new decision for D1–D5, TESTING §5 and §7, CLAUDE.md's branch rules).
2. The server-only writes (D9), the `private` schema for the policy helpers and the smaller fixes in §8 (`member_role`, the outbox policy, same-origin notification URLs), also on `v1`; built in T73 (ARCHITECTURE A30). Before launch, steps 1 and 2 may ship together: prod runs no code yet, and on staging the worst case is a minute of refused writes on throwaway data. After launch, step 2 removes grants the old code needs, so it would ship a release after step 1 (D5).
3. Turn on GitHub secret scanning and push protection, and run a gitleaks scan over the full history. Rotate anything it finds (§8).
4. Open the PR from `v1` into `staging` and get CI (`fast` and `full`) green.
5. Turn on branch protection on `staging` and `main` (owner's go-ahead), so the PR merges under the rules in §3.
6. **Squash and merge** the PR into `staging`. That's the end of Phase A. `staging` gets the build as one commit; the per-task history stays on `v1`, which is where the commit hashes on the Weyve cards point. Once merged, `v1` was tagged `archive/v1` and deleted (§3).

### Phase B: the owner's accounts
1. **E1:** turn on MFA for GitHub, Supabase, Vercel, Sentry and the house Gmail. On each Supabase project, set the `app_server` password (at least 32 random characters, unique per project), the auth settings and Enforce SSL, and decide on network restrictions (§4). Add a test account on **staging only**, check that a code reaches a real inbox there, and check on both projects that an unknown email gets nothing.
2. **E6:** a Sentry account and project.
3. A Vercel account, connected to GitHub.
4. The GitHub Environments `staging` and `production` with their secrets.

### Phase C: staging live
1. **E2:** set up `roomies-staging`. Done when merging into `staging` migrates and deploys it, a deliberate error reaches Sentry with the right environment and release and no personal data, and a PR gets a preview deploy.
2. **E3:** the staging Vault secrets. `tick` runs every 15 minutes, and a reminder arrives.
3. **Q5:** the smoke suite runs after each staging deploy and fails the check when the journey breaks.
4. **E4:** the iPhone checks (TESTING §7) on the **staging URL**, not a preview (previews sit behind Vercel's login, and push subscriptions are tied to one site): install, a real code, push, VoiceOver, dark mode, and the smoke suite.

### Phase D: launch (E5)
1. Set up `roomies-prod`.
2. Merge a `staging` → `main` PR, which migrates prod and deploys it.
3. The prod Vault secrets.
4. The smoke suite against prod, read-only.
5. The weekly encrypted backup; restore it into staging once, then wipe that copy.
6. An uptime ping.
7. The owner opens the prod `/setup` link on their phone, then invites the roommates.

**M5 is done when** everyone is on prod from their phones, the smoke suite passes against prod, and the house uses it for real (PRD §12).

---

## 8. Security

The repo is public, so anyone can read the schema, every RLS policy and the role names. The anon key and the project URL ship to every browser. Security can't depend on any of that staying hidden: it rests on the secrets (below), the grants and RLS, and the accounts.

**Who can do what in the database**

| Role | Who gets it | Can |
|---|---|---|
| `anon` | Anyone with the anon key (public) | Nothing: every table is revoked, including future ones |
| `authenticated` | A signed-in roommate's token, through the REST API | Read their own house (RLS) and listen on Realtime. No writes (D9). |
| `app_writer` | Only `app_server`, per transaction, with the user's JWT claims | Insert and update under the same RLS policies. Never granted to `authenticator`. |
| `service_role` | Jobs, and the service-role key | Everything; bypasses RLS |

**Rules**

- **New tables:** grant writes to `app_writer`, never to `authenticated`. The grant-guard test fails otherwise. Publishing a table to Realtime is a deliberate decision; the guard expects only `activity_events`.
- **Secrets:** the `app_server` password bypasses RLS (it can switch to `service_role`), so treat it like the service-role key: Vercel only, never in chat, screenshots or logs. A secret that was ever committed or shown is **rotated**; removing it from git history doesn't help, since clones and forks keep it.
- **Security fixes:** fix through a new migration (drop and recreate the policy); never edit an applied migration. A fix is public as soon as it's pushed, so take it straight through `staging` to `main`, and keep the commit message plain.
- **CI on a public repo:** no `pull_request_target`, and no secrets in workflows a fork's PR can trigger. Never print connection strings, query results or data in workflow logs, and never upload a dump that isn't encrypted (D8).

**Accepted, not fixed**

- Injected script or a stolen session can still call the app's server actions. Server-only writes limit that to real actions, validated and recorded in Activity under that person's name. The page CSP (`proxy.ts`) is the defense against XSS.
