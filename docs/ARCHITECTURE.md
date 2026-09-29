# Roomies — Architecture & System Design

**Status:** v1 scope (2026-09-28): one items table, polls, runs, costs. Items point at their current run, and the activity table is the history. DI structure unchanged.
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
- **Next.js on Vercel**: first-class hosting, route handlers for the few things that need secrets (push sending, invite acceptance, cron), and preview deploys per PR.

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
| Data fetching / cache | TanStack Query (with Supabase JS client) |
| Forms + validation | React Hook Form + **Zod** (Zod schemas shared between client and server) |
| DB access (server) | **Kysely** (typed SQL builder) over the Supabase Postgres pooler, used only inside adapters, with transactions for use cases |
| DB types | `supabase gen types typescript` → generated `Database` type, used **only in adapters** (never in domain or UI code) |
| Dates / recurrence | `date-fns` + `date-fns-tz`, `rrule` |
| PWA | Hand-written service worker (push + minimal offline shell), or Serwist |
| Push | `web-push` (VAPID) from a server route |
| Email | A dedicated house Gmail account as Supabase's custom SMTP (`smtp.gmail.com`, app password) for sign-in codes. Required, since Supabase's built-in sender won't reach roommates. Needs no domain. Resend + a custom domain is the upgrade path (A18). Reminder emails come later. |
| Icons | Lucide |
| Testing | Vitest (unit, use case, component, contract, and RLS/constraint tests), Playwright with the iPhone 15 device profile (e2e) and axe. One command, `pnpm test:all`. See [TESTING.md](./TESTING.md). |
| Errors / monitoring | Sentry (free tier), Vercel Analytics |

---

## 4. System overview

```
 iPhone (Safari / installed PWA)
 ┌──────────────────────────────────────────┐
 │ Next.js React app + Service Worker       │
 │  - Supabase JS client (auth session)     │
 │  - TanStack Query cache                  │
 │  - Realtime subscription (house channel) │
 └───────────┬───────────────────┬──────────┘
             │ HTTPS             │ WebSocket (Realtime)
             ▼                   ▼
 ┌────────────────────┐   ┌──────────────────────────────────────┐
 │ Vercel             │   │ Supabase                             │
 │ - SSR / static     │   │  Auth (email code, passkeys later)   │
 │ - Use cases (§4.1) │──▶│  Postgres + RLS                      │
 │   • push send      │   │   - tables, RLS, constraints         │
 │   • splitwise oauth│   │   - (no business logic; see §4.1)    │
 │   • invite accept  │   │  Storage (attachments, RLS)          │
 │ - /api/cron/* ◀────┼───│  Realtime (postgres_changes)         │
 └────────┬───────────┘   │  pg_cron + pg_net (calls /api/cron)  │
          │               └──────────────────────────────────────┘
          ▼
   Web Push services (Apple / Google / Mozilla)    Gmail (sign-in codes, via Supabase SMTP)
```

**Data access pattern [DECIDED] (revised in v1.0; see §4.1):**
- **All writes** go through server-side **use cases** (Next.js server actions and route handlers). The browser never writes to tables directly.
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
 │  standalone types (§6.3) + pure functions (§7.2b)                    │
 │  no I/O, no Date.now(), no random ids, no imports outside domain/    │
 └─────────────────────────────────────────────────────────────────────┘
        ▲ implements
 ┌──────┴──────────────────────────────────────────────────────────────┐
 │ Adapters                      lib/adapters/                         │
 │  postgres (Kysely) · supabase-browser · supabase-auth · web-push ·   │
 │  system-clock · crypto-ids · in-memory fakes                         │
 └─────────────────────────────────────────────────────────────────────┘
