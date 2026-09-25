# Roomies — Architecture & System Design

**Status:** Draft v1.0 (dependency injection, use-case catalog, standalone domain types, 2026-09-25)
**Companions:** [PRD.md](./PRD.md) · [FRONTEND.md](./FRONTEND.md) (visual design, UI, copy)
**Last updated:** 2026-09-24

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
| Reminders, repeating chores, vote deadlines, heads-up reminders | Need **scheduled jobs** (cron) |
| Notifications on iPhone | **Web Push** (iOS 16.4+, only when installed to the Home Screen) + email fallback |
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

- **Supabase** gives relational Postgres (a natural fit for houses, members, artifacts, and votes), **row-level security** for the "only members can access" requirement, built-in auth (email codes, passkeys later), file storage with the same RLS, realtime subscriptions, and cron, all from one vendor with a generous free tier.
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
| Email | Resend: Supabase custom SMTP for sign-in codes (required, since Supabase's built-in sender won't reach roommates), plus reminder fallback emails |
| Icons | Lucide |
| Testing | Vitest (unit), Playwright with the iPhone 15 device profile (e2e), pgTAP or SQL tests for RLS |
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
   Web Push services (Apple / Google / Mozilla)    Resend (email)    Splitwise API (phase 2)
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
 │  resend · splitwise · system-clock · crypto-ids · in-memory fakes    │
 └─────────────────────────────────────────────────────────────────────┘
```

**Rules**
1. **Domain** imports nothing outside `lib/domain/`. Time, ids, and settings are passed in as arguments. Functions return values (including `Result<T, E>` for expected failures) and never throw for business rules.
2. **Use cases** receive every dependency through a `deps` argument (**constructor/factory injection, no service locator, no DI container**). A use case never reads `process.env`, never imports an adapter, and never calls `new Date()`.
3. **Adapters** are the only code that knows about Supabase, Postgres rows, Kysely, `web-push`, Resend, or Splitwise. Generated DB types stay here. Adapters map rows ↔ domain types with explicit `toDomain` / `toRow` functions.
4. **Entry points** are thin. They validate input with Zod, build deps via the composition root, call one use case, and map `Result` to an HTTP/action response. No business logic.
5. **Every port has an in-memory fake** in `lib/adapters/memory/`, used by unit tests and Storybook. The same contract test suite runs against the fake and the Postgres adapter.

**Ports** (interfaces in `lib/app/ports.ts`)

| Port | Methods (abridged) | Production adapter | Test adapter |
|---|---|---|---|
| `UnitOfWork` | `run<T>(actor, fn: (repos: Repos) => Promise<T>): Promise<T>`, one transaction per call | Postgres: `begin` → `set local role authenticated` + `set_config('request.jwt.claims', …)` so **RLS still applies** → `commit` | in-memory (copy-on-write) |
| `Repos` (inside a UoW) | `artifacts`, `shopping`, `runs`, `schedule`, `feelings`, `purchases`, `votes`, `members`, `invites`, `contacts`, `claims`: each with `get` / `find…` / `save` | Kysely queries | Maps |
| `EventSink` (inside a UoW) | `record(events: DomainEvent[])`: writes `activity_events` + `notifications_outbox` in the **same transaction** (transactional outbox) | Postgres | array |
| `Clock` | `now(): Instant` | `systemClock` | `fixedClock(t)` |
| `IdGenerator` | `newId<K>(): Id<K>` | `crypto.randomUUID` | sequential |
| `HouseQueries` (read side) | `feed(houseId)`, `shoppingList(houseId)`, `calendar(houseId, range)`, `artifact(id)`, … returning domain types | Supabase browser client (RLS) | fixtures |
| `ChangeFeed` | `subscribe(houseId, onChange): Unsubscribe` | Supabase Realtime | manual emitter |
| `AuthGateway` | `createUser(email)`, `sendOtp(email)`, `verifyOtp(email, code)`, `deleteUser(id)` | Supabase Auth admin | fake |
| `PushSender` | `send(subscription, message): Result<void, 'gone' \| 'failed'>` | `web-push` (VAPID) | recorder |
| `EmailSender` | `send(to, message)` | Resend | recorder |
| `SplitwiseGateway` (phase 2) | `createExpense(token, expense)` | Splitwise API | recorder |
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
alter table artifacts enable row level security;
create policy "members read"  on artifacts for select using (is_member(house_id));
create policy "members write" on artifacts for insert with check (is_member(house_id) and created_by = auth.uid());
create policy "members edit"  on artifacts for update using (is_member(house_id)) with check (is_member(house_id));
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
| House data (artifacts, feelings, photos) | Our tables + Supabase Storage, same project | Access controlled by RLS as above |

- **Physical location:** one Supabase project in the region you pick when creating it (e.g. `us-east-1`). The data is encrypted at rest and in transit (TLS). Only you, as the Supabase project owner, can see the raw tables in the dashboard.
- **Who else touches it:**
  - **Resend** sends the code emails, so it sees email addresses and the code in transit and keeps delivery logs.
  - **Vercel** sees requests passing through the server routes, but it doesn't store user data beyond short-lived logs.
  - **Sentry** is configured to scrub emails and request bodies.
- **Email sending needs Resend (or similar).** Supabase's built-in email service only delivers to your own team's addresses and is heavily rate-limited, so custom SMTP is required before roommates can sign in. Resend's free tier is enough.
- **Deleting an account:** a "Delete my account" option in settings removes the auth user and profile. Their name on past artifacts becomes "Former roommate."

### 5.4 Other security decisions [DECIDED]

- RLS is **enabled on every table**, and a CI test fails if any public table lacks RLS.
- The service-role key lives only in Vercel server env vars and is never shipped to the client.
- **Sensitive fields** (Wi‑Fi password, door code) go in a separate `artifact_secrets` table: RLS'd, excluded from Realtime publication, activity events, and notifications, and fetched only on tap-to-reveal. Encryption at rest comes from Supabase disk encryption. App-level encryption (pgsodium/Vault) is optional and deferred.
- Storage buckets are private. The path convention `house/<house_id>/<artifact_id>/<file>` enables a storage RLS policy using `is_member`. Files are served via short-lived signed URLs.
- Rate limits: Supabase Auth's built-in OTP limits, plus our own limit on `/api/invites/start`, `/api/invites/accept`, and `/setup` per IP (a simple Postgres counter table, no extra vendor). Invalid-token attempts are logged.
- CSP headers, `SameSite=Lax` cookies, and no third-party scripts besides Sentry.

---

## 6. Data model

### 6.1 Artifact storage strategy — **[DECIDED] after comparing options**

| Option | Description | Pros | Cons |
|---|---|---|---|
| **Single table + JSONB details** | `artifacts` has the common columns plus `details jsonb`, validated by per-type Zod schemas and a DB check on `type` | Simplest queries for the unified feed and priority. Easy to add types. | Weaker DB-level typing for type-specific fields |
| **Base table + per-type extension tables** ⭐ | `artifacts` (common) + `chore_details`, `one_off_details`, `purchase_details` (1:1, PK = artifact_id) | The unified feed queries only the base table. Type-specific fields are real, typed, indexable columns. FK integrity (e.g. `contact_id`). | More joins and migrations |
| Table per type, no base | Separate `chores`, `one_offs`, `purchases`, ... | Strong typing | The unified feed, feelings, tags, and activity need polymorphic FKs, which is painful |

**Chosen: base + extension tables.** Feelings, tags, attachments, and activity all FK to `artifacts.id`, and money/date fields that cron jobs query (bill due day, outside-help follow-up date, vote deadline, schedule entry times) are real columns.

### 6.1b Category → features

Every row is an `artifacts` row. The category decides which detail table exists and which features the UI shows.

| Feature | Chore | One-off | Run | Purchase | Heads-up | Info |
|---|---|---|---|---|---|---|
| Detail table | `chore_details` | `one_off_details` | `run_details` + `run_items` | `purchase_details` | none (its `schedule_entries`) | none (+ `artifact_secrets`) |
| Assignee | none by default (mode) | optional; point person if outside help | the runner / point person | buyer / payer | optional | none |
| Repeats / rotation | mode: anyone · rhythm · rotating · fixed | | | bill: cadence | | |
| Outside help + contact log | | ✓ | visit: `contact_id` | | | |
| Can go on a run | ✓ | ✓ | | | | |
| Schedule entries | rare | rare (visits are runs) | optional (visit: required) | rare | required, ≥ 1 | |
| Linked purchases | ✓ | ✓ | the supplies it produced | (is the purchase) | | |
| Priority score / in feed | as needed: only with a feeling · rhythm: once past · rotating/fixed: due | ✓ | ✗ (Runs in progress) | bill due · open vote | ✗ (Coming up) | ✗ |
| Feelings | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ |
| Done means | `last_done_*` updated (rotating/fixed: next occurrence spawned) | completed / Fixed | finished, with per-item outcomes | settled (owned, supplies) · a bill is never done | last entry passed → auto-archived | n/a |

### 6.2 Schema (initial)

```
profiles            (id = auth.users.id, display_name, theme: auto|light|dark, timezone, quiet_start, quiet_end, created_at)

