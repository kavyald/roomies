# Roomies — Test Suite

**Status:** In use. The M0–M4 suites are built and green; M6's (Q6) is planned; M5's smoke suite and the manual checklist (§7) come with E1–E5.  
**Built from:** [ARCHITECTURE.md](./ARCHITECTURE.md) · [PRD.md](./PRD.md)  
**Last updated:** 2026-10-02

One command runs everything:

```bash
pnpm install && pnpm test:all
```

It needs **no accounts**, only Docker Desktop running for local Supabase. CI runs the same steps.

---

## 1. How testing is split

- **Every task tests itself.** Its definition of done asks for unit tests on pure domain functions, use-case tests on the in-memory adapters, contract tests for new ports or adapters, and an RLS test for any new table.
- **Every milestone ends with a test task (Q0–Q6).** It adds the tests that cross task boundaries (end-to-end journeys, RLS across tables, rules that span features), fills gaps against the milestone's exit criteria, and keeps `pnpm test:all` green. A milestone is done when its Q task passes.
- **What can't run on a Mac is a manual checklist** in E4 (§7): installing on a real iPhone, iOS push, and VoiceOver.

---

## 2. Layers

| Layer | What it checks | Tool | Where | Needs local Supabase? |
|---|---|---|---|---|
| **Static** | Types, layer boundaries (`eslint-plugin-boundaries`), formatting, banned copy words | `tsc`, ESLint, Prettier, and a copy-lint test (`components/ui/copy.test.ts`, which runs with the unit tests) | whole repo | No |
| **Unit** | Pure domain functions: priority, feed rules, runs, polls, costs, time and money | Vitest | `lib/domain/**/*.test.ts` | No |
| **Use case** | Use cases on the in-memory adapters, with a fixed clock and sequential ids | Vitest + `depsForTest()` | `lib/app/**/*.test.ts` | No |
| **Component** | Screens and components with a fake `AppClient` (pre-membership screens like join call server actions directly; their tests `vi.mock` those modules) | Vitest + Testing Library (jsdom) | `app/**/*.test.tsx`, `components/**/*.test.tsx` | No |
| **Contract** | One shared suite per port, run against both the memory and the Postgres adapter | Vitest | `lib/adapters/contracts/*.contract.ts` | Yes, for the Postgres run |
| **Database** | RLS on each table, isolation between houses, CHECK constraints, append-only `activity_events`, and that every table has RLS | Vitest + `pg`, via `asUser()` | `supabase/tests/*.test.ts` | Yes |
| **End to end** | Real journeys on the iPhone profile, plus axe accessibility checks | Playwright; sign-in codes read from Mailpit | `e2e/m0-*.spec.ts` … `e2e/m4-*.spec.ts` | Yes |
| **Smoke** (M5) | A short journey against staging and prod | Playwright with `BASE_URL` | `e2e/smoke.spec.ts` | No (remote) |
| **Manual** (M5) | Real-iPhone install, iOS push, VoiceOver | The checklist in §7 | this doc | — |

**Why one runner:** RLS and constraint tests live in Vitest rather than pgTAP, so they share builders and helpers with every other test and run through the same command.

---

## 3. Commands