```

**Rules**
1. **Domain** imports nothing outside `lib/domain/`. Time, ids, and settings are passed in as arguments. Functions return values (including `Result<T, E>` for expected failures) and never throw for business rules.
2. **Use cases** receive every dependency through a `deps` argument (**constructor/factory injection, no service locator, no DI container**). A use case never reads `process.env`, never imports an adapter, and never calls `new Date()`.
3. **Adapters** are the only code that knows about Supabase, Postgres rows, Kysely, or `web-push`. Generated DB types stay here. Adapters map rows ↔ domain types with explicit `toDomain` / `toRow` functions.
4. **Entry points** are thin. They validate input with Zod, build deps via the composition root, call one use case, and map `Result` to an HTTP/action response. No business logic.
5. **Every port has an in-memory fake** in `lib/adapters/memory/`, used by unit tests and Storybook. The same contract test suite runs against the fake and the Postgres adapter.

**Ports** (interfaces in `lib/app/ports.ts`)

| Port | Methods (abridged) | Production adapter | Test adapter |
|---|---|---|---|
| `UnitOfWork` | `run<T>(actor, fn: (repos: Repos) => Promise<T>): Promise<T>`, one transaction per call. It rolls back when `fn` throws **or resolves to a failed `Result`** (A21). | Postgres: `begin` → `set local role authenticated` + `set_config('request.jwt.claims', …)` so **RLS still applies** → `commit` | in-memory (copy-on-write) |
| `Repos` (inside a UoW) | `items`, `feelings`, `polls`, `runs`, `costs`, `settings`, `members`, `invites`, `contacts`: each with `get` / `find…` / `save` | Kysely queries | Maps |
| `EventSink` (inside a UoW) | `record(houseId, events: DomainEvent[], at: Instant)`: stamps rows with the injected clock's `at` (A21), and writes `activity_events` + `notifications_outbox` in the **same transaction** (transactional outbox) | Postgres | array |
| `Clock` | `now(): Instant` | `systemClock` | `fixedClock(t)` |
| `IdGenerator` | `newId<K>(): Id<K>` | `crypto.randomUUID` | sequential |
| `HouseQueries` (read side) | `feed(houseId)`, `needs(houseId)`, `chores(houseId)`, `tasks(houseId)`, `openPolls(houseId)`, `openRuns(houseId)`, `calendar(houseId, range)`, `item(id)`, … returning domain types | Supabase browser client (RLS) | fixtures |
| `ChangeFeed` | `subscribe(houseId, onChange): Unsubscribe` | Supabase Realtime | manual emitter |
| `AuthGateway` | `createUser(email)`, `sendOtp(email)`, `verifyOtp(email, code)`, `deleteUser(id)` | Supabase Auth admin | fake |
| `PushSender` | `send(subscription, message): Result<void, 'gone' \| 'failed'>` | `web-push` (VAPID) | recorder |
| `Config` | typed values (`setupToken`, `vapid`, `cronSecret`, …) | `loadConfig(process.env)` validated by Zod, **the only place env is read** | literal object |

**Composition root** (`lib/compose.ts`), the one place where concrete adapters are wired:
- `depsForRequest(session): AppDeps`: Postgres UoW bound to the signed-in user (RLS applies), system clock, crypto ids, config.
- `depsForJob(): AppDeps`: the same, but the actor is `{ kind: 'system' }` and the UoW uses the service connection. Jobs call the **same use cases** as users do.
- `depsForTest(overrides?): AppDeps`: in-memory adapters + fixed clock.

**In the UI**, components get data and commands through an `AppClient` interface provided by React context (`<AppClientProvider>`). Hooks such as `useFeed()` and `useFinishRun()` depend on that interface, not on Supabase or on specific server actions. Storybook and component tests inject a fake `AppClient`.

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

1. The admin creates an invite → a row in `house_invites` with a random 128-bit token (stored **hashed**), `expires_at`, `max_uses`, `revoked_at`.
2. The link `https://<app>/join/<token>` is shared in the group chat.
3. A visitor opens the link and enters their name and email. The client calls `POST /api/invites/start` with the token and email.
4. The `startInvite` use case (system actor) runs the pure `validateInvite` check on the hash, expiry, uses, and revocation. Only if the token is valid does it create the auth user (Supabase Admin API) and send the 6-digit code. **Public sign-up is turned off** in Supabase Auth settings, so an email typed into the regular sign-in screen without a valid invite gets no code and no account.
5. The visitor enters the code → `POST /api/invites/accept` runs the `acceptInvite` use case, which inserts `house_members(house_id, user_id, role='member', status='active')`, increments uses, writes an activity event, and notifies all members. **(owner)** There's no approval step.
6. **Returning sign-in** (`/sign-in`): the client calls `signInWithOtp({ email, options: { shouldCreateUser: false } })`. With public sign-up also disabled server-side, this only sends a code to emails that already have an account. The UI shows the same "If you have an account, we sent a code" message either way, so it doesn't reveal who's a member.
7. From then on, **every table row carries `house_id`**, and RLS policies allow access only when `is_member(house_id)` is true for `auth.uid()`. Server-side use cases keep this protection: the Postgres `UnitOfWork` sets `role authenticated` and the user's JWT claims per transaction (§4.1).

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
create policy "members read"  on items for select using (is_member(house_id));
create policy "members write" on items for insert with check (is_member(house_id) and created_by = auth.uid());
create policy "members edit"  on items for update using (is_member(house_id)) with check (is_member(house_id));
-- no delete policy: soft-delete via archived_at only
```

Admin-only actions (invites, removing members, house settings) use an `is_admin(house_id)` policy.

**[DECIDED] A4:** no extra "house passcode" on invites. Joins notify everyone, links expire and can be revoked, and admins can remove people in one tap.

**Single-house bootstrap (owner: one house only):** the very first account (you) is created with a one-time `SETUP_TOKEN` env var. Visiting `/setup/<SETUP_TOKEN>` lets you create the house and become admin. After that, the route is permanently disabled once a house exists. It's also blocked by an RLS insert policy on `houses` requiring `(select count(*) from houses) = 0`. This avoids a "whoever signs in first owns the house" race.

**Who can join, summarized:**

| Situation | Result |
|---|---|
| Stranger finds the app URL and types their email | Nothing. Public sign-up is off, so no code is sent and no account is created. |
| Someone has a valid, unexpired invite link | They can join. A forwarded link works too, which is why joins notify everyone and links have `max_uses` (default = number of open spots) and a 7-day expiry. |
| Link is expired, revoked, or used up | "This invite is no longer valid. Ask a roommate for a new one." |
| Former roommate (marked moved out) | Can still sign in, but RLS returns no house data. They see "You're no longer a member." |

**[DECIDED] (owner) A9: invites are not locked to specific emails.** Expiry, `max_uses`, and join notifications are enough for a house of friends. Changing this later would just mean adding an optional `email` column to `house_invites` and checking it in `/api/invites/start`.

### 5.3 Where user data lives

| Data | Stored in | Notes |
|---|---|---|
| Email address, account ID, sign-in timestamps | Supabase Auth (`auth.users` table in *your* Supabase project's Postgres) | Managed by Supabase. We never store passwords, because there are none. |
| The 6-digit code | Supabase Auth, **hashed**, single use | Expires after 10 minutes (we set this, default is 1h). Rate-limited per email/IP. |
| Session | A refresh token in Supabase Auth, plus an access token (JWT) in the phone's browser storage/cookie | Signing out, or an admin removing a member, revokes it |
| Display name, timezone, quiet hours | Our `profiles` table (same database) | Readable only by members of the same house |
| House data (items, feelings, polls, runs, costs) | Our tables + Supabase Storage, same project | Access controlled by RLS as above |

- **Physical location:** one Supabase project in the region you pick when creating it (e.g. `us-east-1`). The data is encrypted at rest and in transit (TLS). Only you, as the Supabase project owner, can see the raw tables in the dashboard.
- **Who else touches it:**
  - **Gmail** (a dedicated house account) sends the code emails, so it sees email addresses and codes, and keeps a copy of each in its Sent folder. Codes expire in 10 minutes, so the copies are harmless.
  - **Vercel** sees requests passing through the server routes, but it doesn't store user data beyond short-lived logs.
  - **Sentry** is configured to scrub emails and request bodies.
- **Email sending needs custom SMTP.** Supabase's built-in email service only delivers to your own team's addresses and is heavily rate-limited, so custom SMTP is required before roommates can sign in. v1 uses a Gmail account made just for this (2-step verification on, an app password as the SMTP password), which sends about 500 emails a day with no domain. Never use a personal Gmail: the app password can read and send that account's mail. If Google flags the account or the password changes, sign-in emails stop, so moving to Resend is a settings change in Supabase, not a code change (A18).
- **Deleting an account:** a "Delete my account" option in settings removes the auth user and profile. Their name on past items becomes "Former roommate."

### 5.4 Other security decisions [DECIDED]

- RLS is **enabled on every table**, and a CI test fails if any public table lacks RLS.
- The service-role key lives only in Vercel server env vars and is never shipped to the client.
- **Sensitive fields** (Wi‑Fi, door codes) come later with info items (PRD §13). v1 stores no secrets.
- File attachments come later (PRD §13). When added: private buckets, `house/<house_id>/<item_id>/<file>` paths, and signed URLs.
- Rate limits: Supabase Auth's built-in OTP limits, plus our own limit on `/api/invites/start`, `/api/invites/accept`, and `/setup` per IP (a simple Postgres counter table, no extra vendor). Invalid-token attempts are logged.
- CSP headers, `SameSite=Lax` cookies, and no third-party scripts besides Sentry.

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

```
-- house & people (unchanged) -------------------------------------------------------
profiles        (id = auth.users.id, display_name, theme: auto|light|dark, timezone, quiet_start, quiet_end, created_at)
houses          (id, name, address, unit, created_by, created_at,
                 settings jsonb)   -- { timezone, feeling_weights: {anxious:20, frustrated:15, confused:5, fine:0, meh:-5, thanks:0}, invite_ttl_days }