houses              (id, name, address, unit, created_by, settings jsonb, created_at)
                     settings: { timezone, priority_weights, priority_preset, stall_days, invite_ttl_days }
house_members       (house_id, user_id, role: admin|member, status: active|moved_out,
                     room_id null,            -- their bedroom; its element sets their avatar color
                     joined_at, left_at)  PK(house_id, user_id)
rooms               (id, house_id, name, floor: first|basement|outside, kind: bedroom|bath|common|utility|outdoor|entry,
                     element: air|fire|water|earth|null, sort_order, archived_at)   unique(house_id, name)
                     -- seeded at house setup from the apartment layout (FRONTEND.md §4.1)
house_invites       (id, house_id, token_hash, created_by, expires_at, max_uses, uses, revoked_at)

artifacts           (id, house_id, category: chore|one_off|run|purchase|heads_up|info, title, description,
                     base_priority: low|normal|high|urgent, due_at, pinned bool, room_id null,
                     created_by, created_at, updated_at, last_activity_at, completed_at, archived_at)
artifact_assignees  (artifact_id, user_id)
artifact_links      (item_id, purchase_id, created_by, created_at)   PK(item_id, purchase_id)
                     -- owner: chores/one-offs link to purchases; shown on both sides.
                     -- item_id must be a chore or one_off; purchase_id must be a purchase (checked by the domain + a composite FK on (id, category)).
tags                (id, house_id, name, color)          unique(house_id, name)
artifact_tags       (artifact_id, tag_id)
attachments         (id, artifact_id, house_id, storage_path, mime, size, uploaded_by, created_at)
artifact_secrets    (artifact_id, house_id, label, value)   -- tap-to-reveal only

-- chores ------------------------------------------------------------
chore_details       (artifact_id PK,
                     mode: anyone|rhythm|rotating|fixed  default 'anyone',   -- owner: flexible by default
                     rhythm_days int null,                                    -- rhythm: "usually every N days"
                     rrule null, rotation_order uuid[] null, rotation_index int null, series_id null,  -- rotating / fixed only
                     last_done_at null, last_done_by null,
                     checklist jsonb)
                     -- anyone/rhythm: one long-lived row; "done" updates last_done_*.
                     -- rotating/fixed: an occurrence per turn (series_id), as before.

-- shopping list (the pool; owner: one shared list, everything shared) -------------
shopping_items      (id, house_id, name, name_normalized, note null,
                     need_soon bool default false,
                     added_by, added_at,
                     status: open|done  default 'open', done_by null, done_at null)
                     unique(house_id, name_normalized) where status = 'open'   -- re-adding = +1 instead of a duplicate
