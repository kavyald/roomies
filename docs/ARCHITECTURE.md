# Roomies — Architecture & System Design

**Status:** v1 scope (2026-09-28): one items table, polls, runs, costs. Items point at their current run, and the activity table is the history. DI structure unchanged. Resynced with the build on `v1` after M4 (2026-10-02, T46): ports, schema, function catalog, jobs, Realtime and the file tree describe what shipped.
**Companions:** [PRD.md](./PRD.md) · [FRONTEND.md](./FRONTEND.md) (visual design, UI, copy)

> Same convention as the PRD: **[DECIDED]**, with *(owner)* marking the ones you answered directly. The design targets **one house, 2–8 users, built by one person, on free tiers**. The priorities are low cost, low ops, fast iteration, and making sure only house members can read house data.

---

## 1. Constraints that drive the design

| Constraint | Implication |
|---|---|
| Roommates open a **link on iPhone**, no App Store | Web app, installable as a **PWA** |
| **Always on**, hosted in the cloud | Managed hosting with no server to babysit. Free/cheap tiers are fine at this scale. |
| **Only house members** can see house data | Per-user authentication + authorization enforced at the **database layer** (row-level security), not only in UI code |
| Tiny data volume (thousands of rows per house, ever) | No caching layers, queues, or microservices. Postgres handles everything. |
| Collaborative (several people editing the same lists) | Realtime updates are nice to have. Last-write-wins is acceptable for conflicts. |
| Reminders, chore rhythms, poll deadlines, dated runs | Need **scheduled jobs** (cron) |
| Notifications on iPhone | **Web Push** (iOS 16.4+, only when installed to the Home Screen). An email fallback comes later. |
| Solo developer | Minimize the number of vendors and moving parts. One language (TypeScript) end to end. |

---

## 2. Client platform

**[DECIDED] A1: How is the app delivered?**

| Option | Pros | Cons |
|---|---|---|
| **PWA (web app)** ⭐ | Just a link, matching the PRD's usage requirement. One codebase, instant deploys, no App Store review. Installable to the Home Screen. Web Push works on iOS 16.4+. | iOS push works *only* after "Add to Home Screen." Some iOS PWA quirks (storage eviction, no background sync). Feels slightly less native. |
| **React Native / Expo** | Native feel, reliable push, TestFlight distribution | Roommates must install via TestFlight or the App Store ($99/yr Apple dev account, review). Contradicts "link on their phone." |
| **Native SwiftUI** | Best iPhone UX | iOS-only, the same install friction as React Native, and a separate backend language/SDK |

**[DECIDED] PWA.** It matches "a link that roommates can access on their phone." If push reliability becomes a real problem, Expo can later reuse the same backend and most TypeScript logic.

Onboarding must actively guide iOS users through **Share → Add to Home Screen**, since that's the only way push works on iOS. We detect standalone mode with `navigator.standalone` / `display-mode: standalone` and show an instruction sheet until the app is installed.

---

## 3. Stack

### 3.1 Options

| Layer | Option A ⭐ (recommended) | Option B | Option C |
|---|---|---|---|
| Frontend framework | **Next.js (App Router) + React + TypeScript** | SvelteKit | Vite + React SPA |
| Backend / DB / Auth | **Supabase** (Postgres, Auth, RLS, Realtime, Storage, Edge Functions, pg_cron) | Firebase (Firestore, Auth, FCM) | Custom Node API (Hono/Fastify) + Postgres on Fly.io / Render / Neon |
| Hosting | **Vercel** (frontend + server actions + cron) | Cloudflare Pages/Workers | Fly.io |
| Styling | **Tailwind CSS** + a small set of custom iOS-style components | — | — |

### 3.2 Why Option A

- **Supabase** gives relational Postgres (a natural fit for houses, members, items, polls, and runs), **row-level security** for the "only members can access" requirement, built-in auth (email codes, passkeys later), file storage with the same RLS, realtime subscriptions, and cron, all from one vendor with a generous free tier.
- **Firebase** would work too, but Firestore security rules are harder to reason about for relational data (membership joins, votes, ownership shares), and the data model fights the document store.
- **A custom API** gives the most control but means writing and securing auth, authz, and file uploads yourself. That's too much ops for this scale.
- **Next.js on Vercel**: first-class hosting, server actions and a route handler for the things that need secrets (invites, push sending, cron), and preview deploys per PR.

**[DECIDED] A2: Option A (Next.js + Supabase + Vercel).** You said you have no preference. Here's how the realistic alternatives compare:

| Stack | Best if you want... | Trade-off vs. the pick |
|---|---|---|
| ⭐ **Next.js + Supabase + Vercel** | The most tutorials, examples, and Supabase starter templates. Useful to know professionally. | Next.js App Router has a learning curve (server vs. client components). We'd keep most screens as client components to keep it simple. |
| **Vite React SPA + Supabase (+ Edge Functions), hosted on Vercel/Netlify/Cloudflare Pages** | The simplest mental model: all client-side, no server rendering | Server bits (push, invites) move to Supabase Edge Functions, which are Deno, so a second runtime to learn. Slightly more PWA setup by hand. |
| **SvelteKit + Supabase** | Less boilerplate, very fast UI, pleasant to write | Smaller ecosystem of UI components and examples |
| **Expo (React Native) + Supabase** | A truly native iPhone feel and reliable push | Breaks the "just a link" requirement (needs TestFlight/App Store) |
| **Firebase (any frontend)** | Google tooling, very mature push via FCM | Document database fits our relational data (members, votes, ownership shares) poorly, and security rules are harder to test |

If you'd rather go minimal, the Vite SPA option is the runner-up. Everything else in this doc (schema, RLS, cron, push) applies unchanged to it.

### 3.3 Supporting libraries

| Concern | Choice |
|---|---|
| Data fetching / cache | TanStack Query (with the Supabase JS client, `@supabase/ssr` for the session cookie) |
| Forms + validation | Plain React state in the forms, **Zod** schemas (`lib/schemas/`) validating every server action's input |
| DB access (server) | **Kysely** (typed SQL builder) over `pg`, used only inside adapters, with one transaction per use case |
| DB types | Hand-written Kysely table types in `lib/adapters/postgres/schema.ts` (T08), used **only in adapters** (never in domain or UI code). No generated types. |
| Dates / recurrence | No library: `lib/domain/time.ts` does dates, times and time zones with the built-in `Intl` API. Chores repeat every N days (`repeat_days`), so there are no recurrence rules. |
| PWA | Hand-written service worker (`public/sw.js`: app shell cache + push), `app/manifest.ts` |
| Bottom sheets | `vaul` (inside `components/ui/Sheet.tsx`) |
| Push | `web-push` (VAPID) inside the `PushSender` adapter, called by the send-notifications job |
| Email | A dedicated house Gmail account as Supabase's custom SMTP (`smtp.gmail.com`, app password) for sign-in codes. Required, since Supabase's built-in sender won't reach roommates. Needs no domain. Resend + a custom domain is the upgrade path (A18). Reminder emails come later. |
| Icons | Lucide |
| Testing | Vitest (unit, use case, component, contract, and RLS/constraint tests), Playwright with the iPhone 15 device profile (e2e) and axe. One command, `pnpm test:all`. See [TESTING.md](./TESTING.md). |
| Errors / monitoring | Sentry (free tier), added with hosting in M5 (E2). Not installed yet. |

---

## 4. System overview

```
 iPhone (Safari / installed PWA)
 ┌──────────────────────────────────────────┐
 │ Next.js React app + Service Worker       │
 │  - Supabase JS client (auth session)     │
 │  - TanStack Query cache                  │
 │  - Realtime subscription (activity rows) │
 └───────────┬───────────────────┬──────────┘
             │ HTTPS             │ WebSocket (Realtime)
             ▼                   ▼
 ┌────────────────────┐   ┌──────────────────────────────────────┐
 │ Vercel             │   │ Supabase                             │
 │ - SSR / static     │   │  Auth (email code, passkeys later)   │
 │ - Server actions → │──▶│  Postgres + RLS                      │
 │   use cases (§4.1) │   │   - tables, RLS, constraints         │
 │   • invite / setup │   │   - (no business logic; see §4.1)    │
 │   • push send      │   │  Realtime (activity_events inserts)  │
 │ - /api/cron/[job] ◀┼───│  pg_cron + pg_net (calls /api/cron)  │
 └────────┬───────────┘   └──────────────────────────────────────┘
          ▼
   Web Push services (Apple / Google / Mozilla)    Gmail (sign-in codes, via Supabase SMTP)
```

**Data access pattern [DECIDED] (revised in v1.0; see §4.1):**
- **All writes** go through server-side **use cases**, called from Next.js server actions (`app/actions/`) and the cron route handler. The browser never writes to tables directly.
- **Reads** go through a `HouseQueries` port. The browser adapter uses the Supabase client with the user's JWT (RLS still guarantees isolation), and Realtime invalidates the cache.
- **The database enforces integrity only:** RLS, foreign keys, CHECKs, unique and partial indexes, and an `updated_at` trigger. It holds **no business logic**, meaning no logic RPCs and no triggers that write activity or notifications.

### 4.1 Application architecture: ports & adapters with dependency injection

**[DECIDED] A10.** The code is split into four layers. Dependencies point **inward only**:

```
 ┌─────────────────────────────────────────────────────────────────────┐
 │ Entry points (thin)                                                 │
 │  server actions · route handlers · cron handlers · React hooks      │
 │  parse input (Zod) → build deps → call a use case → map the result   │
 └───────────────┬─────────────────────────────────────────────────────┘
                 ▼
 ┌─────────────────────────────────────────────────────────────────────┐
 │ Application (use cases)       lib/app/                              │
 │  makeFinishRun(deps) → (actor, input) → Promise<Result<Out, Err>>    │
 │  load via repos → call domain → save via repos → publish events      │
 │  depends only on PORTS (interfaces) + domain                         │
 └───────────────┬─────────────────────────────────────────────────────┘
                 ▼
 ┌─────────────────────────────────────────────────────────────────────┐
 │ Domain (pure)                 lib/domain/                           │
 │  standalone types (§6.3) + pure functions (§7.2)                     │
 │  no I/O, no Date.now(), no random ids, no imports outside domain/    │
 └─────────────────────────────────────────────────────────────────────┘
        ▲ implements
 ┌──────┴──────────────────────────────────────────────────────────────┐
 │ Adapters                      lib/adapters/                         │
 │  postgres (Kysely) · supabase (queries, change feed, auth) ·         │
 │  web-push · clock · ids · tokens · in-memory fakes                   │
 └─────────────────────────────────────────────────────────────────────┘
```

**Rules**
1. **Domain** imports nothing outside `lib/domain/`. Time, ids, and settings are passed in as arguments. Functions return values (including `Result<T, E>` for expected failures) and never throw for business rules.
2. **Use cases** receive every dependency through a `deps` argument (**constructor/factory injection, no service locator, no DI container**). A use case never reads `process.env`, never imports an adapter, and never calls `new Date()`.
3. **Adapters** are the only code that knows about Supabase, Postgres rows, Kysely, or `web-push`. The Kysely table types (`lib/adapters/postgres/schema.ts`) stay here. Adapters map rows ↔ domain types with explicit mapper functions (`lib/adapters/postgres/mappers.ts`).
4. **Entry points** are thin. They validate input with Zod, build deps via the composition root, call one use case, and map `Result` to an action response (`makeAction` in `lib/server/action.ts`). No business logic.
5. **Every port has an in-memory fake** in `lib/adapters/memory/` (the push fake lives in `lib/adapters/push/fake.ts`), used by unit and component tests. The same contract test suite (`lib/adapters/contracts/`) runs against the fake and the Postgres/Supabase adapter.