house_members   (house_id, user_id, role: admin|member, status: active|moved_out, room_id null, joined_at, left_at)  PK(house_id, user_id)
rooms           (id, house_id, name, floor: first|basement|outside, kind, element: air|fire|water|earth|null, sort_order, archived_at)
house_invites   (id, house_id, token_hash, created_by, expires_at, max_uses, uses, revoked_at)
contacts        (id, house_id, name, phone null, note null)

-- items: needs, chores, tasks ----------------------------------------------------
items           (id, house_id,
                 category: need|chore|task,                 -- never changes (D15)
                 title, note null, room_id null,
                 assignee_id null,                          -- "who's on it"; null = anyone
                 when_at null, when_has_time bool,          -- due / needed by / scheduled
                 priority: low|normal|high|urgent  default 'normal',
                 repeat_days int null,                      -- chores only: null = as needed
                 last_done_at null, last_done_by null,      -- chores only
                 contact_id null,                           -- tasks only: "handled by"
                 done_at null, done_by null,                -- needs & tasks (chores use last_done_*)
                 run_id null, run_kind null,                -- the run it's on RIGHT NOW (null = in the pool); history is in activity_events
                 created_by, created_at, updated_at, archived_at null)
                 foreign key (run_id, run_kind) references runs (id, kind)
                 check ((run_id is null) = (run_kind is null))
                 check (run_kind is null or run_kind = 'batch' or category = 'task')   -- requests & visits hold tasks only
                 check (run_id is null or (done_at is null and archived_at is null))  -- done/archived items aren't on a run
                 check (category = 'chore' or (repeat_days is null and last_done_at is null and last_done_by is null))
                 check (category = 'task'  or contact_id is null)
                 check (category <> 'chore' or done_at is null)          -- chores are never "done", only "last done"
                 unique (house_id, lower(title)) where category = 'need' and done_at is null and archived_at is null
                                                                          -- adding a need that's already open points to it