shopping_plus_ones  (shopping_item_id, user_id, created_at)   PK(shopping_item_id, user_id)   -- "me too"

-- runs (owner: batches for shopping, errands, visits) ------------------------------
run_details         (artifact_id PK, kind: shopping|errand|visit,
                     runner_id null,                  -- roommate doing it (shopping/errand) or point person (visit)
                     contact_id null,                 -- visit: who's coming (required for kind = visit)
                     status: open|finished  default 'open', finished_at null,
                     supplies_purchase_id null)       -- the purchase created at "Did you spend money?"
                     -- the run's time, if any, is a schedule_entries row owned by the run
run_items           (id, run_id → artifacts.id,
                     artifact_id → artifacts.id  null,           -- a one-off or chore
                     shopping_item_id → shopping_items.id null,  -- a shopping item
                     outcome: pending|done|not_done  default 'pending',
                     note null, added_by, added_at)
                     check (num_nonnulls(artifact_id, shopping_item_id) = 1)
                     unique(run_id, artifact_id), unique(run_id, shopping_item_id)
                     -- the referenced artifact must be a chore or one_off (domain rule + composite FK on (id, category));
                     -- "one open claim at a time" is enforced by run_claims (below); history across runs is kept
run_claims          (run_id, artifact_id null unique, shopping_item_id null unique)
                     check (num_nonnulls(artifact_id, shopping_item_id) = 1)
                     -- a row exists only while the item is on an OPEN run; deleted when the run finishes

-- one-offs ----------------------------------------------------------
one_off_details     (artifact_id PK, broken bool default false, checklist jsonb,
                     handler: us|outside  default 'us',                     -- owner: two levels only
                     contact_id null,                                       -- required when handler = 'outside'
                     outside_stage: not_contacted|reached_out|heard_back|scheduled|fixed  null,
                     stalled bool default false, last_outside_update_at null)
                     check (handler = 'us' or contact_id is not null)
                     -- escalated one-offs must have exactly one assignee (the point person): enforced by the `escalateOneOff` domain function (the `OneOff` type only allows a single `pointPerson`)
                     -- the visit time lives in schedule_entries, not here
contact_log         (id, one_off_id, house_id, at, channel: call|text|email|portal|in_person, note, by_user)
contacts            (id, house_id, name, role, phone, email, preferred_channel, notes)

-- heads-ups / schedule (owner: option D, every entry belongs to exactly one artifact) ----
schedule_entries    (id, house_id, artifact_id NOT NULL,       -- the parent item, or a heads_up artifact for standalone ones
                     title null,                               -- null = use the artifact's title
                     starts_at, ends_at null, all_day bool,
                     room_id null,                             -- null = use the artifact's room
                     note null, created_by, created_at, canceled_at null)
schedule_acks       (entry_id, user_id, acked_at)   PK(entry_id, user_id)   -- "Got it 👍"
                     -- heads_up artifacts have no *_details table; their entries carry the time.

-- purchases ---------------------------------------------------------
purchase_details    (artifact_id PK, kind: owned|bill|supplies, amount_cents, amount_varies bool,
                     paid_by / purchased_by, split jsonb, contact_id null, splitwise_expense_id null,
                     -- owned
                     purchased_at, store, return_by, settled_at null, outcome: kept|returned|no_vote  null,
                     -- owner: settled = out of the feed, still the ownership record. 'returned' is set when the linked return one-off completes;
                     -- the hourly close-votes job sets 'no_vote' once return_by passes with no ballots.
                     -- bill
                     cadence: monthly|quarterly|yearly, due_day, account_holder_id, account_last4, portal_url,
                     next_amount_cents null,   -- one-off override for the upcoming payment only; cleared when it's paid
                     -- supplies: settled_at = purchased_at (settled immediately)
                     )
                     -- amount_cents on a bill is the *current* amount (editable, "from now on"). History lives in purchase_payments
                     -- (actual amounts per period) + activity_events (every amount change, old → new, scope).
purchase_payments   (id, purchase_id, period_start, amount_cents, paid_by, paid_at, splitwise_expense_id)   -- bills only
                     -- amount_cents = what was actually paid; never rewritten when the bill's amount changes
ownership_shares    (artifact_id, user_id, share_bps)   -- owned only; basis points, sum = 10000
votes               (id, artifact_id, house_id, kind: keep_return, opened_by, deadline,
                     closed_at, outcome: keep|return|tie)
vote_ballots        (vote_id, user_id, choice: keep|return|abstain, cast_at)

feelings            (artifact_id, user_id, house_id, feeling: anxious|frustrated|confused|fine|meh|thanks,
                     note, updated_at)   PK(artifact_id, user_id)
                     -- owner: no comments table. Feeling + note is the conversation. Previous versions are read from
                     -- activity_events (kind = 'feeling_changed', payload has the old feeling + note) for the "Earlier" list.