**Ports** (interfaces in `lib/app/ports.ts`)

| Port | Methods (abridged) | Production adapter | Test adapter |
|---|---|---|---|
| `UnitOfWork` | `run<T>(actor, fn: (repos: Repos) => Promise<T>): Promise<T>`, one transaction per call. It rolls back when `fn` throws **or resolves to a failed `Result`** (A21). A broken CHECK/unique rule throws `ConstraintViolation`, a broken RLS rule `AccessDenied`. | Postgres (`PostgresUnitOfWork`): `begin` → a member or user gets `set local role authenticated` + `set_config('request.jwt.claims', …)` so **RLS still applies**; the system actor gets `set local role service_role` → `commit` | `MemoryUnitOfWork` (`lib/adapters/memory/db.ts`, which mirrors each RLS rule) |
| `Repos` (inside a UoW) | `houses`, `profiles`, `members`, `rooms`, `contacts`, `invites`, `items`, `feelings`, `runs`, `polls`, `costs`, `notifications`, `pushSubscriptions`, `events`. Most have `get` / `listByHouse` / `save`. Exceptions: `costs` is `listByHouse` / `add` only (costs are insert-only in v1); `polls` saves piece by piece (`create` / `addOption` / `setVote` / `saveState`, one RLS rule each); `feelings` also has `remove`; `notifications` is `offFor` / `setEnabled` / `enqueue` / `pending` / `markSent`; `pushSubscriptions` is `save` / `forUsers` / `markOk` / `markGone`. Saves are update-then-insert, not upsert (RLS on upserts). | Kysely queries | in-memory tables |
| `EventSink` (`repos.events`) | `record(houseId, events: DomainEvent[], at: Instant)`: stamps rows with the injected clock's `at` (A21) and writes `activity_events`; `withNotifications(uow)` (A23) makes the same call also write `notifications_outbox` in the **same transaction** (transactional outbox). `forRun(houseId, runId)` reads a run's story (rows on it or moved into it) inside the transaction. | Postgres | in-memory |
| `Clock` | `now(): Instant` | `systemClock` | `fixedClock(t)` |
| `IdGenerator` | `newId<K>(): Id<K>` | `cryptoIds` (`crypto.randomUUID`) | `seqIds()` |
| `Tokens` | `newToken()` (128 bits, URL-safe), `hash(token)` (SHA-256): invite tokens are stored only as hashes | `cryptoTokens` | `seqTokens()` |
| `RateLimiter` | `hit(key, { limit, windowMs }, now): Promise<boolean>`: counts attempts per key in fixed windows, outside the use case's transaction (§5.4) | Postgres (`rate_limits`, service role) | in-memory |
| `HouseQueries` (read side) | Raw reads, each one RLS-filtered: `house`, `members`, `profiles`, `rooms`, `contacts`, `feelings`, `items`, `polls`, `runs`, `costs`, `invites` (admins only), `notificationsOff(userId)`, `itemActivity(houseId, itemId)`, `runActivity(houseId, runId)`, `latestActivity(houseId, kind)`, and `activity(houseId, { before?, limit })`, a page of rows with the `subjects` they name (A24). Screens shape these in the browser with pure functions (`homeFeed`, `needList`, `choreList`, `taskList`, `calendarEntries`, `activityFeed`, …). | Supabase browser client (RLS) | `memoryHouseQueries` |
| `ChangeFeed` | `subscribe(houseId, onChange: (change: { table }) => void): Unsubscribe` | Supabase Realtime (§7.5) | `memoryChangeFeed` |
| `AuthGateway` | `createUser(email): Result<UserId, 'already_exists'>`, `sendCode(email)` (only to an existing account, silent either way), `deleteUser(id)`. Checking the code is `verifyOtp` in the sign-in server action, which sets the session cookie. | Supabase Auth (admin client for create/delete, anon client for codes) | `memoryAuth` |
| `PushSender` | `send(sub: PushSubscription, payload: string): Promise<PushOutcome>`, where `PushOutcome` is `'sent' \| 'gone' \| 'failed'` (404/410 → `gone`) | `webPushSender` (`web-push`, VAPID) | `fakePush()` (records sends) |
| `Config` | `{ setupToken }`: all a use case needs. Adapter secrets (database URL, service-role key, VAPID keys, cron secret) stay in the composition root. | `appConfig(serverConfig())`; `loadConfig` in `lib/config.ts` validates the environment with Zod, **the only place env is read** | literal object |

**Composition root** (`lib/compose.ts`), the one place where concrete adapters are wired:
- `depsForRequest(session): AppDeps`: Postgres UoW wrapped in `withNotifications`, system clock, crypto ids and tokens, the Postgres rate limiter, Supabase Auth, the web-push sender, config. Use cases take the actor per call, so RLS applies to the signed-in user.
- `depsForJob(): AppDeps`: the same deps; jobs pass the system actor (`{ kind: 'system' }`), which the UoW runs as `service_role`. Jobs call the **same use cases** as users do. Invite and setup steps that run before someone is a member use these deps too, after checking the token themselves.
- `depsForTest(overrides?): TestDeps`: in-memory adapters, a fixed clock (`TEST_NOW`), sequential ids and tokens, fake auth and push.
- `sendNotificationsNow()`: runs the send-notifications job right after a house action that succeeded (via `after()` in `app/actions/env.ts`), logging rather than throwing.
- `authForRequest()`: the `AuthGateway` alone, for entry points that act before anyone is signed in (sending a sign-in code).

`lib/compose.client.ts` is the browser's composition root: `browserAppClient(me, commands)` builds the `AppClient` from the Supabase browser client (`supabaseHouseQueries`, `supabaseChangeFeed`) and the server actions.

**In the UI**, components get data and commands through an `AppClient` interface (`lib/client/app-client.ts`: `queries`, `changes`, `commands`) provided by React context (`<AppClientProvider>`). Hooks in `lib/client/hooks.ts`, such as `useItems()` and `useFinishRun()`, depend on that interface, not on Supabase or on specific server actions. Component tests inject a fake `AppClient` (`lib/testing/app-client.ts`).

**Why move logic out of Postgres (A11)**

| Option | Good | Bad |
|---|---|---|
| Keep logic in RPCs and triggers (previous draft) | Atomic by default | Logic is split between SQL and TS. It can't be injected or unit-tested without a database, time comes from `now()` implicitly, and side effects (notifications, activity) are hidden in triggers. |
| **Logic in TS use cases + transactions via the UoW** ⭐ | One language. Pure domain functions are trivially testable, and time, ids, and senders are injected. Side effects are explicit events. RLS still enforced via `set local role`. | Needs a server-side Postgres connection (Supabase pooler) and a tiny UoW adapter |

---

## 5. Authentication & access control

### 5.1 Sign-in method — **[DECIDED] A3 / PRD Q10**

| Option | Pros | Cons |
|---|---|---|
| **Email magic link** ⭐ | No passwords, works everywhere, built into Supabase | iOS PWA gotcha: the link opens in Safari, not the installed PWA, so the session lands in the wrong context. Fix this with **email OTP code entry** (6 digits typed into the app) instead of a clickable link. |
| **Email OTP code** ⭐ (same provider) | Works perfectly inside an installed PWA | Slightly more typing |
| Sign in with Apple | One tap on iPhone | Needs an Apple Developer account ($99/yr) and config. "Hide my email" complicates matching invites to people. |
| Phone SMS OTP | Everyone has a phone | Costs money per SMS (Twilio), and SIM-swap risk |
| Passkeys (WebAuthn) | Best UX + security on iPhone | Newer in Supabase, and needs a fallback for new devices |

**[DECIDED] Email with a 6-digit OTP code only.** The email template contains just the code, no clickable link. **Passkeys come in phase 2.** Sessions are long-lived (refresh token rotation, ~30-day inactivity expiry), so people rarely re-auth.

### 5.2 "Credential matching": how only house members get in

1. The admin creates an invite (`createInviteAction` → `createInvite`) → a row in `house_invites` with a random 128-bit token (stored **hashed**), `expires_at`, `max_uses`, `revoked_at`.
2. The link `https://<app>/join/<token>` is shared in the group chat.
3. A visitor opens the link and enters their name and email. The join page calls the `startJoin` server action (`app/actions/invites.ts`) with the token and email.
4. `startJoin` runs the `startInvite` use case as the system actor: a rate-limit check, then the token's hash is looked up and the pure `validateInvite` checks expiry, uses, and revocation. Only if the invite is valid does it create the auth user (Supabase Admin API; an existing account is fine) and send the 6-digit code. **Public sign-up is turned off** in Supabase Auth settings, so an email typed into the regular sign-in screen without a valid invite gets no code and no account. A refused token is logged as a server warning.
5. The visitor enters the code (which signs them in) and picks an open bedroom → the `acceptJoin` server action runs the `acceptInvite` use case (system actor, re-checking the invite inside the write transaction), which saves their profile, inserts `house_members(house_id, user_id, role='member', status='active', room_id)`, increments uses, records `member.joined`, and notifies all members. **(owner)** There's no approval step.
6. **Returning sign-in** (`/sign-in`): the `requestCode` server action calls `AuthGateway.sendCode`, which is `signInWithOtp({ email, options: { shouldCreateUser: false } })`. With public sign-up also disabled server-side, this only sends a code to emails that already have an account. The UI shows the same "If you have an account, we sent a code" message either way, so it doesn't reveal who's a member. `verifyCode` checks the code (`verifyOtp`) and sets the session cookie.
7. From then on, **every house row carries `house_id`**, and RLS policies allow access only when `is_member(house_id)` is true for `auth.uid()`. Server-side use cases keep this protection: the Postgres `UnitOfWork` sets `role authenticated` and the user's JWT claims per transaction (§4.1).

```sql
create function is_member(h uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from house_members
    where house_id = h and user_id = auth.uid() and status = 'active'
  );
$$;

-- pattern applied to every house-scoped table
alter table items enable row level security;
create policy "items read"   on items for select using (is_member(house_id));
create policy "items insert" on items for insert with check (is_member(house_id) and created_by = auth.uid());
create policy "items update" on items for update using (is_member(house_id)) with check (is_member(house_id));
-- no delete policy: soft-delete via archived_at only (feelings are the one exception, below)
```

Admin-only actions (invites, adding and removing members, roles, house details) use an `is_admin(house_id)` policy. The rules beyond that pattern, each mirrored in `lib/adapters/memory/db.ts`:

| Policy / helper | Table | What it allows |
|---|---|---|
| "houses setup" + `no_house_exists()` | `houses` insert | The first account creates the only house (below) |
| `can_claim_house(h)` in "members admin insert" | `house_members` insert | The setup owner adds *themselves* as the first admin of the house they created, while it has no members |
| "members update own" (+ `member_role`) | `house_members` update | You move out or change your room, never your role; someone who moved out can't reactivate themselves |
| "houses members set feeling weights" (+ `only_feeling_weights_changed`) | `houses` update | Any member saves the row when nothing but `settings.feeling_weights` differs from the stored one (A22, PRD §8.2) |
| "feelings delete own" | `feelings` delete | The one DELETE policy: removing your own current feeling (its history stays in `activity_events`) |
| "notification prefs read" (+ `shares_house`) | `notification_prefs` select | Housemates read each other's toggles, so whoever records an event enqueues only what the others want (A23); you change only your own |
| `poll_is_open(p)` | `poll_options`, `poll_votes` insert/update | Options and your own vote only while the poll is open |
| RLS on, no policies | `rate_limits` | Service role only (the server's system actor) |

Signed-out visitors (`anon`) have no grants on any table, and `authenticated` has no `DELETE` or `TRUNCATE` except on `feelings`.

**[DECIDED] A4:** no extra "house passcode" on invites. Joins notify everyone, links expire and can be revoked, and admins can remove people in one tap.

**Single-house bootstrap (owner: one house only):** the very first account (you) is created with a one-time `SETUP_TOKEN` env var. Visiting `/setup/<SETUP_TOKEN>` runs the `startSetup` server action (rate-limited; creates your account and sends a code), then `finishSetup` (signed in) runs the `setupHouse` use case, which creates the house and its rooms and makes you admin. After that, the route is permanently disabled once a house exists. It's also blocked by the RLS insert policy "houses setup", which requires `no_house_exists()` (a security-definer check that counts houses outside RLS). This avoids a "whoever signs in first owns the house" race.

**Who can join, summarized:**

| Situation | Result |
|---|---|
| Stranger finds the app URL and types their email | Nothing. Public sign-up is off, so no code is sent and no account is created. |
| Someone has a valid, unexpired invite link | They can join. A forwarded link works too, which is why joins notify everyone and links have `max_uses` (default = number of open spots) and a 7-day expiry. |
| Link is expired, revoked, or used up | "This invite is no longer valid. Ask a roommate for a new one." |
| Former roommate (marked moved out) | Can still sign in, but RLS returns no house data. They see "You're no longer a member." |

**[DECIDED] (owner) A9: invites are not locked to specific emails.** Expiry, `max_uses`, and join notifications are enough for a house of friends. Changing this later would just mean adding an optional `email` column to `house_invites` and checking it in the `startInvite` use case.

### 5.3 Where user data lives

| Data | Stored in | Notes |
|---|---|---|
| Email address, account ID, sign-in timestamps | Supabase Auth (`auth.users` table in *your* Supabase project's Postgres) | Managed by Supabase. We never store passwords, because there are none. |
| The 6-digit code | Supabase Auth, **hashed**, single use | Expires after 10 minutes (we set this, default is 1h). Rate-limited per email/IP. |
| Session | A refresh token in Supabase Auth, plus an access token (JWT) in the phone's browser storage/cookie | Signing out, or an admin removing a member, revokes it |
| Display name, timezone, quiet hours | Our `profiles` table (same database) | Readable only by members of the same house |
| House data (items, feelings, polls, runs, costs) | Our tables, same project (no file storage in v1) | Access controlled by RLS as above |

- **Physical location:** one Supabase project in the region you pick when creating it (e.g. `us-east-1`). The data is encrypted at rest and in transit (TLS). Only you, as the Supabase project owner, can see the raw tables in the dashboard.
- **Who else touches it:**
  - **Gmail** (a dedicated house account) sends the code emails, so it sees email addresses and codes, and keeps a copy of each in its Sent folder. Codes expire in 10 minutes, so the copies are harmless.
  - **Vercel** sees requests passing through the server routes, but it doesn't store user data beyond short-lived logs.
  - **Sentry** (added with hosting in M5) is to be configured to scrub emails and request bodies.
- **Email sending needs custom SMTP.** Supabase's built-in email service only delivers to your own team's addresses and is heavily rate-limited, so custom SMTP is required before roommates can sign in. v1 uses a Gmail account made just for this (2-step verification on, an app password as the SMTP password), which sends about 500 emails a day with no domain. Never use a personal Gmail: the app password can read and send that account's mail. If Google flags the account or the password changes, sign-in emails stop, so moving to Resend is a settings change in Supabase, not a code change (A18).
- **Deleting an account:** "Delete my account" on the House tab (`deleteAccount`) moves you out, anonymizes your profile (kept, because activity rows point at it), and deletes the auth user. Your name on past items becomes "Former roommate."

### 5.4 Other security decisions [DECIDED]

- RLS is **enabled on every table**, and a test (`supabase/tests/rls.test.ts`, "RLS is on everywhere") fails if any public table lacks RLS.
- The service-role key lives only in server env vars (read by `loadConfig`) and is never shipped to the client.
- **Sensitive fields** (Wi‑Fi, door codes) come later with info items (PRD §13). v1 stores no secrets.
- File attachments come later (PRD §13). When added: private buckets, `house/<house_id>/<item_id>/<file>` paths, and signed URLs.
- Rate limits: Supabase Auth's built-in OTP limits, plus our own per-IP limits through the `RateLimiter` port (the `rate_limits` counter table, service role only, no extra vendor). The rules live in `lib/app/invites.ts`: `INVITE_RATE` (10 per 10 minutes) for joining, step 1 (`invite:start:<ip>`) and the last step (`invite:accept:<ip>`), and `SETUP_RATE` (10 per hour) for `startSetup` (`setup:<ip>`). Refused invite tokens are logged as server warnings.
- Headers (`next.config.ts`): `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` and `Referrer-Policy: strict-origin-when-cross-origin` on every route, and a `Content-Security-Policy` on `/sw.js` only. The session cookie keeps `@supabase/ssr`'s defaults (`SameSite=Lax`). No third-party scripts.

---

## 6. Data model (v1)

### 6.1 Storage strategy — **[DECIDED] (owner) D18: one `items` table**

v1 has three item categories (need, chore, task), and each adds only one or two columns. So they share **one table**, with CHECK constraints tying each category-specific column to its category. Polls, runs, costs, and feelings are **their own tables** that point at items.

| Option | Why not (for v1) |
|---|---|
| Base + a detail table per category (previous draft) | Three extra 1:1 tables for 1–2 columns each. More joins and migrations for no real gain at this size. |
| JSON details column | The database can't enforce anything about the JSON |
| Item + optional "component" tables | Designed for items that gain features over time. v1 creates new linked items instead (D15), so it isn't needed. |

**If a category grows a lot later** (e.g. bills with cadence and payment history), it gets its own detail table then, keyed `(item_id, category)` with a composite foreign key. That's the same pattern as before, adopted only when it's earned.

### 6.2 Schema

As migrated in `supabase/migrations/`. Text columns also carry length CHECKs (left out here).

```
-- house & people -------------------------------------------------------------------
profiles        (id, display_name, theme: auto|light|dark, timezone null, quiet_start null, quiet_end null, created_at)
                 -- id = the auth user's id, but no foreign key: a deleted account's profile is anonymized and kept
                 check ((quiet_start is null) = (quiet_end is null))
houses          (id, name, address null, unit null, created_by, created_at,
                 settings jsonb)   -- { timezone, feeling_weights: {anxious:20, frustrated:15, confused:5, fine:0, meh:-5, thanks:0}, invite_ttl_days }
                 check (valid_feeling_weights(settings -> 'feeling_weights'))   -- known feelings, −20…+40, steps of 5 (A22)
house_members   (house_id, user_id, role: admin|member, status: active|moved_out, room_id null, joined_at, left_at null)  PK(house_id, user_id)
                 foreign key (house_id, room_id) references rooms (house_id, id)    -- a room of the same house
                 check ((status = 'moved_out') = (left_at is not null))
rooms           (id, house_id, name, floor: first|basement|outside, kind: bedroom|bath|common|entry|utility|outdoor,
                 element: air|fire|water|earth|null, sort_order, archived_at null)
house_invites   (id, house_id, token_hash unique, created_by, created_at, expires_at, max_uses > 0, uses, revoked_at null)
contacts        (id, house_id, name, phone null, note null, created_at, archived_at null)   -- archived, never deleted

-- items: needs, chores, tasks ----------------------------------------------------
items           (id, house_id,
                 category: need|chore|task,                 -- never changes (D15)
                 title, note null, room_id null,            -- room: same house (composite foreign key)
                 assignee_id null,                          -- "who's on it"; null = anyone
                 when_at null, when_has_time bool,          -- due / needed by / scheduled
                 priority: low|normal|high|urgent  default 'normal',
                 repeat_days int null,                      -- chores only, 1–365: null = as needed
                 last_done_at null, last_done_by null,      -- chores only
                 contact_id null,                           -- tasks only: "handled by"
                 done_at null, done_by null,                -- needs & tasks (chores use last_done_*)
                 run_id null, run_kind null,                -- the run it's on RIGHT NOW (null = in the pool); history is in activity_events
                 created_by, created_at, updated_at, archived_at null)
                 foreign key (house_id, run_id, run_kind) references runs (house_id, id, kind)
                 check ((run_id is null) = (run_kind is null))
                 check (run_kind is null or run_kind = 'batch' or category = 'task')   -- requests & visits hold tasks only
                 check (run_id is null or (done_at is null and archived_at is null))  -- done/archived items aren't on a run
                 check (category = 'chore' or (repeat_days is null and last_done_at is null and last_done_by is null))
                 check (category = 'task'  or contact_id is null)
                 check (category <> 'chore' or done_at is null)          -- chores are never "done", only "last done"
                 check ((done_at is null) = (done_by is null)), check ((last_done_at is null) = (last_done_by is null))
                 check (when_at is not null or not when_has_time)
                 unique (house_id, lower(btrim(title))) where category = 'need' and done_at is null and archived_at is null
                                                                          -- adding a need that's already open points to it

feelings        (item_id, user_id, house_id, kind: anxious|frustrated|confused|fine|meh|thanks, note null, updated_at)
                 PK(item_id, user_id)       -- previous versions come from activity_events for the "Earlier" list
                 foreign key (house_id, item_id) references items (house_id, id)

-- polls --------------------------------------------------------------------------
polls           (id, house_id, question, item_id null,      -- about an item (same house), or standalone ("house name")
                 closes_at null, closed_at null, created_by, created_at, updated_at)
poll_options    (id, poll_id, house_id, label, note null, added_by, added_at, sort_order)
                 unique (poll_id, lower(btrim(label)))      -- options can be added while the poll is open
poll_votes      (poll_id, user_id, house_id, option_id, voted_at)     PK(poll_id, user_id)   -- one vote each, changeable while open
                 foreign key (poll_id, option_id) references poll_options (poll_id, id)

-- runs ---------------------------------------------------------------------------
runs            (id, house_id, kind: batch|request|visit,   -- kind never changes
                 title null,                                -- null: shown as "Kavya's run" / "Landlord visit"
                 runner_id,                                 -- batch: who's doing it · request/visit: house point person
                 contact_id null,                           -- required for request & visit, null for batch
                 when_at null, when_has_time bool,          -- batch & visit only (a visit's date is optional)
                 status: open|finished|gathering|sent|closed,   -- one column; allowed values depend on kind
                 sent_at null, sent_via: text|email|call|portal|in_person  null,   -- requests only
                 finished_at null, created_by, created_at, updated_at)
                 check ((kind = 'batch') = (contact_id is null))
                 check (case kind when 'request' then status in ('gathering','sent','closed')
                                  else status in ('open','finished') end)
                 check (kind = 'request' or (sent_at is null and sent_via is null))
                 check (kind <> 'request' or when_at is null)
                 check (status <> 'sent' or (sent_at is not null and sent_via is not null))
                 check ((status in ('finished', 'closed')) = (finished_at is not null))
                 check (when_at is not null or not when_has_time)
                 unique (house_id, id, kind)                -- target for items' (house_id, run_id, run_kind) foreign key
                 -- a run's contents = items where run_id = runs.id; what used to be on it = activity_events (§6.4)

-- money --------------------------------------------------------------------------
costs           (id, house_id, amount_cents, paid_by, note null,   -- 0 < amount_cents ≤ 10,000,000 ($100,000)
                 item_id null, run_id null,                 -- what it was for (at most one)
                 created_by, created_at)                    -- insert-only in v1; a Splitwise copy is a cost.splitwise_copied activity row
                 check (num_nonnulls(item_id, run_id) <= 1)

-- infrastructure -----------------------------------------------------------------
activity_events       (see §6.4: typed subject columns, append-only; the source of all history)
push_subscriptions    (id, user_id, endpoint unique (https only), p256dh, auth, user_agent null, created_at, last_ok_at null,
                       gone_at null)   -- set when the push service answers 404/410; rows are never deleted
notification_prefs    (user_id, category: assigned|due|feelings|polls|runs|people, enabled, updated_at)  PK(user_id, category)
                       -- a row only for a category someone changed; no row = on
notifications_outbox  (id, user_id, house_id, category, title, body, url, created_at, send_after, sent_at null, error null,
                       dedupe_key null)   -- reminders carry a key, so a job that runs twice enqueues nothing new
rate_limits           (key, window_start, hits)  PK(key, window_start)   -- per-IP counters (§5.4), service role only
```

**7 app tables** (items, feelings, polls, poll_options, poll_votes, runs, costs) plus `activity_events` (history) and house, people, and infrastructure. House data tables carry `house_id` and use RLS via `is_member(house_id)` (§5.2). Per-person rows (`profiles`, `push_subscriptions`, `notification_prefs`) are keyed by `user_id` instead, and `rate_limits` is server-only. References to rooms, items, polls and runs from another house's row are refused by composite foreign keys on `(house_id, id)` (`costs.run_id` is a plain foreign key, checked by the use case).

`updated_at` is kept by the one allowed trigger (`touch_updated_at`) on `items`, `runs`, `polls` and `notification_prefs`.

Indexes: `rooms(house_id, sort_order)`, `house_members(user_id)`, `house_invites(house_id)`, `contacts(house_id) where archived_at is null`, `items(house_id, category) where archived_at is null`, `items(house_id, when_at) where when_at is not null`, `items(run_id) where run_id is not null`, `feelings(house_id)`, `runs(house_id, status, when_at)`, `polls(house_id) where closed_at is null`, `polls(item_id) where item_id is not null`, `costs(house_id, created_at)`, `push_subscriptions(user_id) where gone_at is null`, `notifications_outbox(send_after) where sent_at is null`, unique `notifications_outbox(dedupe_key) where dedupe_key is not null`, the unique open-need and option-label indexes above, and the six on `activity_events` (§6.4).

**Money** is integer cents. **Time** is `timestamptz` in UTC, and dates without a time are interpreted in the house timezone.

### 6.3 Domain model: standalone types (`lib/domain/*.ts`)

Plain, immutable (`readonly`), serializable objects, and **discriminated unions** so invalid states can't be represented (a need can't have a repeat, a chore can't be "done"). Adapters map rows ↔ these types. Each type lives with its module (`ids.ts`, `time.ts`, `money.ts`, `actor.ts`, `result.ts`, `house.ts`, `items.ts`, `feelings.ts`, `polls.ts`, `runs.ts`, `costs.ts`, `events.ts`); there is no shared `types.ts`. Abridged below (`readonly` left out).

```ts
// ---- primitives ----
type Id<K extends string> = string & { readonly __id: K }
type UserId = Id<'user'>; type HouseId = Id<'house'>; type ItemId = Id<'item'>; type RoomId = Id<'room'>; type InviteId = Id<'invite'>
type ContactId = Id<'contact'>; type PollId = Id<'poll'>; type OptionId = Id<'option'>; type RunId = Id<'run'>; type CostId = Id<'cost'>; type ActionId = Id<'action'>
type Instant = { readonly epochMs: number }
type When = { date: LocalDate; time?: LocalTime }        // local to the house timezone
type LocalDate = `${number}-${number}-${number}`; type LocalTime = `${number}:${number}`
type Cents = number & { readonly __cents: true }
type Actor =
  | { kind: 'member'; userId: UserId; houseId: HouseId }   // acting inside a house
  | { kind: 'user'; userId: UserId }                       // signed in, no house in play yet (where to go, setup)
  | { kind: 'system'; houseId: HouseId }                   // Roomies itself (jobs, invite steps before membership)
type HouseActor = Extract<Actor, { houseId: HouseId }>     // what most use cases take
type Result<T, E extends string> = { ok: true; value: T } | { ok: false; error: E; detail?: Record<string, string> }

// ---- items ----
interface ItemBase {
  id: ItemId; houseId: HouseId; title: string; note?: string; roomId?: RoomId
  assignee?: UserId; when?: When; priority: 'low' | 'normal' | 'high' | 'urgent'
  run?: { id: RunId; kind: Run['kind'] }               // the run it's on right now; undefined = in the pool
  createdBy: UserId; createdAt: Instant; archivedAt?: Instant
}
type Done = { at: Instant; by: UserId }
type Need  = ItemBase & { category: 'need';  done?: Done }                       // urgency = feelings + needed-by date
type Chore = ItemBase & { category: 'chore'; repeatDays: number | null; lastDone?: Done }   // null = as needed
type Task  = ItemBase & { category: 'task';  contactId?: ContactId; done?: Done }
type Item = Need | Chore | Task

type FeelingKind = 'anxious' | 'frustrated' | 'confused' | 'fine' | 'meh' | 'thanks'
type Feeling = { itemId: ItemId; by: UserId; kind: FeelingKind; note?: string; at: Instant }
type FeelingWeights = Record<FeelingKind, number>

// ---- polls ----
type Poll = { id: PollId; houseId: HouseId; question: string; itemId?: ItemId
  options: readonly { id: OptionId; label: string; note?: string; addedBy: UserId; addedAt: Instant }[]
  votes: readonly { user: UserId; option: OptionId; at: Instant }[]
  closesAt?: Instant; createdBy: UserId; createdAt: Instant
  state: { open: true } | { open: false; closedAt: Instant } }
// the result is read from the votes (they can't change once closed): resultOf(poll)
type PollResult = { winner: OptionId; votes: number; runnerUp: number } | { tie: readonly OptionId[]; votes: number } | { noVotes: true }

// ---- runs ----
// a run's current contents are the items whose `run.id` points at it (loaded alongside); its history is RunStep[] (below)
type Run = { id: RunId; houseId: HouseId; title?: string; runner: UserId; createdBy: UserId; createdAt: Instant } & (
  | { kind: 'batch'; when?: When; state: { open: true } | { open: false; finishedAt: Instant } }
  | { kind: 'request'; contactId: ContactId
      state: { at: 'gathering' } | { at: 'sent'; sentAt: Instant; via: 'text' | 'email' | 'call' | 'portal' | 'in_person' } | { at: 'closed'; closedAt: Instant } }
  | { kind: 'visit'; contactId: ContactId; when?: When; state: { open: true } | { open: false; finishedAt: Instant } }
)

// ---- money ----
type Cost = { id: CostId; houseId: HouseId; amount: Cents; paidBy: UserId; note?: string
  for?: { item: ItemId } | { run: RunId }; createdBy: UserId; createdAt: Instant }

// history of items on runs, read back from activity_events
type RunStep = { id: number; at: Instant; by: UserId | null; itemId: ItemId; runId: RunId; note?: string
  what: 'added' | 'done' | 'returned' | { movedTo: RunId } }

type HouseSettings = { timezone: string; feelingWeights: FeelingWeights; inviteTtlDays: number }

// ---- events (returned by domain functions, recorded by EventSink) ----
type DomainEvent = { actionId: ActionId; by: UserId | null } & (      // by: null = Roomies (jobs)
  // items
  | { kind: 'item.created' | 'item.done' | 'item.reopened' | 'item.archived' | 'item.restored' | 'chore.done' | 'chore.undone'; itemId: ItemId; runId?: RunId }
  | { kind: 'item.edited'; itemId: ItemId; changes: FieldChanges }
  | { kind: 'item.assigned'; itemId: ItemId; memberId: UserId | null; changes: FieldChanges }
  | { kind: 'item.handled_by_changed'; itemId: ItemId; contactId: ContactId | null; changes: FieldChanges }
  // feelings
  | { kind: 'feeling.set'; itemId: ItemId; changes: { previous: Feeling | null; next: Feeling } }
  | { kind: 'feeling.removed'; itemId: ItemId; changes: { previous: Feeling } }
  // polls
  | { kind: 'poll.created' | 'poll.reopened' | 'poll.vote_withdrawn'; pollId: PollId; itemId?: ItemId }
  | { kind: 'poll.option_added' | 'poll.voted'; pollId: PollId; optionId: OptionId; note?: string }
  | { kind: 'poll.vote_changed' | 'poll.deadline_changed'; pollId: PollId; optionId?: OptionId; changes: FieldChanges }
  | { kind: 'poll.closed'; pollId: PollId; optionId?: OptionId; payload: { result: 'winner' | 'tie' | 'no_votes' } }
  // runs (one event per item; a bulk action shares one actionId)
  | { kind: 'run.created' | 'request.closed'; runId: RunId; contactId?: ContactId }
  | { kind: 'run.item_added' | 'run.item_done'; runId: RunId; itemId: ItemId }
  | { kind: 'run.item_returned'; runId: RunId; itemId: ItemId; note: string }
  | { kind: 'run.item_moved'; runId: RunId; toRunId: RunId; itemId: ItemId; note?: string }
  | { kind: 'run.renamed' | 'run.date_set'; runId: RunId; changes: FieldChanges }
  | { kind: 'run.point_person_changed'; runId: RunId; memberId: UserId; changes: FieldChanges }
  | { kind: 'request.sent'; runId: RunId; contactId: ContactId; payload: { via: string; message: string } }
  | { kind: 'run.finished'; runId: RunId; payload: { done: number; returned: number } }
  // money
  | { kind: 'cost.added' | 'cost.splitwise_copied'; costId: CostId; itemId?: ItemId; runId?: RunId; memberId?: UserId }
  | { kind: 'cost.edited'; costId: CostId; changes: FieldChanges }
  | { kind: 'cost.removed'; costId: CostId; note?: string }
  // house, people, places
  | { kind: 'house.created' }
  | { kind: 'settings.feeling_weights_changed'; changes: FieldChanges }
  | { kind: 'member.joined' | 'member.room_changed'; memberId: UserId; roomId?: RoomId; changes?: FieldChanges }
  | { kind: 'member.role_changed' | 'member.moved_out' | 'member.removed'; memberId: UserId; note?: string; changes?: FieldChanges }
  | { kind: 'invite.created' | 'invite.revoked'; payload: { expiresAt?: string; maxUses?: number } }
  | { kind: 'contact.created' | 'contact.edited' | 'contact.removed'; contactId: ContactId; changes?: FieldChanges }
  | { kind: 'room.added' | 'room.renamed' | 'room.archived'; roomId: RoomId; changes?: FieldChanges }
)
type FieldChanges = Record<string, [before: unknown, after: unknown]>
```

### 6.4 Activity log: the source of history **[DECIDED] (owner)**

Current state lives on the rows (`items.run_id`, `polls.closed_at`, …). **Everything that happened lives in `activity_events`:** item moves between runs, the Earlier feelings, poll votes, cost edits. Nothing else stores history.

```sql
create table activity_events (
  id          bigserial primary key,                    -- also the order events happened in
  house_id    uuid        not null references houses(id) on delete cascade,
  at          timestamptz not null default now(),
  actor_id    uuid        null references profiles(id), -- null = Roomies (jobs)
  action_id   uuid        not null,                     -- one user action; a bulk move of 3 tasks = 3 rows, same action_id
  kind        text        not null,                     -- catalog below

  -- subjects: typed columns with foreign keys; which are set depends on kind
  item_id     uuid null references items(id),
  run_id      uuid null references runs(id),            -- the run it happened on (or moved FROM)
  to_run_id   uuid null references runs(id),            -- moves only
  poll_id     uuid null references polls(id),
  option_id   uuid null references poll_options(id),
  cost_id     uuid null references costs(id),
  contact_id  uuid null references contacts(id),
  member_id   uuid null references profiles(id),        -- the member affected, not the actor
  room_id     uuid null references rooms(id),

  note        text  null,                               -- the human note ("sending a plumber")
  changes     jsonb null,                               -- field diffs {"when": [old, new]}; feeling previous/next
  payload     jsonb not null default '{"v":1}',         -- versioned extras only; nothing queried lives here

  check (kind in (/* the catalog below */)),
  check (kind not like 'item.%'     or item_id is not null),
  check (kind not like 'chore.%'    or item_id is not null),
  check (kind not like 'feeling.%'  or item_id is not null),
  check (kind not like 'run.item_%' or (item_id is not null and run_id is not null)),
  check ((kind = 'run.item_moved') = (to_run_id is not null)),
  check (kind not like 'poll.%'     or poll_id is not null),
  check (kind not like 'cost.%'     or cost_id is not null),
  check (kind not like 'member.%'   or member_id is not null),
  check (kind not like 'contact.%'  or contact_id is not null),
  check (kind not like 'room.%'     or room_id is not null),
  check (jsonb_typeof(payload) = 'object' and payload ? 'v')
);

create index on activity_events (house_id, id desc);                                   -- Activity screen
create index on activity_events (item_id, id)  where item_id  is not null;             -- item history, Earlier feelings
create index on activity_events (run_id, id)   where run_id   is not null;             -- a run's story
create index on activity_events (to_run_id)    where to_run_id is not null;
create index on activity_events (poll_id, id)  where poll_id  is not null;
create index on activity_events (action_id);                                           -- grouping bulk actions
```

**Rules**
- **Append-only.** RLS lets members **read** their house's rows and insert rows in their own name ("activity insert own"). There's no update/delete policy, and neither `authenticated` nor `service_role` has an `UPDATE`/`DELETE` grant. Undo writes a new event (`item.reopened`, `chore.undone`, `poll.reopened`). It never removes one.
- **Written by `EventSink` in the same transaction** as the change. No triggers. It's the only table in the `supabase_realtime` publication (§7.5).
- **One row per subject.** A bulk action writes one row per item, sharing an `action_id`. The Activity screen groups rows by `action_id` into one line ("Kavya moved 3 tasks to Landlord visit").
- **Queried fields are columns, never `payload`.** `changes` holds field diffs (varying shape), and `payload` holds versioned extras (`{"v":1, …}`). Sizing, measured in T07 (`pnpm db:sizing`): 148–264 bytes per row depending on kind (feelings with a note are the largest), about **405 bytes/row on disk** including the six indexes and page overhead. At 50 events a day that's roughly **37 MB after 5 years** for one house (the pre-build estimate was ~30 MB).
- **Deleted accounts** keep their rows. The profile is anonymized and shows as "Former roommate."
- `activityRowFor(event)` is pure (it maps a `DomainEvent` to a row). `activityFeed(rows, names, viewer)` is pure too: it groups rows by `action_id` and has `activityLine` phrase each group as one feed line, naming what it's about from the page's `subjects` (A24).

**Reading history back**

```sql
-- an item's path through runs
select kind, run_id, to_run_id, note, actor_id, at from activity_events
 where item_id = :item and kind like 'run.item_%' order by id;

-- a run's story (open or finished): what came, what happened, where it went
select kind, item_id, to_run_id, note, actor_id, at from activity_events
 where run_id = :run or to_run_id = :run order by id;

-- Earlier feelings on an item
select changes, actor_id, at from activity_events
 where item_id = :item and kind in ('feeling.set', 'feeling.removed') order by id desc;
```

**Event catalog.** Feed: ✓ shown, ◐ grouped, — recorded but hidden. Notify: who gets a push.

| Family | Kinds | Subject columns | Feed | Notify |
|---|---|---|---|---|
| Items | `item.created` · `item.edited` · `item.done` · `item.reopened` · `item.archived` · `item.restored` | item (+ run if done on one), `changes` | ✓ | — |
| | `item.assigned` | item, member, `changes` | ✓ | new assignee |
| | `item.handled_by_changed` | item, contact, `changes` | ✓ | — |
| | `chore.done` · `chore.undone` | item | ◐ · — | — |
| Feelings | `feeling.set` · `feeling.removed` | item, `changes {previous, next}` | ✓ · — | assignee on 😰/😤 |
| Polls | `poll.created` · `poll.closed` · `poll.reopened` · `poll.deadline_changed` | poll (+ item, winning option) | ✓ | everyone on created/closed |
| | `poll.option_added` | poll, option, note | ✓ | people who already voted |
| | `poll.voted` · `poll.vote_changed` · `poll.vote_withdrawn` | poll, option | ◐ · ◐ · — | — |
| Runs | `run.created` · `run.renamed` · `run.date_set` · `run.point_person_changed` | run (+ contact, member), `changes` | ✓ | everyone on batch created ("Add anything?") and date set · new point person |
| | `run.item_added` · `run.item_moved` · `run.item_returned` · `run.item_done` | item, run, to_run (moves), note | ◐ | point person on items moved into their visit |
| | `request.sent` · `request.closed` · `run.finished` | run (+ contact) | ✓ | — |
| Money | `cost.added` · `cost.edited` · `cost.removed` · `cost.splitwise_copied` | cost (+ item or run, member who paid) | ✓ · ✓ · ✓ · — | — |
| House | `house.created` · `settings.feeling_weights_changed` · `invite.created` · `invite.revoked` | `changes` / `payload` | ✓ (invites: admins) | everyone on weights |
| People | `member.joined` · `member.room_changed` · `member.role_changed` · `member.moved_out` · `member.removed` | member (+ room), note | ✓ | everyone on joined/left · that member on role |
| Places | `contact.created` · `contact.edited` · `contact.removed` · `room.added` · `room.renamed` · `room.archived` | contact / room, `changes` | ✓ | — |

**Not in this table:** refused invite tokens (server log warnings), sign-in attempts (Supabase Auth), notification delivery (`notifications_outbox`), views, and computed priority.

---

## 7. Key flows

### 7.1 Priority

- **One pure function:** `scorePriority(item, feelings, weights, now, tz): { score, tier, breakdown }`. `weights` comes from `HouseSettings.feelingWeights`, and `now` is an argument. It runs in the browser (`homeFeed`, the Home screen's Needs attention) and in tests with a fixed clock.
- **`isInFeed(item, feelings, now, tz, { visitDate })`** applies the PRD §8.1 rules: tasks not done (except those on a visit, unless there's a feeling or the visit is within 3 days), chores past their rhythm or with a feeling, and needs with a feeling or needed-by within 7 days.
- **Never stored**, because it depends on today's date.

### 7.2 Function catalog

**Domain functions** (`lib/domain/*.ts`, pure: no I/O, time and ids passed in). Most take a `ctx` with `by` (the acting user), `now`, `actionId` and any new ids; every change returns the new value(s) plus the `DomainEvent[]` to record.

| Function | Signature (abridged) | Notes |
|---|---|---|
| **Items** (`items.ts`) | | |
| `createItem` | `(input: NewItem, ctx: { by, now, id, houseId, actionId, openNeeds }) → Result<{ item; events }, ItemError \| 'duplicate_need'>` | `ItemError` = `empty_title` · `title_too_long` · `invalid_for_category` · `bad_repeat`. A duplicate open need returns the existing one's id in `detail.existingId`. |
| `editItem` | `(i: Item, patch: ItemPatch, ctx: { by, actionId, openNeeds }) → Result<{ item; events }, ItemError \| 'duplicate_need' \| 'no_change' \| 'on_a_run'>` | Category can't change. "Handled by" (tasks only) is a patch field (`contactId`), recorded as `item.handled_by_changed`; a task on a request or visit keeps that run's contact (`on_a_run`, with the run's id in `detail`): moving it is how "Handled by" changes there; assignee changes as `item.assigned`; the rest as one `item.edited` with the diff. |
| `markDone` / `reopenItem` | `(i: Need \| Task, by, now, actionId) → Result<…, 'already_done' \| 'archived'>` / `(i, by, actionId, openNeeds) → Result<…, 'not_done' \| 'duplicate_need'>` | Got it / Done, and its undo |
| `doChore` | `(c: Chore, by, now, actionId) → Result<{ chore; events }, 'archived'>` | Updates last done |
| `archiveItem` / `restoreItem` | `(i, by, now, actionId) → Result<…, 'already_archived'>` / `(i, by, actionId, openNeeds) → Result<…, 'not_archived' \| 'duplicate_need'>` | |
| **Lists and the feed** (`lists.ts`, `priority.ts`) | | |
| `needList` / `choreList` / `taskList` | `(items, feelingScore?)` / `(items, now, tz)` / `(items, filter: 'mine' \| 'all' \| 'outside', me)` | The Needs, Chores and Tasks screens' order and filters; `isChoreDue`, `choreLateness`, `daysSinceDone` back them |
| `scorePriority` | `(i: Item, f: Feeling[], w: FeelingWeights, now, tz) → { score, tier, breakdown }` | PRD §8.1; `describePart` words the breakdown ("Why is this here?") |
| `isInFeed` | `(i: Item, f: Feeling[], now, tz, { visitDate? }) → boolean` | PRD §8.1 rules (§7.1) |
| `homeFeed` | `(items, feelingsOf, { weights, now, tz, filter: 'mine' \| 'all', me, visitDate? }) → FeedEntry[]` | Needs attention: in-feed items, highest score first, then the sooner date, then the newest |
| **Feelings and weights** (`feelings.ts`, `weights.ts`) | | |
| `setFeeling` | `(current: Feeling \| null, next: { kind, note? } \| null, ctx: { itemId, by, now, actionId }) → Result<{ feeling \| null; events }, 'no_change' \| 'note_too_long'>` | The event carries `previous`; `earlierFeelings(rows)` reads them back |
| `isValidWeight` / `stepWeight` | `(n) → boolean` / `(n, ±1) → number` | −20…+40, steps of 5 |
| `setFeelingWeights` | `(house: House, next: FeelingWeights, ctx: { by, actionId }) → Result<{ house; events }, 'out_of_range' \| 'no_change'>` | `describeWeightsChange` words the Home card |
| **Polls** (`polls.ts`) | | |
| `createPoll` | `(input: NewPoll, ctx: { by, now, actionId, id, houseId, optionIds }) → Result<{ poll; events }, 'empty_question' \| 'question_too_long' \| 'needs_two_options' \| 'duplicate_label' \| …>` | |
| `vote` | `(p: Poll, option, ctx) → Result<{ poll; vote; events }, 'closed' \| 'unknown_option' \| 'no_change'>` | Changing a vote replaces it |
| `addPollOption` | `(p: Poll, { label, note? }, ctx & { id }) → Result<{ poll; option; events }, 'closed' \| 'duplicate_label' \| …>` | Any member, while open. Existing votes are untouched. |
| `closePoll` | `(p: Poll, ctx: { by: UserId \| null, now, actionId }) → Result<{ poll; result; events }, 'already_closed'>` | `resultOf`: most votes wins, a tie → `{ tie }`, and no votes → `{ noVotes }` (D3). `tally`, `resultLine` for display. |
| **Runs** (`runs.ts`) | | |
| `startRun` | `(input: NewRun, items, ctx: { by, now, actionId, id, houseId }) → Result<{ run: Batch; items; events }, 'nothing_selected' \| 'already_on_a_run' \| 'done_item' \| 'title_too_long'>` | Sets `item.run` on each item |
| `startRequest` / `planVisit` | `(input: { contactId, title?, runner?, when? }, tasks, ctx) → Result<{ run; items; events }, 'already_on_a_run' \| 'done_item' \| 'tasks_only' \| 'title_too_long'>` | Either may start empty. A visit's date is optional. |
| `addToRequest` | `(task, runs: Run[], ctx) → Result<{ run: Request; created; items; events }, 'no_contact' \| …>` | Joins the contact's gathering request (`gatheringRequestFor`), or starts one |
| `addToRun` | `(r: Run, items, ctx) → Result<{ items; events }, 'nothing_selected' \| 'finished' \| 'request_sent' \| 'already_on_a_run' \| 'done_item' \| 'tasks_only'>` | A sent request is closed to additions |
| `sendRequest` | `(r: Run, via, message, tasksOnIt, ctx) → Result<{ run: Request; events }, 'not_a_request' \| 'not_gathering' \| 'empty'>` | `requestMessage(contactName, lines, place?)` builds the numbered message |
| `moveRunItems` | `(from, to, items, ctx & { note?, remainingOnFrom }) → Result<{ items; from; events }, 'nothing_selected' \| 'not_on_run' \| 'same_run' \| 'target_closed' \| 'tasks_only'>` | Points each item at `to` (and sets "Handled by" to its contact). Closes `from` if it's a request left empty. |
| `returnToPool` | `(from, items, ctx & { note?, clearContact, remainingOnFrom }) → Result<{ items; from; events }, 'nothing_selected' \| 'not_on_run'>` | Clears `item.run` |
| `handToContact` | `(from, tasks, contactId, runs, ctx & { note?, remainingOnFrom }) → Result<{ to; created; from; items; events }, …>` | `to` = the contact's gathering request (new if none) |
| `markRunItemsDone` | `(r, items, ctx & { remainingOnRun }) → Result<{ run; items; events }, 'nothing_selected' \| 'not_on_run'>` | Done (or last done for chores) and clears `item.run` |
| `finishRun` | `(r, stillOn, ctx & { doneOnRun }) → Result<{ run: Batch \| Visit; items; events }, 'finished' \| 'not_finishable'>` | Items still on it go back to the pool with "Not done this time" (one `run.item_returned` each) |
| `setVisitDate` | `(r, when \| null, ctx) → Result<{ run: Visit; events }, 'not_a_visit' \| 'no_change'>` | |
| `renameRun` / `setRunner` | `(r, title \| null, ctx) → Result<{ run; events }, 'finished' \| 'title_too_long' \| 'no_change'>` / `(r, runner: UserId, ctx) → Result<{ run; events }, 'finished' \| 'no_change'>` | Open runs only. An empty title goes back to the usual name (`runLabel`). `run.renamed` carries `{ title: [before, after] }`; `run.point_person_changed` carries the member and `{ runner: [before, after] }`. |
| `runSteps` / `itemPath` / `runLedger` | `(rows) → RunStep[]` / `(rows, itemId) → RunStep[]` / `(runId, steps, onRunNow) → LedgerEntry[]` | Pure readers over the activity rows in §6.4; `runProgress`, `inArrivalOrder`, `runLabel`, `visitDateOf` build on them |
| **Money** (`costs.ts`, `money.ts`) | | |
| `addCost` | `(input: NewCost, ctx: { by, now, id, houseId, actionId }) → Result<{ cost; events }, 'not_positive' \| 'too_large' \| 'note_too_long'>` | Who paid defaults to whoever adds it |
| `monthlySpend` | `(costs, members: number, month, tz) → { total: Cents; share: Cents }` | Equal split (`splitEqually`); `monthOf(at, tz)` |
| `splitwiseText` / `copiedToSplitwise` | `(title, amount) → string` / `(cost, { by, actionId }) → DomainEvent` | The copy text, and its `cost.splitwise_copied` event |
| **House, people and places** (`setup.ts`, `invites.ts`, `members.ts`, `rooms.ts`, `contacts.ts`, `profile.ts`) | | |
| `setupHouse` | `(input: NewHouse, owner, now, newId, existingProfile?) → Result<{ house; profile; member; rooms; events }, SetupError>` | Default weights, the owner as admin, and the apartment's rooms (`APARTMENT_ROOMS`). `safeEqual` compares the setup token. |
| `validateInvite` | `(inv: Invite \| undefined, now) → Result<Invite, 'invalid' \| 'expired' \| 'revoked' \| 'used_up'>` | The repo looks the token's hash up first |
| `createInvite` / `revokeInvite` / `acceptInvite` | `(input, ctx: { …, openSpots, tokenHash }) → Result<…, 'bad_limits'>` / `(inv, by, now, actionId) → Result<…, 'already_revoked'>` / `(inv, joining, ctx) → Result<{ invite; member; profile; events }, InviteProblem \| 'already_member' \| 'room_taken' \| 'empty_name'>` | `max_uses` defaults to the open bedrooms (`openBedrooms`, at least 1); 1–20 uses, 1–30 days |
| `moveOut` / `setRole` | `(target, members, by, now, actionId, note?) → Result<…, 'not_allowed' \| 'already_moved_out' \| 'last_admin'>` / `(target, role, members, by, actionId) → Result<…, 'not_allowed' \| 'no_change' \| 'last_admin' \| 'not_active'>` | The house always keeps an admin |
| `anonymizeProfile` | `(p: Profile) → Profile` | "Former roommate" |
| `renameRoom` / `moveRoom` | `(room, name, by, actionId) → Result<…, 'empty_name' \| 'no_change'>` / `(rooms, roomId, 'up' \| 'down') → Result<Room[], 'not_found' \| 'at_edge'>` | Reordering isn't recorded |
| `createContact` / `editContact` / `removeContact` | `(input, houseId, by, id, actionId)` / `(c, patch, by, actionId)` / `(c, by, now, actionId)` | Removing archives (activity rows point at contacts) |
| `updateSettings` | `(p: Profile, patch: SettingsPatch) → Result<Profile, 'bad_time' \| 'no_change'>` | Theme and quiet hours |
| **Calendar** (`calendar.ts`) | | |
| `calendarEntries` / `comingUp` | `(items, runs, from, to) → CalendarEntry[]` / `(items, runs, today)` | Open tasks, needs with a needed-by date, and batches and visits with a date; Coming up is the next 7 days. `byDay`, `monthRange`, `shiftMonth`, `monthGrid` lay out the month. |
| **Activity and notifications** (`events.ts`, `activity.ts`, `notifications.ts`, `reminders.ts`, `push.ts`) | | |
| `activityRowFor` | `(e: DomainEvent, houseId, at) → ActivityRow` | Subjects become typed columns; `payload` holds extras only |
| `activityLine` / `activityFeed` | `(rows sharing an action_id, names: ActivityNames, viewer: { isAdmin }) → FeedLine \| null` / `(rows, names, viewer) → FeedLine[]` | `names` comes from `activityNames(subjects, house)` (A24). Hidden kinds are left out, and admin-only kinds show only to admins. One line per action, newest first. `pageAtActionBoundary` keeps an action on one page. |
| `inActivityFilter` / `feedByDay` | `(line, filter) → boolean` / `(lines, now, tz) → FeedDay[]` | Filters: All, Items, Polls & runs, Money, House. Day headings come from `dayHeading` and line times from `feedTime` (`format.ts`). |
| `notificationsFor` / `deliver` | `(events, ctx: NotificationContext) → OutboxMessage[]` / `(drafts, ctx) → OutboxMessage[]` | Who gets what (A23); `deliver` keeps current members only, drops categories they turned off, and holds messages until their quiet hours end (`isQuiet`, `sendAfter`) |
| `remindersFor` | `(input: { houseId, tz, now, items, polls, runs, people, runLabel }) → Draft[]` | Day-before and day-of reminders, each with a dedupe key |
| `newSubscription` / `pushPayload` / `deliveryResult` | `(browserSub, ctx) → Result<PushSubscription, 'invalid_subscription'>` / `(m) → string` / `(outcomes) → string \| null` | Web Push |

**Use cases** (`lib/app/*.ts`). Each is built as `makeX(deps)`, then called as `(actor: HouseActor, input) → Promise<Result<Out, Err>>` in one `UnitOfWork` transaction, unless noted. Most also return `not_found` (an id from another house, or none). The `Deps` column is what each takes from `AppDeps`; the house use cases take `uow`, `clock`, `ids`.

| File | Use cases (input) | Output | Errors (besides `not_found`) | Deps beyond uow, clock, ids |
|---|---|---|---|---|
| `items.ts` | `createItem` (`NewItem`) · `editItem` (`{ id, patch }`, which also sets "Handled by") · `markDone` · `reopenItem` · `doChore` · `archiveItem` · `restoreItem` (an item id) | `Item` | `ItemError`, `unknown_member` / `unknown_room` / `unknown_contact`, `duplicate_need`, `no_change`, `on_a_run` (edit), `already_done`, `not_done`, `archived`, `not_for_chores`, `not_a_chore`, `already_archived`, `not_archived` | |
| | `setFeeling` (`{ itemId, kind \| null, note? }`) | `Feeling \| null` | `no_change`, `note_too_long` | |
| `runs.ts` | `startRun` (`NewRun & { itemIds }`) · `addToRun` (`{ runId, itemIds }`) · `startRequest` (`{ contactId, itemIds }`) · `planVisit` (`{ contactId, itemIds, when? }`) · `addToRequest` (`{ taskId }`) | `Run` | the domain errors above, `unknown_member` | |
| | `markRunItemsDone` · `returnToPool` (`{ runId, itemIds, note?, clearContact }`) · `moveRunItems` (`{ fromRunId, toRunId, itemIds, note? }`) · `handToContact` (`{ runId, itemIds, contactId, note? }`) · `moveToNewVisit` (`{ fromRunId, itemIds, when?, contactId?, note? }`) | `Run` / `Run[]` (from, to) | the domain errors above, `no_contact` | |
| | `sendRequest` (`{ runId, via }`) · `setVisitDate` (`{ runId, when \| null }`) | `{ run, message }` / `Run` | `not_gathering`, `empty`, `not_a_visit`, `no_change` | |
| | `renameRun` (`{ runId, title \| null }`) · `setRunner` (`{ runId, runner }`, any current member) | `Run` | `finished`, `title_too_long`, `no_change`, `unknown_member` | |
| | `finishRun` (`{ runId, spent?, paidBy?, note? }`) | `{ run, cost? }` | `finished`, `not_finishable`, `unknown_member`, cost errors | |
| `polls.ts` | `createPoll` (`NewPoll`) · `vote` (`{ pollId, optionId }`) · `addPollOption` (`{ pollId, label, note? }`) · `closePoll` (`{ pollId }`) | `Poll` / `{ poll, result }` | the domain errors above | |
| `costs.ts` | `addCost` (`NewCost`) · `copiedToSplitwise` (`{ costId }`) | `Cost` | `not_positive`, `too_large`, `note_too_long`, `unknown_member` | |
| `contacts.ts` | `createContact` (`NewContact`) · `editContact` (`{ id, patch }`) · `removeContact` (an id) | `Contact` | `empty_name`, `no_change`, `already_removed` | |
| `house.ts` | `moveOut` (`{ userId, note? }`: "I moved out", or an admin removing someone) · `setRole` (`{ userId, role }`) · `renameRoom` (`{ roomId, name }`) · `moveRoom` (`{ roomId, direction }`) · `setFeelingWeights` (`FeelingWeights`, any member) | `Member` / `Room` / `Room[]` / `House` | `not_allowed`, `already_moved_out`, `last_admin`, `not_active`, `no_change`, `empty_name`, `at_edge`, `out_of_range` | |
| | `deleteAccount` (none): moves you out, anonymizes your profile, then deletes the auth user | `void` | `last_admin` | `auth` |
| `me.ts` | `updateMySettings` (`SettingsPatch`: theme, quiet hours) · `setNotificationEnabled` (`{ category, enabled }`) | `Profile` / the input | `bad_time`, `no_change` | uow only |
| `invites.ts` | `createInvite` (`NewInvite`) · `revokeInvite` (an id) · `listInvites` (admins) | `{ invite, token }` / `Invite` / `Invite[]` | `not_admin`, `bad_limits`, `already_revoked` | `tokens` |
| | `inviteDetails(token)` · `startInvite(ip, token, email)` · `acceptInvite(ip, userId, token, { displayName, roomId? })`: system actor, before membership (§5.2) | `{ houseId, houseName, invitedBy, bedrooms }` / `void` / the house id | `InviteProblem`, `rate_limited`, `already_member`, `room_taken`, `empty_name` | `tokens`, `limiter`, `auth` (start) |
| `setup.ts` | `setupStatus(token)` · `setupHouse(owner, token, NewHouse)` | `'available' \| 'already_set_up' \| 'invalid_token'` / `House` | `SetupError`, `invalid_token`, `already_set_up` | `config` |
| `session.ts` | `whereTo(userId)`, as the `user` actor | `{ to: 'house', houseId } \| { to: 'moved_out' } \| { to: 'no_house' }` | none | uow only |
| `push.ts` | `savePushSubscription` (`{ subscription, userAgent? }`) | `true` | `invalid_subscription` | |
| **Jobs** (system actor, no input; §7.3) | `runReminders` (`jobs.ts`) · `closeDuePolls` (`jobs.ts`) · `sendNotifications` (`push.ts`) | counts | none | `push` (send) |

`notify.ts` isn't a use case: `withNotifications(uow)` wraps the UnitOfWork so every `events.record` also enqueues `notificationsFor(...)` (A23), and `houseAudience` / `outboxFor` look up who hears about what.

**Worked example: `finishRun`** (`lib/app/runs.ts`, slightly simplified; `inTx` opens the transaction as the member and supplies `by`, `now` and a fresh `actionId`)

```ts
export const makeFinishRun = (deps: Pick<AppDeps, 'uow' | 'clock' | 'ids'>) =>
  inTx(deps, async (actor, input: { runId: RunId; spent?: Cents; paidBy?: UserId; note?: string }, ctx) => {
    const run = await loadRun(ctx.repos, actor, input.runId)
    if (!run) return err('not_found')
    const stillOn = await ctx.repos.items.onRun(run.id)
    const history = await ctx.repos.events.forRun(actor.houseId, run.id)                  // its story so far
    const { done } = runProgress(runLedger(run.id, runSteps(history), stillOn))
    const r = finishRun(run, stillOn, { ...ctx, doneOnRun: done })                         // pure
    if (!r.ok) return r

    let cost: Cost | undefined
    const events = [...r.value.events]
    if (input.spent) {                                                                     // "Did you spend money?"
      const c = addCost({ amount: input.spent, paidBy: input.paidBy, note: input.note, for: { run: run.id } },
                        { ...ctx, id: deps.ids.newId(), houseId: actor.houseId })
      if (!c.ok) return c                                                                  // rolls back (A21)
      cost = c.value.cost
      events.push(...c.value.events)
    }
    await ctx.repos.runs.save(r.value.run)
    for (const item of r.value.items) await ctx.repos.items.save(item)                     // run_id cleared
    if (cost) await ctx.repos.costs.add(cost)
    await ctx.repos.events.record(actor.houseId, events, ctx.now)                          // activity + outbox, same tx
    return ok({ run: r.value.run, ...(cost && { cost }) })
  })
```

### 7.2c Moving items between runs

`moveRunItems` (the use case) runs in one transaction: it loads the `from` run, the selected items, and how many are on `from` now; the pure `moveRunItems` checks each item is on `from` (`not_on_run` otherwise) and that `to` is open and takes them (`target_closed`, `tasks_only`); then each item is saved pointing at `to` (`run_id`, `run_kind`, and for a request or visit `contact_id`, so "Handled by" follows the run), one `run.item_moved` row is recorded per item (`run_id` = from, `to_run_id` = to, the note), and if `from` is a request left empty it's closed with `request.closed`. Saves write by `id` (§7.5 covers races).

**Back to the pool:** `run_id = null` + `run.item_returned` (with the note). **Done:** `run_id = null`, `done_at = now()` + `run.item_done`. **Finish:** every item still on the run gets `run_id = null` + its own `run.item_returned`, then the run is `finished`. **The database enforces "tasks only on requests and visits"** through `items.run_kind` (a composite foreign key + CHECK).

### 7.3 Scheduled jobs

Jobs are **use cases** run as the system actor with `depsForJob()`, behind one route handler, `POST /api/cron/[job]` (`app/api/cron/[job]/route.ts` → `handleCron` in `lib/server/cron.ts`). It checks the `x-cron-secret` header in constant time (401 otherwise), answers 404 for an unknown job, and logs each run. **Supabase pg_cron + pg_net** (free) trigger it. **[DECIDED]** The app URL and the secret live in Supabase Vault (`roomies_app_url`, `roomies_cron_secret`), never in the repo; until both are set the schedule does nothing (locally, `pnpm cron:local <port>` sets them).

| Job (`/api/cron/…`) | Schedule (pg_cron) | Does |
|---|---|---|
| `tick` | every 15 min | Nothing: the heartbeat that proves the schedule reaches the app |
| `reminders` → `runReminders` | every 15 min | Day-before and day-of reminders for dated tasks and chores (assignee), polls closing tomorrow, and runs with a date tomorrow → outbox, each with a dedupe key (person + thing + day), so a second run enqueues nothing new |
| `close-polls` → `closeDuePolls` | hourly, at :05 | Closes polls past `closes_at` and records the result (which tells the house) |
| `send-notifications` → `sendNotifications` | every 5 min, plus right after each house action that succeeded (`after()` → `sendNotificationsNow`) | Sends due outbox rows (`send_after` ≤ now, so quiet hours are already applied) by Web Push, 100 at a time. A subscription the push service calls gone is marked `gone_at`. |

Immediate notifications (assigned, 😰/😤, new poll, run started) come from the use case's events via `notificationsFor` and are written to the outbox in the same transaction.

### 7.4 Web Push on iOS

- Requires the PWA to be **installed to the Home Screen** (iOS 16.4+), a user gesture to request permission, and a VAPID key pair.
- Flow: the user taps "Turn on notifications" (House tab or `/me`) → `Notification.requestPermission()` → `pushManager.subscribe({ applicationServerKey })` (`lib/client/push.ts`) → the `savePushSubscriptionAction` server action → the `savePushSubscription` use case → stored in `push_subscriptions` (same endpoint: refreshed, not duplicated).
- The send-notifications job sends with `web-push` (`PushSender`). A 404/410 response sets `gone_at` on the subscription (`markGone`); nothing is deleted, and gone subscriptions aren't sent to again.
- The service worker registers only in production builds (`pnpm build && pnpm start`), never on `pnpm dev`.
- The service worker handles `push` (show) and `notificationclick` (open the deep link).
- The email digest fallback is **later** (PRD §13).

### 7.5 Realtime

- Every change writes an activity row in the same transaction, so `activity_events` is the only table in the `supabase_realtime` publication. The browser's `ChangeFeed` (`supabaseChangeFeed`) subscribes to its `INSERT`s filtered by `house_id`; Supabase Realtime respects RLS, so only members hear them.
- `changeForKind` (`lib/adapters/change-for-kind.ts`) maps the row's kind to the table it changed (`item.*` → items, `run.*` / `request.*` → runs, `poll.*` → polls, …). `useLiveUpdates` then invalidates the TanStack Query keys that table feeds, plus the activity log. A new event family needs its prefix added there.
- Conflicts: **last write wins** per field. An item can only be on one run because it has one `run_id`. Moves update `where id = :item and run_id = :from`, so a race updates 0 rows and returns `not_on_run`. Saves use optimistic concurrency (`where updated_at = :loaded`) and map a lost race to `conflict`.

### 7.6 Splitwise

v1 is a link-out only: copy "{title} — ${amount}" (`splitwiseText`) and open Splitwise, then record a `cost.splitwise_copied` activity row (the `copiedToSplitwise` use case). Costs have no column for it. The API integration is later.

### 7.7 Offline behavior

**[DECIDED] (owner) A25: Online only, no offline data.** The service worker (`public/sw.js`, production builds only) caches the content-hashed build assets and icons, and keeps the last copy of each page it loaded (network first). With no network, a page opens from that copy if there is one, otherwise the `/offline` page ("Couldn't reach the house. Check your connection and try again."). House data is never cached: it comes from Supabase, and the TanStack Query cache isn't persisted, so a page opened offline has no house data in it. Reads and writes need the network. Caching the last data read-only was considered and not built.

---

## 8. Frontend architecture

Visual design, the color system, rooms/avatars, motion, and copy rules live in [FRONTEND.md](./FRONTEND.md). This section covers only code structure.

```
app/
  layout.tsx  manifest.ts  globals.css
  page.tsx                   -- sends you to your house, or explains why not (moved out / no house yet)
  sign-in/                   -- returning users only: email → 6-digit code (codes go only to existing accounts)
  setup/[token]/             -- one-time house creation, disabled once a house exists
  join/[token]/              -- invite: name + email → code → bedroom → join
  h/[houseId]/
    layout.tsx               -- members only; AppClient + live updates (HouseProviders), tab bar (AppShell)
    page.tsx                 -- Home
    needs/  chores/  tasks/  house/  calendar/  activity/
    i/[itemId]/              -- a link to an item (notifications): opens its sheet over Home
    me/                      -- your settings: theme, quiet hours, notification categories, this device's push
  dev/kit/                   -- the UI kit in light + dark (not in production builds)
  offline/                   -- the service worker's fallback page
  actions/                   -- server actions, one file per area: auth, setup, invites, items, runs, polls, costs,
                                contacts, house, me, push (env.ts: what every house action shares)
  api/cron/[job]/            -- the only route handler: tick, reminders, close-polls, send-notifications (§7.3)
proxy.ts                     -- Next 16's proxy (was middleware): refreshes the session, sends signed-out visitors away from /h/*
components/
  ui/                        -- Avatar (initials + element), Button, Card, Chip, Disclosure, EmptyState, ListRow,
                                OverflowMenu, SegmentedControl, Sheet (vaul), TabBar, Toast
  shell/                     -- AppShell, HouseProviders, ScreenHeader, MeLink, InstallGuide, ServiceWorker, ThemeSync
  auth/  setup/  join/       -- sign-in, setup and join flows
  home/  needs/  chores/  tasks/  calendar/  activity/  house/  me/   -- one folder per screen
  items/                     -- ItemCard, ItemForm, ItemSheets, Feelings, HandledByPicker, RoomSelect, WhyHere
  polls/  runs/  costs/      -- PollSheet, NewPollSheet, RunSheet, StartRunSheet, NewRunSheet, CostForm, ItemCosts
lib/
  domain/                    -- PURE, one module per concept: ids, time, money, result, actor, house, events, activity,
                                format, rooms, setup, invites, members, contacts, profile, items, lists, feelings,
                                priority, weights, runs, polls, costs, calendar, notifications, reminders, push
  app/                       -- ports.ts + use cases (makeX(deps)): items, runs, polls, costs, contacts, house, invites,
                                setup, session, me, push, jobs; notify.ts (withNotifications)
  adapters/
    postgres/                -- Kysely UoW + repos, row ↔ domain mappers, schema.ts (hand-written table types), rate limiter
    supabase/                -- HouseQueries + ChangeFeed (browser), AuthGateway, server clients
    memory/                  -- in-memory UoW (RLS rules mirrored in db.ts), HouseQueries + ChangeFeed, auth, rate limiter
    contracts/               -- shared contract suites, run against memory + Postgres/Supabase
    push/                    -- web-push sender, fake
    clock/  ids/  tokens/
    change-for-kind.ts       -- activity kind → the table to refresh (§7.5)
  compose.ts                 -- server composition root: depsForRequest / depsForJob / depsForTest, sendNotificationsNow
  compose.client.ts          -- browser composition root: browserAppClient
  config.ts                  -- loadConfig(env) (the only process.env reader)
  schemas/                   -- Zod input schemas for the server actions
  server/                    -- makeAction, session, request IP, cron handler
  client/                    -- AppClient interface + React context + TanStack hooks, query keys, install + push helpers
  testing/                   -- test-only: fixed clock, builders, sampleHouse, fake AppClient, asUser() (db.ts), Mailpit, JWTs
supabase/
  config.toml  migrations/  seed.sql  tests/ (RLS, isolation, setup, jobs; Vitest)
e2e/                         -- Playwright journeys per milestone (m0-sign-in … m4-settings, m4-a11y)
scripts/                     -- env-local, cron-local, test-all, activity-sizing, make-icons
public/
  sw.js  icons/
```

iPhone UX specifics:
- Respect `env(safe-area-inset-*)` for the notch and home indicator. The tab bar sits above the home indicator.
- Use iOS-style bottom **sheets** for create/edit (not full-page navigations). Swipe-to-complete on item rows. Haptics aren't available on the web, so we skip them.
- Font sizes ≥ 16px on inputs (prevents iOS auto-zoom). Use `inputmode` / `type="tel"` etc. for the right keyboards.
- `apple-mobile-web-app-capable`, `theme-color`, a splash/icon set, and `display: standalone`.
- Dark mode follows the system (`prefers-color-scheme`), with a manual override. Tokens are in FRONTEND.md §3.

---

## 9. Environments, CI/CD, and ops

| Item | Decision |
|---|---|
| Repo | Single repo (Next.js app + `supabase/` migrations). No monorepo tooling needed. |
| Environments | `local` (Supabase CLI in Docker, no account; sign-in codes land in its local inbox) is the only environment through M4. M5 adds `preview` (Vercel preview deploys → shared staging Supabase project) and `prod` (A19). |
| Migrations | Supabase CLI SQL migrations, checked in. Applied to staging on merge to `main`, then promoted to prod manually or on a tag. |
| CI (GitHub Actions) | typecheck, lint (**`eslint-plugin-boundaries`**: `domain` imports nothing, `app` imports only `domain` and ports, and only `adapters` + `compose` import Supabase/Kysely/web-push), Vitest (domain + use cases with in-memory adapters), port contract tests against both the memory and Postgres adapters, RLS tests and the Playwright suite (iPhone profile) against local Supabase started in the CI job. From M5 (E4), Playwright also runs on the preview URL. Jobs, commands, and coverage targets: [TESTING.md](./TESTING.md). |
| Secrets | Vercel env vars (service-role key, `SETUP_TOKEN`, VAPID private key, cron secret, Splitwise secret later). The Gmail app password lives only in Supabase's SMTP settings, never in the app. `.env.example` checked in. |
| Backups | Supabase daily backups (Pro), or on the free tier a scheduled `pg_dump` via GitHub Actions to a private storage bucket, weekly |
| Monitoring | Sentry (client + server), Supabase logs, a Vercel Cron failure alert, and an uptime ping (free UptimeRobot/Better Stack) |
| Domain | `*.vercel.app` for v1. A custom domain (~$12/yr) comes with the move to Resend (A18). |

---

## 10. Cost estimate

| Service | Free tier fit | Paid if needed |
|---|---|---|
| Vercel Hobby | Fine for a personal, non-commercial project | Pro $20/mo |
| Supabase Free | 500 MB DB, 1 GB storage, 50k MAU: plenty | Pro $25/mo |
| Gmail (SMTP) | ~500 emails/day free | — |
| Sentry | 5k errors/mo free | — |
| Domain | Not needed (`*.vercel.app`) | ~$12/yr, with Resend later |
| **Total** | **$0/mo** | ~$45/mo if both upgraded |

**Watch out:** Supabase **pauses free projects after ~7 days of inactivity**. The cron jobs above hit the DB constantly, so the project never idles, but verify this. If it pauses, the "always on" requirement breaks, and upgrading to Pro is the fix.

---

## 11. Scalability & future-proofing (brief)

- v1 is one house. Everything is still keyed by `house_id`, so opening it to more houses later means replacing the setup-token bootstrap with a "create a house" flow. The schema and RLS stay the same.
- The only fan-out is notifications, which already go through an outbox. It can move to a proper queue (e.g. Supabase Queues/pgmq) if volume grows.
- If a native app is needed later, `lib/domain` and `lib/app` are framework-free, so an Expo app reuses them as-is and only needs its own adapters and UI.

---

## 12. Risks

| Risk | Mitigation |
|---|---|
| iOS web push only works after Home Screen install, and people won't install | Strong onboarding nudge, email digest fallback |
| Magic link opens outside the installed PWA | Use OTP code entry as the primary method |
| Priority formula feels wrong | "Why is this here?" transparency, house-level presets, tune after 2 weeks of real use |
| Feelings feature feels awkward or passive-aggressive (and they're always named) | Gentle copy, a "not a big deal" option, an optional note to add context, no leaderboard or chore balance |
| Supabase free-tier pause | Cron keeps it active; upgrade if needed |
| RLS mistake leaks data across houses | RLS-on-every-table CI check + explicit cross-house access tests |
| Timezone bugs in recurring chores | House timezone, local-date due dates, tests around DST |

---

## 13. Technical decision log

| # | Question | Decision | Source |
|---|---|---|---|
| A1 | PWA vs React Native vs SwiftUI | PWA | Default |
| A2 | Frontend/backend stack | Next.js + Supabase + Vercel (Vite SPA is the runner-up) | Owner had no preference, so my pick |
| A3 | Auth method | Email 6-digit code, passkeys later | Default |
| A4 | Extra house passcode on invites | No | Default |
| A5 | Priority computed in client TS or SQL | Client TS for v1 | Default |
| A6 | Accounts | New free accounts: GitHub, Vercel, Supabase, and a dedicated house Gmail for sending codes | Default (no preference given), Gmail per A18 |
| A7 | Budget | Free tiers. Upgrade only if the Supabase pause or cron limits bite. | Owner |
| A8 | Scope | One house (setup token for the first account), keep `house_id` everywhere | Owner |
| A9 | Lock invites to specific emails? | No. Public sign-up off, accounts created only via a valid invite. | Owner |
| A10 | Code structure | Ports & adapters: pure domain → use cases with injected deps → adapters. One composition root. Enforced by lint. | Owner (DI request) |
| A11 | Where business logic lives | TS domain + use cases, not Postgres RPCs/triggers. The DB keeps RLS + constraints only. | Owner (DI request) |
| A12 | Writes from the browser | Only through use cases (server actions/routes). Reads via the `HouseQueries` port. | Owner (DI request) |
| A13 | Data objects | Standalone, immutable domain types (discriminated unions), mapped to/from rows in adapters | Owner (DI request) |
| A14 | Activity log + notifications | Domain events recorded in the same transaction (transactional outbox). No triggers. | Owner (DI request) |
| A15 | v1 storage | One `items` table (need / chore / task) with CHECKs. Polls, runs, costs, and feelings are their own tables. Detail tables come back per category only if one grows. | Owner (D18) |
| A16 | v1 scope | Needs, chores, tasks, polls, runs, costs, feeling weights. Bills, belongings, rotations, outside-help stages, heads-ups, info, and email come later. | Owner (D13) |
| A17 | History storage | `items.run_id` holds the current run. `activity_events` (typed subject columns, append-only, `action_id` grouping) is the only history store. `run_items` / `run_claims` dropped. | Owner |
| A18 | Sign-in email sender | A dedicated house Gmail as Supabase custom SMTP, with the app on `*.vercel.app`. No domain in v1. Move to Resend + a custom domain when delivery logs or reminder emails are needed, or if Google flags the account. | Owner |
| A19 | External services | Kept out of M0–M4. The core runs on local Supabase (CLI + Docker) with its local inbox. Hosted Supabase, the Gmail sender, Vercel, Sentry, and on-iPhone checks are the M5 "E" tasks, and no core task depends on them. | Owner |
| A20 | Test suite | One runner (Vitest) for everything but E2E, plus Playwright. RLS tests in Vitest via `asUser()`, not pgTAP. One house per test for isolation. `pnpm test:all` is the gate, and each milestone ends with a test task (Q0–Q6). | Owner |
| A21 | UnitOfWork and EventSink details (T06) | `uow.run` also rolls back when the use case resolves to `{ ok: false }`, so bailing out halfway never leaves partial writes. `EventSink.record(houseId, events, at)` takes the house and the injected `now`, so activity times come from the same clock as the rest of the use case (no `default now()` drift in tests). | Build (T06) |
| A22 | Who can change feeling weights (T25) | Any active member, through the policy "houses members set feeling weights": its WITH CHECK calls `only_feeling_weights_changed(...)`, a stable security-definer helper that compares the new row with the stored one minus `feeling_weights`. A CHECK (`valid_feeling_weights`) keeps each weight a known feeling, −20…+40 in steps of 5. Both are integrity rules like `is_member`, not logic RPCs. House saves never rewrite `created_by` / `created_at`. | Build (T25), per PRD §8.2 (owner) |
| A23 | Where the outbox is written (T33) | `lib/app/notify.ts` wraps the UnitOfWork (`withNotifications`, applied in compose): after `events.record`, it looks up the people, their `notification_prefs`, quiet hours, and what the events are about, and enqueues `notificationsFor(...)` in the same transaction. Adapters stay free of notification rules, and use cases don't change. `notification_prefs` rows are readable by housemates (whoever records an event enqueues for the others). v1 notifies on PRD §11's triggers plus role changes; feeling-weight changes (a Home card instead), new poll options, and point-person changes don't push. | Build (T33) |
| A24 | Naming what activity lines are about (T40) | `HouseQueries.activity` returns each page with `subjects`: the titles, run labels, poll questions, option labels and cost amounts its rows point at, embedded in the same PostgREST request through the `activity_events` foreign keys (the two run keys are named explicitly). One request per page, whatever the size of the house's history; RLS filters embedded rows too. Lines name their topic and open the item, run or poll sheet in place on tap (no route links, so nothing is prefetched). Feelings read as their emoji ("Kavya felt 😰 about Lemons"). | Owner (2026-10-01), built in T40 |
| A25 | Offline behavior (T46) | Online only. The service worker caches build assets, icons and the last copy of each page, and falls back to `/offline`; house data isn't cached or persisted, so nothing is readable or writable offline. The earlier plan (the last cached data, read-only) is dropped, not deferred. | Owner (2026-10-02) |