feelings        (item_id, user_id, house_id, kind: anxious|frustrated|confused|fine|meh|thanks, note null, updated_at)
                 PK(item_id, user_id)       -- previous versions come from activity_events for the "Earlier" list

-- polls --------------------------------------------------------------------------
polls           (id, house_id, question, item_id null,      -- about an item, or standalone ("house name")
                 closes_at null, closed_at null, created_by, created_at)
poll_options    (id, poll_id, label, note null, added_by, added_at, sort_order)
                 unique (poll_id, lower(label))           -- options can be added while the poll is open
poll_votes      (poll_id, user_id, option_id, voted_at)     PK(poll_id, user_id)   -- one vote each, changeable while open

-- runs ---------------------------------------------------------------------------
runs            (id, house_id, kind: batch|request|visit, title,
                 runner_id,                                 -- batch: who's doing it · request/visit: house point person
                 contact_id null,                           -- required for request & visit, null for batch
                 when_at null, when_has_time bool,          -- batch & visit only (a visit's date is optional)
                 status: open|finished|gathering|sent|closed,   -- one column; allowed values depend on kind
                 sent_at null, sent_via: text|email|call|portal|in_person  null,   -- requests only
                 finished_at null, created_by, created_at)
                 check ((kind = 'batch') = (contact_id is null))
                 check (case kind when 'request' then status in ('gathering','sent','closed')
                                  else status in ('open','finished') end)
                 check (kind = 'request' or (sent_at is null and sent_via is null))
                 check (kind <> 'request' or when_at is null)
                 check (status <> 'sent' or sent_at is not null)
                 unique (id, kind)                          -- target for items' (run_id, run_kind) foreign key
                 -- a run's contents = items where run_id = runs.id; what used to be on it = activity_events (§6.4)

-- money --------------------------------------------------------------------------
costs           (id, house_id, amount_cents, paid_by, note null,
                 item_id null, run_id null,                 -- what it was for (at most one)
                 splitwise_copied_at null, created_by, created_at)
                 check (num_nonnulls(item_id, run_id) <= 1)

-- infrastructure (unchanged) -----------------------------------------------------
activity_events       (see §6.4: typed subject columns, append-only; the source of all history)
push_subscriptions    (id, user_id, endpoint, p256dh, auth, user_agent, created_at, last_ok_at)
notification_prefs    (user_id, category, enabled)
notifications_outbox  (id, user_id, house_id, category, title, body, url, send_after, sent_at, error)
```

**7 app tables** (items, feelings, polls, poll_options, poll_votes, runs, costs) plus `activity_events` (history) and house, people, and infrastructure. Every table has `house_id` (directly or through its parent) and RLS via `is_member(house_id)` (§5.2).

Indexes: `items(house_id, category) where archived_at is null`, `items(house_id, when_at) where when_at is not null`, `items(run_id) where run_id is not null`, `runs(house_id, status, when_at)`, `polls(house_id) where closed_at is null`, `costs(house_id, created_at)`, `activity_events(house_id, created_at desc)`, `notifications_outbox(sent_at) where sent_at is null`.

**Money** is integer cents. **Time** is `timestamptz` in UTC, and dates without a time are interpreted in the house timezone.

### 6.3 Domain model: standalone types (`lib/domain/types.ts`)

Plain, immutable, serializable objects, and **discriminated unions** so invalid states can't be represented (a need can't have a repeat, a chore can't be "done"). Adapters map rows ↔ these types.

```ts
// ---- primitives ----
type Id<K extends string> = string & { readonly __id: K }
type UserId = Id<'user'>; type HouseId = Id<'house'>; type ItemId = Id<'item'>; type RoomId = Id<'room'>
type ContactId = Id<'contact'>; type PollId = Id<'poll'>; type OptionId = Id<'option'>; type RunId = Id<'run'>; type CostId = Id<'cost'>; type ActionId = Id<'action'>
type Instant = { readonly epochMs: number }
type When = { date: LocalDate; time?: string }           // local to the house timezone
type LocalDate = `${number}-${number}-${number}`
type Cents = number & { readonly __cents: true }
type Actor = { kind: 'member'; userId: UserId; houseId: HouseId } | { kind: 'system'; houseId: HouseId }
type Result<T, E extends string> = { ok: true; value: T } | { ok: false; error: E }

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
  options: readonly { id: OptionId; label: string; note?: string; addedBy: UserId }[]
  votes: readonly { user: UserId; option: OptionId }[]
  closesAt?: Instant; createdBy: UserId
  state: { open: true } | { open: false; closedAt: Instant; result: { winner: OptionId } | { tie: readonly OptionId[] } | { noVotes: true } } }

