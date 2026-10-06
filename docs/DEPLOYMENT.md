# Roomies deployment plan (M5)

**Status:** Plan, decided with the owner on 2026-10-05 and 2026-10-06. Nothing here is deployed yet. The tasks are the M5 cards on the Weyve **roomies** board (E1–E6, Q5).  
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
| a working branch | Where tasks are built, one commit per task | Commits |
| `staging` | What runs on staging | Only by merging a PR, with CI green |
| `main` | **Production** | Only by merging a PR from `staging` |

- **Branch protection** on `staging` and `main`: a PR is required, `fast` and `full` must pass, and force pushes and deletion are off. On `main`, an extra CI job fails any PR whose source isn't this repo's `staging` branch (GitHub can't restrict a PR's source branch by itself).
- **GitHub Environments:** `staging` and `production`. `production` is limited to `main`, so prod secrets never reach another branch.
- **Today:** `staging` exists at the same commit as `main` (`052dc1f`). The build is on `v1` and reaches `staging` through a PR.

---

## 4. What goes where

### Supabase (one project per environment)

| | Staging | Prod |
|---|---|---|
| Project | `roomies-staging`, ref `reubjjgndigvthldvzos`, us-east-1 | `roomies-prod`, ref `iqkriekufaebhvptjzhv`, us-east-1 |
| Gmail SMTP | ✅ saved | ✅ saved |
| Migrations | ✅ all 21 pushed (2026-10-05) | Pushed by the deploy workflow on the first merge into `main` |
| Auth settings: sign-ups off, 6-digit code, 10 minutes, the code template from `supabase/templates/code.html` | To do (E1) | To do (E1) |
| `app_server` password | Its own | A different one |
| Site URL / redirect URLs | The staging URL, plus a wildcard for preview URLs | The prod URL |
| Vault: `roomies_app_url`, `roomies_cron_secret` | Staging URL and secret (E3) | Prod URL and secret (E5) |
| Accounts | Test accounts and the smoke house | Roommates, through `/setup` and invites |

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

`roomies-prod` is set to skip building any branch but `main`.

### GitHub secrets

- In the `staging` environment: what the deploy workflow needs to reach roomies-staging, and the smoke suite's credentials.
- In the `production` environment: what the deploy workflow needs to reach roomies-prod, and what the backup workflow needs (the database URL and the public half of the backup key).
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
| The deploy workflow: `supabase db push` on push to `staging` and to `main`, off until E2 turns it on | E2, E5 |
| The CI check that PRs into `main` come from `staging` | E2 |
| `vercel.json` (`regions: ["iad1"]`), plus a way for `roomies-prod` to skip non-`main` builds | E2 |
| Setting the hosted Vault secrets and checking the jobs (`scripts/cron-local.mjs` only works locally) | E3 |
| The smoke suite: `pnpm test:smoke`, `e2e/smoke.spec.ts`, sign-in through the admin API, the smoke house, a read-only mode | Q5 |
| The encrypted weekly backup workflow and a restore script | E5 |
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
1. Bring the build into `staging` with a PR from `v1`.
2. Build the pieces in §6, each with its doc updates (ARCHITECTURE §9 and a new decision for D1–D5, TESTING §5 and §7, CLAUDE.md's branch rules).
3. Turn on branch protection on `staging` and `main` (owner's go-ahead).

### Phase B: the owner's accounts
1. **E1:** on each Supabase project, set the `app_server` password and the auth settings, add a test account, then check that a code reaches a real inbox and an unknown email gets nothing.
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