activity_events     (id bigserial, house_id, actor_id, artifact_id null, kind, payload jsonb, created_at)
push_subscriptions  (id, user_id, endpoint, p256dh, auth, user_agent, created_at, last_ok_at)
notification_prefs  (user_id, category, enabled)
notifications_outbox(id, user_id, house_id, category, title, body, url, send_after, sent_at, error)
splitwise_accounts  (user_id, access_token_enc, refresh_token_enc, splitwise_user_id)   -- phase 2
```

Indexes: `run_items(artifact_id) where outcome = 'pending'`, `run_items(shopping_item_id) where outcome = 'pending'`, `artifacts(house_id, archived_at, due_at)`, `schedule_entries(house_id, starts_at) where canceled_at is null`, `shopping_items(house_id) where status = 'open'`, `artifacts(room_id) where archived_at is null`, `artifacts(house_id, last_activity_at desc)`, `activity_events(house_id, created_at desc)`, `feelings(artifact_id)`, `notifications_outbox(sent_at) where sent_at is null`.

**Feelings are always named (owner).** The client reads `feelings` directly, with no masking view.

**Money:** always stored as integer cents plus a house currency (USD default). Never floats.

**Time:** all timestamps are `timestamptz` in UTC. Due dates for chores are **local dates** in the house's timezone (stored in `houses.settings.timezone`), so "due Tuesday" doesn't drift.

### 6.3 Domain model: standalone types (`lib/domain/types.ts`)

The tables in §6.2 are the **storage** shape. The code works with **domain types** that are standalone:
- plain, immutable, serializable objects with no methods and no ORM or Supabase types
- **discriminated unions**, so illegal states can't be represented. A bill can't have a `return_by`, a visit can't lack a contact, and an escalated one-off always has exactly one point person.
- adapters convert between rows and these types (`toDomain` / `toRow`), and that mapping is covered by contract tests

```ts
// ---- primitives ----
type Id<K extends string> = string & { readonly __id: K }
type TagId = Id<'tag'>; type ChecklistItem = { text: string; done: boolean }
type UserId = Id<'user'>; type HouseId = Id<'house'>; type ArtifactId = Id<'artifact'>
type RoomId = Id<'room'>; type ContactId = Id<'contact'>; type ShoppingItemId = Id<'shopping'>
type RunItemId = Id<'run_item'>; type EntryId = Id<'entry'>
type Instant = { readonly epochMs: number }          // a moment in UTC
type LocalDate = `${number}-${number}-${number}`     // a calendar day in the house timezone
type Cents = number & { readonly __cents: true }     // integer money
type Actor = { kind: 'member'; userId: UserId; houseId: HouseId } | { kind: 'system'; houseId: HouseId }
type Result<T, E extends string> = { ok: true; value: T } | { ok: false; error: E }

// ---- artifacts ----
interface ArtifactBase {
  id: ArtifactId; houseId: HouseId; title: string; description?: string
  roomId?: RoomId; tagIds: readonly TagId[]; basePriority: 'low' | 'normal' | 'high' | 'urgent'
  createdBy: UserId; createdAt: Instant; archivedAt?: Instant
  linkedPurchaseIds: readonly ArtifactId[]
}
type Artifact = Chore | OneOff | Run | Purchase | HeadsUp | Info

type Chore = ArtifactBase & {
  category: 'chore'; checklist: readonly ChecklistItem[]
  lastDone?: { at: Instant; by: UserId }
  schedule:
    | { mode: 'anyone' }
    | { mode: 'rhythm'; everyDays: number }
    | { mode: 'rotating'; rrule: string; rotation: readonly UserId[]; turn: UserId; due: LocalDate; seriesId: string }
    | { mode: 'fixed'; rrule: string; assignee: UserId; due: LocalDate; seriesId: string }
}

type OneOff = ArtifactBase & {
  category: 'one_off'; broken: boolean; checklist: readonly ChecklistItem[]; due?: LocalDate
  status: { state: 'open' } | { state: 'done'; at: Instant; by: UserId }
  help:
    | { handler: 'us'; assignees: readonly UserId[] }
    | { handler: 'outside'; contactId: ContactId; pointPerson: UserId; stage: OutsideStage
        stalled: boolean; lastUpdateAt: Instant; log: readonly ContactAttempt[] }
}
type OutsideStage = 'not_contacted' | 'reached_out' | 'heard_back' | 'scheduled' | 'fixed'

type Run = ArtifactBase & {
  category: 'run'
  who: { kind: 'shopping' | 'errand'; runner: UserId } | { kind: 'visit'; contactId: ContactId; pointPerson: UserId }
  items: readonly RunItem[]
  status: { state: 'open' } | { state: 'finished'; at: Instant; suppliesPurchaseId?: ArtifactId }
}
type ItemRef = { type: 'artifact'; id: ArtifactId } | { type: 'shopping'; id: ShoppingItemId }
type RunItem = { id: RunItemId; ref: ItemRef; outcome: 'pending' | 'done' | { notDone: string | null } }

type Purchase = ArtifactBase & { category: 'purchase'; payer: UserId; split: Split } & (
  | { kind: 'owned'; price: Cents; purchasedAt: Instant; store?: string; returnBy?: LocalDate
      ownership: readonly { user: UserId; bps: number }[]
      settlement?: { at: Instant; outcome: 'kept' | 'returned' | 'no_vote' } }
  | { kind: 'bill'; amount: Cents; varies: boolean; nextPaymentOverride?: Cents
      cadence: 'monthly' | 'quarterly' | 'yearly'; nextDue: LocalDate
      accountHolder: UserId; contactId?: ContactId; account?: { last4: string; portalUrl?: string } }
  | { kind: 'supplies'; amount: Cents; purchasedAt: Instant; items: readonly string[] }
)
type Split =
  | { type: 'equal'; among: readonly UserId[] }
  | { type: 'percent'; shares: readonly { user: UserId; bps: number }[] }
  | { type: 'amounts'; shares: readonly { user: UserId; cents: Cents }[] }

type Bill = Extract<Purchase, { kind: 'bill' }>; type OwnedPurchase = Extract<Purchase, { kind: 'owned' }>
type Scorable = Chore | OneOff | Bill | OwnedPurchase               // what the priority score applies to

type HeadsUp = ArtifactBase & { category: 'heads_up' }            // its time lives in ScheduleEntry
type Info = ArtifactBase & { category: 'info'; body: string; pinned: boolean; hasSecret: boolean }

// ---- standalone (non-artifact) objects ----
type ShoppingItem = { id: ShoppingItemId; houseId: HouseId; name: string; note?: string; needSoon: boolean
  plusOnes: readonly UserId[]; addedBy: UserId; addedAt: Instant
  status: { state: 'open' } | { state: 'done'; at: Instant; by: UserId } }
type ScheduleEntry = { id: EntryId; artifactId: ArtifactId; starts: Instant; ends?: Instant; allDay: boolean
  titleOverride?: string; roomOverride?: RoomId; note?: string; acks: readonly UserId[]; canceled: boolean }