// ---- runs ----
// a run's current contents are the items whose `run.id` points at it (loaded alongside); its history is RunStep[] (below)
type Run = { id: RunId; houseId: HouseId; title: string; runner: UserId } & (
  | { kind: 'batch'; when?: When; state: { open: true } | { open: false; finishedAt: Instant } }
  | { kind: 'request'; contactId: ContactId
      state: { at: 'gathering' } | { at: 'sent'; sentAt: Instant; via: 'text' | 'email' | 'call' | 'portal' | 'in_person' } | { at: 'closed'; closedAt: Instant } }
  | { kind: 'visit'; contactId: ContactId; when?: When; state: { open: true } | { open: false; finishedAt: Instant } }
)

// ---- money ----
type Cost = { id: CostId; houseId: HouseId; amount: Cents; paidBy: UserId; note?: string
  for?: { item: ItemId } | { run: RunId }; createdAt: Instant }

// history of items on runs, read back from activity_events
type RunStep = { at: Instant; by: UserId | null; itemId: ItemId; runId: RunId; note?: string
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
  check (kind not like 'feeling.%'  or item_id is not null),
  check (kind not like 'run.item_%' or (item_id is not null and run_id is not null)),
  check ((kind = 'run.item_moved') = (to_run_id is not null)),
  check (kind not like 'poll.%'     or poll_id is not null),
  check (kind not like 'cost.%'     or cost_id is not null),
  check (kind not like 'member.%'   or member_id is not null),
  check (kind not like 'contact.%'  or contact_id is not null),
  check (kind not like 'room.%'     or room_id is not null)
);