| Command | Runs | Speed | Needs |
|---|---|---|---|
| `pnpm test` | Unit, use-case and component tests (the Vitest `unit` project, including the copy lint), with the coverage targets | Seconds | Nothing |
| `pnpm typecheck` · `pnpm lint` · `pnpm format:check` | The static checks | Seconds | Nothing |
| `pnpm test:db` | Contract suites on Postgres, database tests (the Vitest `db` project) | Under a minute | `supabase start` (its global setup prints a hint if it can't reach the database) |
| `pnpm test:e2e` | Playwright journeys. It builds the app and serves the production build on port 3210 (`pnpm build && pnpm start`, not `next dev`), reusing a server already on that port except in CI. With `BASE_URL` set it skips that and runs against the given URL. | A few minutes | `supabase start` |
| **`pnpm test:all`** | Everything, in order, stopping at the first failure: `supabase db reset` once, `.env.local` from `supabase status`, then typecheck, lint, format:check, `test`, `test:db`, `test:e2e`. | A few minutes | Docker Desktop, with local Supabase started |
| `pnpm test:smoke` | The smoke journey against `BASE_URL` | Seconds | A deployed URL (M5) |

`pnpm test --watch` is the everyday loop while building a task.

---

## 4. Test data and isolation

- **`lib/testing/`** holds:
  - `fixedClock(instant)` and `seqIds()`, re-exported from the adapters, plus the fixed instant `T0`;
  - builders for domain rows: `aHouse`, `aProfile`, `aMember`, `aRoom`, `aContact`, `anInvite`;
  - `sampleHouse()`, which mirrors the v1 mockup's people and rooms (Air, Fire, Water, Earth, Bathrooms 1–3, …);
  - `fakeAppClient()` over the in-memory adapters, for component tests;
  - for database tests (`db.ts`): `asUser`, `asOwner`, `asAnon`, `refused`, and `aDbHouse()`, a house with an admin, a member, a room, a contact and an invite;
  - the Mailpit helper (`latestCode`) and JWT minting for test clients.

  Use-case tests get their dependencies from `depsForTest()` in `lib/compose.ts`. The lint rules allow `lib/testing/` to be imported only from test files.
- **One house per test.** Database tests make theirs with `aDbHouse()`, and E2E journeys with `anOwner()` in `e2e/support.ts` (a real account that is admin of a new house with the apartment's rooms). Tests never share rows, so they can run in parallel and nothing needs truncating. `supabase db reset` runs once per `test:all` to apply migrations and `seed.sql`.
- **`asUser(userId, fn)`** opens a transaction with `set local role authenticated` plus the user's JWT claims, which is the same mechanism the UnitOfWork uses. RLS tests go through the real path, and `auth.uid()` equals the user inside `fn`.
- **Time is always injected.** No test depends on the real clock. Daylight-saving tests use fixed instants on both sides of a change in the house's time zone.
- **Sign-in codes in E2E** are read from the local Mailpit API (`localhost:54324`). Nothing reaches a real inbox.

---

## 5. CI (GitHub Actions, no accounts)

| Job | Runs | When |
|---|---|---|
| **fast** | `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test` | Every push and PR |
| **full** | `pnpm supabase start` with the services the tests don't use left off (Studio, Logflare, Vector, imgproxy, Edge Runtime, Storage, Supavisor; Docker comes with Actions), `.env.local` from it, Playwright's WebKit, then `pnpm test:db` and `pnpm test:e2e` | Every push and PR |
| **smoke** (from M5) | `pnpm test:smoke` against staging | After each staging deploy |

`fast` and `full` are required checks on `main`. When `full` fails, the Playwright report and test results (traces, screenshots) are uploaded.

**Coverage targets**, enforced by `pnpm test`: domain ≥95% of lines, use cases ≥90%. UI code has no target because the E2E journeys cover it.

---

## 6. What each milestone's test task proves

| Task | Rules and integration tests | E2E journey (iPhone profile) |
|---|---|---|
| **Q0** M0 tests + suite harness | Harness: Vitest projects (`unit`, `db`), `lib/testing/`, `asUser()`, the Playwright config and Mailpit helper, the `pnpm test:*` scripts, the CI jobs. Tests: every table has RLS; the UnitOfWork rolls back a failed use case; `auth.uid()` equals the actor. | `m0-sign-in`: a known email signs in with the code from Mailpit; an unknown email sees the neutral message and gets no code. |
| **Q1** M1 tests | A second house sees nothing of the first; setup works only once; the invite validation table (expired, revoked, used up); removing a member revokes access; a bulk action is one activity line. | `m1-join`: two browser contexts. The owner creates an invite, and a roommate joins, gets a code, and picks a room. |
| **Q2** M2 tests | Item CHECKs hold on both adapters (a chore can't be done, a need can't repeat); the priority table matches every row of PRD §8.1; feeling weights re-rank the feed; the as-needed chore feed rule; Realtime reaches a second context. | `m2-items`: a duplicate need points to the first; Did it on a chore; a 😰 feeling moves an item up Home; changing a weight re-ranks. |
| **Q3** M3 tests | One run per item (domain and database); move, back to the pool, hand to contact, done; a request closes itself when empty; the visit feed rule; `itemPath` / `runHistory`; equal cost splits; calendar ranges across DST; a 2–2 poll is a tie; options can be added until close. | `m3-runs`: a grocery run finished with a cost; a poll with a tie; landlord request → sent → reply recorded by moving 2 tasks to a visit and 1 back with a note. |
| **Q4** M4 tests + full suite | `notificationsFor` quiet hours and prefs; the outbox is written in the same transaction; reminders are idempotent under a fixed clock; the push sender drops 404/410 subscriptions (fake); copy lint (no "overdue," "failed," or "missed" about a person); axe on every screen. Coverage targets on. | `m4-notifications`, plus every earlier journey in one run. **`pnpm test:all` is green on a fresh clone and in CI.** |
| **Q5** Remote smoke suite | — | `smoke`: against staging after each deploy, with a dedicated smoke house; read-only against prod after launch. |
| **Q6** M6 tests | RLS and the CHECK on `items.for_member`; the duplicate-need rule with owners; the tests from M6's audit cards; axe on every changed screen in light and dark. | Journeys that count taps: finishing an item takes 1, sharing a feeling 2, a repeating chore 3 plus typing, a grocery run about 6, a personal need its title plus 1. Every swipe has a button that does the same thing. |

---

## 7. Manual checklist (E4, real iPhone)

Run on the preview URL, then again on prod at launch:

1. Open the link in Safari, then **Add to Home Screen**. It opens standalone, and the tab bar sits above the home indicator.
2. Sign in with a real code from the house Gmail. One-time-code autofill offers the code.
3. Allow notifications, then have another roommate assign you something. The push arrives within seconds and opens the item.
4. Turn on VoiceOver and walk Home, Needs, and one item's detail sheet. Every control has a label, and the order makes sense.
5. Switch the phone to dark mode and check Home and one sheet.
6. Run `pnpm test:e2e` with `BASE_URL` set to the preview URL.

---

## 8. Not tested automatically

- Real email delivery through Gmail (covered by the manual checklist and E1).
- iOS push delivery and PWA install (covered by the manual checklist).
- Visual design beyond axe contrast checks. Screens are checked by eye at 375pt in light and dark as part of each task's definition of done.