type Feeling = { artifactId: ArtifactId; by: UserId; kind: FeelingKind; note?: string; at: Instant }
type FeelingKind = 'anxious' | 'frustrated' | 'confused' | 'fine' | 'meh' | 'thanks'
type ContactAttempt = { at: Instant; channel: 'call' | 'text' | 'email' | 'portal' | 'in_person'; note: string; by: UserId }
type Payment = { purchaseId: ArtifactId; periodStart: LocalDate; amount: Cents; paidBy: UserId; paidAt: Instant }
type Vote = { artifactId: ArtifactId; deadline: Instant; ballots: readonly { user: UserId; choice: 'keep' | 'return' | 'abstain' }[] }
type Member = { userId: UserId; houseId: HouseId; name: string; role: 'admin' | 'member'
  status: 'active' | 'moved_out'; roomId?: RoomId }
type Invite = { id: Id<'invite'>; houseId: HouseId; tokenHash: string; expiresAt: Instant
  maxUses: number; uses: number; revokedAt?: Instant }
type HouseSettings = { timezone: string; priorityWeights: PriorityWeights; stallDays: number; inviteTtlDays: number }
type PriorityWeights = { base: Record<'low'|'normal'|'high'|'urgent', number>
  feelings: Record<FeelingKind, number>; outsideBoost: number; staleCap: number /* … §8.1 of the PRD */ }

// ---- events (returned by domain functions, recorded by EventSink) ----
type DomainEvent =
  | { type: 'chore.completed'; choreId: ArtifactId; by: UserId; at: Instant; nextId?: ArtifactId }
  | { type: 'one_off.escalated'; id: ArtifactId; contactId: ContactId; pointPerson: UserId; at: Instant }
  | { type: 'run.started'; runId: ArtifactId; items: number; by: UserId; at: Instant }
  | { type: 'run.finished'; runId: ArtifactId; done: number; returned: number; at: Instant }
  | { type: 'feeling.set'; artifactId: ArtifactId; by: UserId; next: Feeling | null; previous: Feeling | null }
  | { type: 'purchase.amount_changed'; id: ArtifactId; from: Cents; to: Cents; scope: 'from_now_on' | 'this_payment' }
  | { type: 'purchase.paid'; id: ArtifactId; payment: Payment }
  | { type: 'vote.closed'; id: ArtifactId; outcome: 'keep' | 'return' | 'tie' }
  | { type: 'member.joined'; userId: UserId; at: Instant }
  // …one variant per activity-log kind in the PRD §9