create index on activity_events (house_id, id desc);                                   -- Activity screen
create index on activity_events (item_id, id)  where item_id  is not null;             -- item history, Earlier feelings
create index on activity_events (run_id, id)   where run_id   is not null;             -- a run's story
create index on activity_events (to_run_id)    where to_run_id is not null;
create index on activity_events (poll_id, id)  where poll_id  is not null;
create index on activity_events (action_id);                                           -- grouping bulk actions
```

**Rules**
- **Append-only.** RLS lets members **read** their house's rows. There's no update/delete policy, and the app role has no `UPDATE`/`DELETE` grant. Undo writes a new event (`item.reopened`, `chore.undone`, `poll.reopened`). It never removes one.
- **Written by `EventSink` in the same transaction** as the change. No triggers.
- **One row per subject.** A bulk action writes one row per item, sharing an `action_id`. The Activity screen groups rows by `action_id` into one line ("Kavya moved 3 tasks to Landlord visit").
- **Queried fields are columns, never `payload`.** `changes` holds field diffs (varying shape), and `payload` holds versioned extras (`{"v":1, …}`). Sizing, measured in T07 (`pnpm db:sizing`): 148–264 bytes per row depending on kind (feelings with a note are the largest), about **405 bytes/row on disk** including the six indexes and page overhead. At 50 events a day that's roughly **37 MB after 5 years** for one house (the pre-build estimate was ~30 MB).
- **Deleted accounts** keep their rows. The profile is anonymized and shows as "Former roommate."
- `activityRowFor(event)` is pure (it maps a `DomainEvent` to a row), and `activityLine(rows)` is pure (it groups by `action_id` and phrases the feed line).

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

**Not in this table:** failed invite or sign-in attempts (a service-role-only `security_events` table or logs), notification delivery (`notifications_outbox`), views, and computed priority.

---

## 7. Key flows

### 7.1 Priority

- **One pure function:** `scorePriority(item, feelings, weights, now, tz): { score, tier, breakdown }`. `weights` comes from `HouseSettings.feelingWeights`, and `now` is an argument. It runs in the browser (feed), in jobs, and in tests with a fixed clock.
- **`isInFeed(item, feelings, openRun, now, tz)`** applies the PRD §8.1 rules: tasks not done (except those on a visit, unless there's a feeling or the visit is within 3 days), chores past their rhythm or with a feeling, and needs with a feeling or needed-by within 7 days.
- **Never stored**, because it depends on today's date.

### 7.2 Function catalog

**Domain functions** (`lib/domain/*.ts`, pure: no I/O, time and ids passed in)

| Function | Signature | Notes |
|---|---|---|
| `scorePriority` | `(i: Item, f: Feeling[], w: FeelingWeights, now: Instant, tz) → { score, tier, breakdown }` | PRD §8.1 |
| `isInFeed` | `(i: Item, f: Feeling[], now: Instant, tz) → boolean` | |
| `createItem` | `(input: NewItem, by: UserId, now: Instant, id: ItemId, openNeeds: Need[]) → Result<{ item; events }, 'duplicate_need'>` | A duplicate open need returns the existing one's id in the error |
| `editItem` | `(i: Item, patch: ItemPatch, by, now) → Result<{ item; events }, 'invalid_for_category'>` | Category can't change |
| `markDone` | `(i: Need \| Task, by, now) → Result<{ item; events }, 'already_done'>` | |
| `doChore` | `(c: Chore, by, now) → { chore; events }` | Updates last done |
| `setFeeling` | `(current: Feeling \| null, next: Feeling \| null) → { feeling; events }` | The event carries `previous` |
| `validateWeights` / `setFeelingWeights` | `(w: FeelingWeights) → Result<FeelingWeights, 'out_of_range'>` / `(s: HouseSettings, w, by) → { settings; events }` | −20…+40, steps of 5 |
| `createPoll` | `(input: NewPoll, by, now, ids) → Result<{ poll; events }, 'needs_two_options'>` | |
| `vote` | `(p: Poll, user, option) → Result<{ poll; events }, 'closed' \| 'unknown_option'>` | Changing a vote replaces it |
| `addPollOption` | `(p: Poll, label, note?, by: UserId, id: OptionId) → Result<{ poll; events }, 'closed' \| 'duplicate_label' \| 'empty'>` | Any member, while open. Existing votes are untouched. |
| `setHandledBy` | `(t: Task, contact: ContactId \| null, by) → { task; events }` | Via `editItem`. Only tasks accept a contact. |
| `closePoll` | `(p: Poll, now) → { poll; events }` | Most votes wins, a tie → `{ tie }`, and no votes → `{ noVotes }` (D3) |
| `startRun` / `startRequest` / `planVisit` | `(input, items: Item[], by, now, runId, actionId) → Result<{ run; items; events }, 'nothing_selected' \| 'already_on_a_run' \| 'done_item' \| 'tasks_only'>` | Sets `item.run` on each item. A request may start empty. A visit's date is optional. |
| `addToRequest` | `(t: Task, open: Run[], by, now, newId) → { run; task; events }` | Joins the contact's gathering request, or starts one |
| `addToRun` | `(r: Run, items: Item[], by, now, actionId) → Result<{ items; events }, 'finished' \| 'already_on_a_run' \| 'request_sent' \| 'tasks_only'>` | A sent request is closed to additions |
| `sendRequest` | `(r: Request, via, now) → Result<{ run; message: string; events }, 'not_gathering' \| 'empty'>` | Builds the numbered message and moves to `sent` |
| `moveRunItems` | `(from: Run, to: Run, items: Item[], remainingOnFrom: number, note?, by, now, actionId) → Result<{ items; from; events }, 'not_on_run' \| 'target_closed' \| 'tasks_only'>` | Points each item at `to` (and sets "Handled by" to its contact). Closes `from` if it's a request left empty. |
| `returnToPool` | `(from: Run, items: Item[], note, clearContact: boolean, remainingOnFrom, by, now, actionId) → { items; from; events }` | Clears `item.run` |
| `handToContact` | `(from: Run, items: Task[], contact, gathering: Request \| null, note?, by, now, ids) → { to; items; from; events }` | `to` = the contact's gathering request (new if none) |
| `markRunItemsDone` | `(r: Run, items: Item[], by, now, actionId) → { items; events }` | Done (or last done for chores) and clears `item.run` |
| `finishRun` | `(r: Batch \| Visit, stillOn: Item[], now, actionId) → { run; items; events }` | Items still on it go back to the pool with "Not done this time" (one `run.item_returned` each) |
| `runHistory` / `itemPath` | `(rows: ActivityRow[]) → RunStep[]` | Pure readers over the activity queries in §6.4 |
| `addCost` | `(input: NewCost, by, now, id) → Result<{ cost; events }, 'not_positive'>` | |
| `monthlySpend` | `(costs: Cost[], members: UserId[], month) → { total: Cents; perPerson: Cents }` | Equal split |
| `validateInvite` | `(inv: Invite, tokenHash, now) → Result<Invite, 'invalid' \| 'expired' \| 'revoked' \| 'used_up'>` | |
| `activityRowFor` / `activityLine` / `notificationsFor` | `(e: DomainEvent) → ActivityRow` / `(rows sharing an action_id) → FeedLine` / `(e, members, prefs, now, tz) → OutboxMessage[]` | Quiet hours + prefs applied in `notificationsFor` |

**Use cases** (`lib/app/*.ts`). Each is built as `makeX(deps)`, then called as `(actor, input) → Promise<Result<Out, Err>>` in one `UnitOfWork` transaction.

| Use case | Input | Output | Errors | Deps |
|---|---|---|---|---|
| `createItem` / `editItem` / `archiveItem` | `NewItem` / `{ id, patch }` / `{ id }` | `Item` | `duplicate_need`, `invalid_for_category`, `not_found` | uow, clock, ids |
| `markDone` / `doChore` | `{ id }` | `Item` | `already_done`, `not_found` | uow, clock |
| `setFeeling` | `{ itemId, kind \| null, note? }` | `Feeling \| null` | `not_found` | uow, clock |
| `setFeelingWeights` | `{ weights }` (any member) | `HouseSettings` | `out_of_range` | uow |
| `createPoll` / `addPollOption` / `vote` / `closePoll` | `NewPoll` / `{ pollId, label, note? }` / `{ pollId, optionId }` / `{ pollId }` | `Poll` | `needs_two_options`, `closed`, `duplicate_label` | uow, clock, ids |
| `setHandledBy` / `createContact` | `{ taskId, contactId \| null }` / `{ name, phone? }` | `Task` / `Contact` | `not_a_task` | uow, ids |
| `startRun` / `startRequest` / `planVisit` / `addToRun` / `addToRequest` | `NewRun` / `{ contactId \| newContact, taskIds[] }` / `NewVisit` / `{ runId, itemIds }` / `{ taskId }` | `Run` | `nothing_selected`, `already_on_a_run`, `finished`, `request_sent`, `tasks_only` | uow, clock, ids |
| `sendRequest` | `{ runId, via }` | `{ run, message }` | `not_gathering`, `empty` | uow, clock |
| `moveRunItems` / `returnToPool` / `handToContact` / `markRunItemsDone` | `{ fromRunId, itemIds, toRunId \| newVisit, note? }` / `{ runId, itemIds, note, clearContact }` / `{ runId, itemIds, contactId \| newContact, note? }` / `{ runId, itemIds }` | `Run[]` | `not_pending`, `target_closed`, `tasks_only` | uow, clock, ids |
| `setVisitDate` | `{ runId, when \| null }` | `Run` | `not_a_visit` | uow |
| `finishRun` | `{ runId, spentCents? }` | `{ run, cost? }` | `finished`, `not_found` | uow, clock, ids |
| `addCost` | `{ amountCents, forItem? \| forRun?, note? }` | `Cost` | `not_positive` | uow, clock, ids |
| `setupHouse` / `startInvite` / `acceptInvite` | as before | `House` / `void` / `Member` | as before | uow, clock, ids, auth, config |
| **Jobs:** `runReminders`, `sendNotifications`, `closeDuePolls` | `{ now? }` | counts | none | uow, clock, push |

**Worked example: `finishRun`**

```ts
export const makeFinishRun = ({ uow, clock, ids }: Pick<AppDeps, 'uow' | 'clock' | 'ids'>) =>
  (actor: Actor, input: FinishRunInput): Promise<Result<FinishRunOutput, FinishRunError>> =>
    uow.run(actor, async (repos) => {
      const run = await repos.runs.get(input.runId)
      if (!run) return err('not_found')
      if (!run.state.open) return err('finished')

      const now = clock.now(), actionId = ids.newId<'action'>()
      const stillOn = await repos.items.onRun(run.id)
      const { run: finished, items, events } = domain.finishRun(run, stillOn, now, actionId)  // pure
      await repos.items.saveAll(items)                                                       // run_id cleared
      await repos.runs.save(finished)

      let cost: Cost | undefined
      if (input.spentCents) {
        const r = domain.addCost({ amount: input.spentCents, for: { run: run.id } }, actorUser(actor), now, ids.newId())
        if (r.ok) { cost = r.value.cost; await repos.costs.save(cost); events.push(...r.value.events) }
      }
      await repos.events.record(run.houseId, events, now)                                    // activity + outbox, same tx
      return ok({ run: finished, cost })
    })
```

### 7.2c Moving items between runs

```sql
begin;
  update items set run_id = :to_run, run_kind = :to_kind,
                   contact_id = coalesce(:to_contact, contact_id)       -- requests/visits: "handled by" follows the run
   where id = :item and run_id = :from_run;                             -- 0 rows → someone already moved it → `not_on_run`
  insert into activity_events (house_id, actor_id, action_id, kind, item_id, run_id, to_run_id, note)
  values (:house, :user, :action, 'run.item_moved', :item, :from_run, :to_run, :note);
  -- if :from_run is a request and no items point at it anymore: update runs set status = 'closed' + 'request.closed' event
commit;
```

**Back to the pool:** `run_id = null` + `run.item_returned` (with the note). **Done:** `run_id = null`, `done_at = now()` + `run.item_done`. **Finish:** every item still on the run gets `run_id = null` + its own `run.item_returned`, then the run is `finished`. **The database enforces "tasks only on requests and visits"** through `items.run_kind` (a composite foreign key + CHECK).

### 7.3 Scheduled jobs

Jobs are **use cases** called by `/api/cron/*` (secret header) with `depsForJob()`, triggered by **Supabase pg_cron + pg_net** (free). **[DECIDED]**

| Job | Frequency | Does |
|---|---|---|
| `runReminders` | every 15 min | Due-tomorrow / due-today tasks and chores (assignee), polls closing tomorrow, and runs with a date tomorrow → outbox (idempotent key per user/item/day) |
| `sendNotifications` | every 5 min (plus right after any use case that enqueued) | Sends pending outbox rows by Web Push, respecting quiet hours. Drops dead subscriptions. |
| `closeDuePolls` | hourly | Closes polls past `closes_at` and records the result |

Immediate notifications (assigned, 😰/😤, new poll, run started) come from the use case's events via `notificationsFor` and are written to the outbox in the same transaction.

### 7.4 Web Push on iOS

- Requires the PWA to be **installed to the Home Screen** (iOS 16.4+), a user gesture to request permission, and a VAPID key pair.
- Flow: the user taps "Enable notifications" → `Notification.requestPermission()` → `pushManager.subscribe({ applicationServerKey })` → POST to `/api/push/subscribe` → stored in `push_subscriptions`.
- The server sends with `web-push`. A 404/410 response deletes the subscription.
- The service worker handles `push` (show) and `notificationclick` (open the deep link).
- The email digest fallback is **later** (PRD §13).

### 7.5 Realtime

- The client subscribes to `postgres_changes` on house-scoped tables filtered by `house_id`. Supabase Realtime respects RLS.
- On an event, the client invalidates the matching TanStack Query keys.
- Conflicts: **last write wins** per field. An item can only be on one run because it has one `run_id`. Moves update `where id = :item and run_id = :from`, so a race updates 0 rows and returns `not_on_run`. Saves use optimistic concurrency (`where updated_at = :loaded`) and map a lost race to `conflict`.

### 7.6 Splitwise

v1 is a link-out only: copy "{title} — ${amount}" and open Splitwise, then record `splitwise_copied_at` on the cost. The API integration is later.

### 7.7 Offline behavior

**[DECIDED] Online-first.** The service worker caches the app shell and shows the last cached data read-only when offline. Writes need connectivity.

---

## 8. Frontend architecture

Visual design, the color system, rooms/avatars, motion, and copy rules live in [FRONTEND.md](./FRONTEND.md). This section covers only code structure.

```
app/
  (auth)/sign-in, verify     -- returning users only (shouldCreateUser: false)
  join/[token]               -- name + email → code → join
  setup/[setupToken]         -- one-time house creation, disabled once a house exists
  h/[houseId]/
    layout.tsx         -- tab bar, house context, realtime subscription
    page.tsx           -- Home feed
    needs/  chores/  tasks/  house/  calendar/
    i/[itemId]/  p/[pollId]/  r/[runId]/   -- item, poll, and run detail
    activity/  settings/
  api/
    invites/start  invites/accept  setup  account/delete  push/subscribe  cron/*  splitwise/*
components/
  ui/                  -- Card, Button, Chip (type/room/tier), Avatar (initials + element), Sheet, TabBar, ListRow, SegmentedControl, Toast, EmptyState
  rooms/               -- RoomPicker (grouped by floor), RoomList, RoomChip
  items/               -- ItemCard, ItemForm (per-category fields), FeelingPicker
  polls/  runs/        -- PollCard, PollSheet, RunPicker, RunChecklist, SpentSheet
lib/
  domain/              -- PURE: types.ts, items.ts, priority.ts, polls.ts, runs.ts, costs.ts,
                          settings.ts, invites.ts, events.ts, notifications.ts
  app/                 -- use cases (makeX(deps)), ports.ts (interfaces), errors.ts
  adapters/
    postgres/          -- Kysely UoW + repos, row ↔ domain mappers, generated DB types live here
    supabase/          -- browser HouseQueries + ChangeFeed, AuthGateway
    push/ clock/ ids/
    memory/            -- in-memory fakes for every port (tests, Storybook)
    contracts/         -- shared contract suites, run against memory + Postgres
  compose.ts           -- composition root: depsForRequest / depsForJob / depsForTest
  config.ts            -- loadConfig(env) (the only process.env reader)
  schemas/             -- Zod input schemas for entry points (derived from domain types)
  client/              -- AppClient interface + React context + hooks (useFeed, useFinishRun, …)
  testing/             -- test-only: fixedClock, seqIds, builders, sampleHouse, asUser()
supabase/
  migrations/  seed.sql  tests/ (RLS + constraint tests, Vitest)
e2e/                   -- Playwright journeys per milestone (m0-sign-in … m4-notifications) + smoke
public/
  manifest.webmanifest  icons/  sw.js
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
| A20 | Test suite | One runner (Vitest) for everything but E2E, plus Playwright. RLS tests in Vitest via `asUser()`, not pgTAP. One house per test for isolation. `pnpm test:all` is the gate, and each milestone ends with a test task (Q0–Q5). | Owner |
| A21 | UnitOfWork and EventSink details (T06) | `uow.run` also rolls back when the use case resolves to `{ ok: false }`, so bailing out halfway never leaves partial writes. `EventSink.record(houseId, events, at)` takes the house and the injected `now`, so activity times come from the same clock as the rest of the use case (no `default now()` drift in tests). | Build (T06) |