```

**Changes to the storage schema that fall out of this:**
- **`artifacts.status` and `norm_status` are replaced** by per-category state in the detail tables. The feed's "is it open?" becomes a pure domain function (`isOpen(artifact)`), not a duplicated column.
- **`purchase_details` "paid_by / purchased_by"** becomes one column, `payer_id`.
- **`split jsonb`, `checklist jsonb`, and `houses.settings jsonb`** are each validated by the Zod schema of their domain type at the adapter boundary.
- **Claims:** the "one open claim per item" trigger becomes a constraint table, `run_claims(run_id, artifact_id unique null, shopping_item_id unique null)`. The UoW inserts a row when an item joins an open run and deletes it on finish, so the unique index enforces the rule with no trigger logic.

### 6.4 Activity log implementation

- **[DECIDED] (v1.0)** No triggers. Every use case returns **domain events** (§6.3), and `EventSink.record(events)` writes them to `activity_events` in the **same transaction** as the change, so the log can't miss a change or record one that rolled back.
- `activityRowFor(event): ActivityRow | null` is a pure function (it drops noise and never includes `artifact_secrets` values). A `feeling.set` event carries the previous feeling + note, which powers the "Earlier" list.
- The actor comes from the use case's `actor` argument. A `system` actor (cron) shows as "Roomies." 
- The activity feed is a paginated select (keyset on `id`).

---

## 7. Key flows

### 7.1 Priority computation

- **[DECIDED] A5: computed at read time by one pure function**, `scorePriority(item, feelings, weights, now, tz): PriorityResult` in `lib/domain/priority.ts`. It returns `{ score, tier, breakdown }`, where `breakdown` powers "Why is this here?"
- It's never stored, because the score depends on the current time. `now` is **an argument**, so the same function runs in the browser (feed), in jobs (reminders), and in tests with a fixed clock. There's no SQL copy of the formula.

### 7.2 Repeating chores

- The recurrence rule is stored on `chore_details` for the current occurrence, and all occurrences share a `series_id`.
- **Generate-on-complete** (not pre-generated): the use case `completeChore` calls the pure `completeChore` domain function (§7.2b), which returns the updated occurrence plus the next one (next due date from the RRULE, next person in the rotation). The UoW saves both in one transaction.
- **Missed occurrences:** the hourly `sweepRecurrences` use case (with the injected clock) finds occurrences past due by more than the grace period (default 1 day) and, depending on the rotation mode, marks them `missed` and spawns the next one (so the schedule doesn't stall forever), or leaves them overdue. That's a house setting. Default: leave overdue and keep nagging, because chores still need doing.

### 7.2b Function catalog

Two kinds of functions. **Domain functions** are pure: the same input always gives the same output, and there's no I/O. **Use cases** are the only functions entry points call. Each one runs in exactly one `UnitOfWork` transaction and returns a typed `Result`.

**Domain functions** (`lib/domain/*.ts`, all pure)

| Function | Signature | Notes |
|---|---|---|
| `scorePriority` | `(a: Scorable, feelings: Feeling[], w: PriorityWeights, now: Instant, tz: string) → PriorityResult` | §7.1 |
| `isInFeed` | `(a: Artifact, feelings: Feeling[], now: Instant, tz: string) → boolean` | as-needed chores need a feeling, rhythm chores must be past their rhythm, and so on |
| `nextOccurrence` | `(rrule: string, after: LocalDate, tz: string) → LocalDate` | wraps `rrule`, DST-safe |
| `completeChore` | `(c: Chore, by: UserId, now: Instant, nextId: ArtifactId) → { chore: Chore; next?: Chore; events }` | `nextId` is injected, never generated inside |
| `escalateOneOff` | `(o: OneOff, contact: ContactId, pointPerson: UserId, now: Instant) → Result<{ oneOff; events }, 'already_done'>` | |
| `deescalateOneOff` | `(o: OneOff) → { oneOff; events }` | keeps the contact log |
| `logContact` | `(o: OneOff, attempt: ContactAttempt) → Result<{ oneOff; events }, 'not_outside'>` | `not_contacted → reached_out`, clears `stalled` |
| `markStalled` | `(o: OneOff, now: Instant, stallDays: number) → OneOff` | |
| `addShoppingItem` | `(open: ShoppingItem[], name: string, by: UserId, now: Instant, newId: ShoppingItemId) → { kind: 'added' \| 'plus_one'; item; events }` | merges duplicates |
| `startRun` | `(input: StartRunInput, claimed: ReadonlySet<string>, ids: RunIds, now: Instant) → Result<{ run: Run; entry?: ScheduleEntry; events }, 'nothing_selected' \| 'already_claimed'>` | |
| `addToRun` | `(r: Run, refs: ItemRef[], claimed, ids) → Result<{ run; events }, 'run_finished' \| 'already_claimed'>` | |
| `finishRun` | `(r: Run, outcomes: RunOutcome[], now: Instant) → { run: Run; effects: RunEffect[]; events }` | returns **effects** as data (see below). It doesn't touch other objects itself. |
| `applyRunEffect` | `(effect: RunEffect, target: Artifact \| ShoppingItem, now: Instant) → Artifact \| ShoppingItem` | one pure step per effect |
| `planVisit` | `(input: PlanVisitInput, oneOffs: OneOff[], claimed, ids, now) → Result<{ run; entry; oneOffs; events }, 'no_one_offs' \| 'already_claimed'>` | escalates any `us` one-offs to the contact |
| `tallyVote` | `(v: Vote) → 'keep' \| 'return' \| 'tie'` | owner's rule: majority of keep vs. return |
| `closeVote` | `(p: OwnedPurchase, v: Vote, now: Instant, returnTaskId: ArtifactId) → { purchase; returnTask?: OneOff; events }` | |
| `changeBillAmount` | `(b: Bill, to: Cents, scope) → { bill; events }` | |
| `markBillPaid` | `(b: Bill, amount: Cents, by: UserId, now: Instant, tz: string) → { bill; payment: Payment; events }` | advances `nextDue` by one cadence |
| `setFeeling` | `(current: Feeling \| null, next: Feeling \| null) → { feeling; events }` | the event carries `previous` for the Earlier list |
| `createHeadsUp` | `(input, ids, now) → { headsUp: HeadsUp; entry: ScheduleEntry; events }` | |
| `validateInvite` | `(inv: Invite, tokenHash: string, now: Instant) → Result<Invite, 'invalid' \| 'expired' \| 'revoked' \| 'used_up'>` | |
| `activityRowFor` | `(e: DomainEvent) → ActivityRow \| null` | used by `EventSink` |
| `notificationsFor` | `(e: DomainEvent, members: Member[], prefs: NotificationPrefs[], now: Instant, tz: string) → OutboxMessage[]` | applies quiet hours and per-category prefs |

`RunEffect` is a plain data union: `{ type: 'shopping.done'; id }` · `{ type: 'one_off.done'; id; fixed: boolean }` · `{ type: 'one_off.returned'; id; note }` · `{ type: 'chore.done'; id; by }` · `{ type: 'supplies.create'; amount; items; payer }`. Because `finishRun` describes what should happen instead of doing it, it's testable without any other objects loaded, and the use case applies the effects inside the transaction.

**Use cases** (`lib/app/*.ts`). Each is built as `makeX(deps)`, then called as `(actor: Actor, input) → Promise<Result<Output, Error>>`.

| Use case | Input (validated by Zod at the entry point) | Output | Errors | Deps |
|---|---|---|---|---|
| `completeChore` | `{ choreId }` | `{ chore, next? }` | `not_found`, `forbidden` | uow, clock, ids |
| `escalateOneOff` | `{ oneOffId, contactId, pointPerson }` | `OneOff` | `not_found`, `already_done` | uow, clock |
| `deescalateOneOff` | `{ oneOffId }` | `OneOff` | `not_found` | uow |
| `logContact` | `{ oneOffId, channel, note }` | `OneOff` | `not_outside` | uow, clock |
| `completeOneOff` | `{ oneOffId }` | `OneOff` | `already_done` | uow, clock |
| `addShoppingItem` / `grabShoppingItem` / `togglePlusOne` / `toggleNeedSoon` | `{ name }` / `{ id }` | `ShoppingItem` | `not_found` | uow, clock, ids |
| `startRun` | `{ kind, refs[], starts? }` | `{ run, entry? }` | `nothing_selected`, `already_claimed` | uow, clock, ids |
| `addToRun` / `removeFromRun` | `{ runId, refs[] }` / `{ runItemId }` | `Run` | `run_finished`, `already_claimed` | uow, ids |
| `finishRun` | `{ runId, outcomes[], spentCents? }` | `{ run, suppliesPurchase? }` | `run_finished`, `not_found` | uow, clock, ids |
| `planVisit` | `{ contactId, oneOffIds[], starts, pointPerson }` | `{ run, entry }` | `no_one_offs`, `already_claimed` | uow, clock, ids |
| `addScheduleEntry` / `createHeadsUp` / `ackEntry` | `{ artifactId, starts, … }` / `{ title, starts, … }` / `{ entryId }` | `ScheduleEntry` | `not_found` | uow, clock, ids |
| `setFeeling` | `{ artifactId, kind \| null, note? }` | `Feeling \| null` | `not_found`, `info_has_no_feelings` | uow, clock |
| `castBallot` / `closeVote` | `{ artifactId, choice }` / `{ artifactId }` | `Vote` / `Purchase` | `vote_closed` | uow, clock, ids |
| `changeBillAmount` / `markBillPaid` | `{ purchaseId, cents, scope }` / `{ purchaseId, cents? }` | `Bill` / `Payment` | `not_a_bill` | uow, clock |
| `startInvite` / `acceptInvite` | `{ token, email, name }` / `{ token, code }` | `void` / `Member` | `invalid`, `expired`, `revoked`, `used_up`, `bad_code` | uow, clock, auth, config |
| `setupHouse` | `{ setupToken, house, owner }` | `House` | `already_set_up`, `bad_token` | uow, clock, ids, auth, config |
| **Jobs:** `runReminders`, `sendNotifications`, `sweepRecurrences`, `closeDueVotes`, `archivePastHeadsUps` | `{ now? }` (defaults to `clock.now()`) | counts | none | uow, clock, push, email |

**Worked example: `finishRun`**

```ts
// lib/app/finishRun.ts
export const makeFinishRun = ({ uow, clock, ids }: Pick<AppDeps, 'uow' | 'clock' | 'ids'>) =>
  (actor: Actor, input: FinishRunInput): Promise<Result<FinishRunOutput, FinishRunError>> =>
    uow.run(actor, async (repos) => {
      const run = await repos.runs.get(input.runId)
      if (!run) return err('not_found')
      if (run.status.state === 'finished') return err('run_finished')

      const now = clock.now()
      const { run: finished, effects, events } = domain.finishRun(run, input.outcomes, now)  // pure

      for (const effect of effects) {                                                       // explicit I/O
        const target = await repos.targetOf(effect)
        await repos.save(domain.applyRunEffect(effect, target, now))
      }
      await repos.runs.save(finished)
      await repos.claims.releaseAll(run.id)
      repos.events.record(events)                                                           // activity + outbox, same tx
      return ok({ run: finished })
    })

// app/api/runs/[id]/finish/route.ts  (entry point, thin)
export const POST = handler(FinishRunInputSchema, (deps) => makeFinishRun(deps))
```

### 7.3 Scheduled jobs

Jobs are **use cases** (§7.2b) called by an authenticated route handler (`/api/cron/*`, secret header) with `depsForJob()`. The trigger is decided below. The logic is the same use case code users hit, with the clock injected, so every job is unit-testable with `fixedClock`.

| Job | Frequency | Does |
|---|---|---|
| `runReminders` | every 15 min | Finds due-soon/overdue chores, one-offs and bills, outside-help one-offs with no update in 3 days (sets `stalled`, nudges the point person), tomorrow's appointments, and closing votes → enqueues into `notifications_outbox` (idempotent via a unique key `(user, artifact, category, period)`) |
| `sendNotifications` | every 5 min (plus right after any use case that enqueued messages) | Sends outbox rows whose `send_after <= now()`, respecting quiet hours. Web push first, then email fallback if the user has no working subscription. |
| `runReminders` (heads-ups) | every 15 min | Enqueues evening-before (7pm house time) and morning-of (8am) notifications for upcoming `schedule_entries`, and auto-archives standalone heads-ups whose last entry has passed |
| `closeDueVotes` | hourly | Closes votes past deadline and computes the outcome from Keep vs. Return ballots. **Return** creates a linked "Return X by {date}" one-off for the buyer. **Keep** marks it kept. **Tie** records `tie`, notifies everyone "Vote on X: tie", and does nothing else (owner). |
| `sweepRecurrences` | hourly | Handles missed occurrences per §7.2 |

Vercel Hobby limits cron to daily on the free plan. For 5–15 minute schedules, use Vercel Pro ($20/mo), **Supabase pg_cron calling the route via `pg_net`** (free), or a free external pinger (e.g. GitHub Actions scheduled workflow, cron-job.org). **[DECIDED] Supabase pg_cron + pg_net → Vercel route** keeps cost at $0.

Immediate notifications (assignment, 😰/😤 feeling, a new note on your item) are enqueued by the **use case's events**: `EventSink` calls the pure `notificationsFor(event, …)` and writes the outbox rows in the same transaction. After the commit, the entry point calls `sendNotifications` for just those rows, so they go out within seconds. No triggers or `pg_net` pokes are needed for immediate sends.

### 7.4 Web Push on iOS

- Requires the PWA to be **installed to the Home Screen** (iOS 16.4+), a user gesture to request permission, and a VAPID key pair.
- Flow: the user taps "Enable notifications" in onboarding → `Notification.requestPermission()` → `pushManager.subscribe({ applicationServerKey })` → POST the subscription to `/api/push/subscribe` → stored in `push_subscriptions`.
- The server sends with `web-push`. A 404/410 response deletes the subscription.
- The service worker handles the `push` event (show the notification) and `notificationclick` (open the deep link URL).
- **Email fallback:** if a user has no active subscription, they get one daily digest email (not one per event) summarizing their notifications.

### 7.5 Realtime

- The client subscribes to `postgres_changes` on house-scoped tables filtered by `house_id=eq.<id>`. Supabase Realtime respects RLS.
- On an event, the client invalidates the matching TanStack Query keys (a simple refetch, no manual cache merging). This is cheap at this data size.
- Conflict policy: **last write wins** per field (updates send only changed fields). Concurrent completion or claiming of the same item is guarded inside the use cases' transactions: `run_claims` unique indexes reject double claims, and saves use optimistic concurrency (`where updated_at = :loaded`), mapping a lost race to a `conflict` error.

### 7.6 Splitwise (phase 2)

- Register a Splitwise OAuth app. `/api/splitwise/connect` → OAuth → store tokens encrypted (Supabase Vault or AES-GCM with a server key).
- The house admin maps the house to a Splitwise group, and members to Splitwise users (auto-match by email, manual override).
- "Add to Splitwise" calls `/api/splitwise/expense`, which uses the *acting user's* token to `create_expense` with the split from the purchase's `Split` / ownership (via the `SplitwiseGateway` port), then stores `splitwise_expense_id`.
- v1 link-out: `https://secure.splitwise.com/` deep link + clipboard text. No API needed.

### 7.7 Offline behavior

**[DECIDED] Online-first.** The service worker caches the app shell so it opens instantly and shows the last cached data read-only when offline. Writes need connectivity, and the UI shows a toast if you're offline. A true offline queue isn't worth the complexity in v1.

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
    chores/  one-offs/  purchases/  house/  calendar/
    a/[artifactId]/    -- artifact detail (shared across types; type-specific sections)
    activity/  settings/
  api/
    invites/start  invites/accept  setup  account/delete  push/subscribe  cron/*  splitwise/*
components/
  ui/                  -- Card, Button, Chip (type/room/tier), Avatar (initials + element), Sheet, TabBar, ListRow, SegmentedControl, Toast, EmptyState
  rooms/               -- RoomPicker (grouped by floor), RoomList, RoomChip
  artifacts/           -- ArtifactCard, ArtifactForm (per-type sections), FeelingPicker
lib/
  domain/              -- PURE: types.ts, priority.ts, chores.ts, oneOffs.ts, runs.ts, shopping.ts,
                          purchases.ts, votes.ts, schedule.ts, invites.ts, events.ts, notifications.ts
  app/                 -- use cases (makeX(deps)), ports.ts (interfaces), errors.ts
  adapters/
    postgres/          -- Kysely UoW + repos, row ↔ domain mappers, generated DB types live here
    supabase/          -- browser HouseQueries + ChangeFeed, AuthGateway
    push/ email/ splitwise/ clock/ ids/
    memory/            -- in-memory fakes for every port (tests, Storybook)
  compose.ts           -- composition root: depsForRequest / depsForJob / depsForTest
  config.ts            -- loadConfig(env) (the only process.env reader)
  schemas/             -- Zod input schemas for entry points (derived from domain types)
  client/              -- AppClient interface + React context + hooks (useFeed, useFinishRun, …)
supabase/
  migrations/  seed.sql  tests/ (RLS tests)
public/
  manifest.webmanifest  icons/  sw.js
```

iPhone UX specifics:
- Respect `env(safe-area-inset-*)` for the notch and home indicator. The tab bar sits above the home indicator.
- Use iOS-style bottom **sheets** for create/edit (not full-page navigations). Swipe-to-complete on chore and one-off rows. Haptics aren't available on the web, so we skip them.
- Font sizes ≥ 16px on inputs (prevents iOS auto-zoom). Use `inputmode` / `type="tel"` etc. for the right keyboards.
- `apple-mobile-web-app-capable`, `theme-color`, a splash/icon set, and `display: standalone`.
- Dark mode follows the system (`prefers-color-scheme`), with a manual override. Tokens are in FRONTEND.md §3.

---

## 9. Environments, CI/CD, and ops

| Item | Decision |
|---|---|
| Repo | Single repo (Next.js app + `supabase/` migrations). No monorepo tooling needed. |
| Environments | `local` (Supabase CLI in Docker), `preview` (Vercel preview deploys → shared staging Supabase project), `prod` |
| Migrations | Supabase CLI SQL migrations, checked in. Applied to staging on merge to `main`, then promoted to prod manually or on a tag. |
| CI (GitHub Actions) | typecheck, lint (**`eslint-plugin-boundaries`**: `domain` imports nothing, `app` imports only `domain` and ports, and only `adapters` + `compose` import Supabase/Kysely/web-push), Vitest (domain + use cases with in-memory adapters), port contract tests against both the memory and Postgres adapters, RLS tests against local Supabase, Playwright smoke test (iPhone profile) on the preview URL |
| Secrets | Vercel env vars (service-role key, `SETUP_TOKEN`, VAPID private key, Resend key, cron secret, Splitwise secret later). `.env.example` checked in. |
| Backups | Supabase daily backups (Pro), or on the free tier a scheduled `pg_dump` via GitHub Actions to a private storage bucket, weekly |
| Monitoring | Sentry (client + server), Supabase logs, a Vercel Cron failure alert, and an uptime ping (free UptimeRobot/Better Stack) |
| Domain | `*.vercel.app` to start. A custom domain is ~$12/yr (PRD Q12). |

---

## 10. Cost estimate

| Service | Free tier fit | Paid if needed |
|---|---|---|
| Vercel Hobby | Fine for a personal, non-commercial project | Pro $20/mo |
| Supabase Free | 500 MB DB, 1 GB storage, 50k MAU: plenty | Pro $25/mo |
| Resend | 3k emails/mo free | — |
| Sentry | 5k errors/mo free | — |
| Domain | — | ~$12/yr |
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
| A6 | Accounts | New free accounts: GitHub, Vercel, Supabase, Resend | Default (no preference given) |
| A7 | Budget | Free tiers. Upgrade only if the Supabase pause or cron limits bite. | Owner |
| A8 | Scope | One house (setup token for the first account), keep `house_id` everywhere | Owner |
| A9 | Lock invites to specific emails? | No. Public sign-up off, accounts created only via a valid invite. | Owner |
| A10 | Code structure | Ports & adapters: pure domain → use cases with injected deps → adapters. One composition root. Enforced by lint. | Owner (DI request) |
| A11 | Where business logic lives | TS domain + use cases, not Postgres RPCs/triggers. The DB keeps RLS + constraints only. | Owner (DI request) |
| A12 | Writes from the browser | Only through use cases (server actions/routes). Reads via the `HouseQueries` port. | Owner (DI request) |
| A13 | Data objects | Standalone, immutable domain types (discriminated unions), mapped to/from rows in adapters | Owner (DI request) |
| A14 | Activity log + notifications | Domain events recorded in the same transaction (transactional outbox). No triggers. | Owner (DI request) |
