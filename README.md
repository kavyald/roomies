# Roomies

A shared, phone-first hub for a house of roommates: what we need to buy, what needs doing, what we need to decide, and how everyone feels about it.

> **Status: M0–M4 and M6 built** on the `v1` branch: everything runs locally. **M5 (hosting and launch) is in progress**: first the deploy tooling and security work on `v1`, then a PR into `staging`, then the hosted accounts. The plan is [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). Tasks are planned and tracked on the **roomies** board in Weyve.

## The problem

Living with roommates piles up responsibility that gets scattered across a group chat. Nobody knows who's buying the dish soap, whether anyone told the landlord about the leak, or that one roommate is losing sleep over the radiator.

## What Roomies does

Five concepts cover v1:

| Concept | What it is | Examples |
|---|---|---|
| **Need** | Something the house needs to buy. A cost is recorded only if money was spent. | Tomatoes, dish soap, a vacuum |
| **Chore** | Ongoing upkeep, done by anyone "as needed" or "about every N days" | Wipe the stove, clean Bathroom 3 |
| **Task** | Anything one-off, optionally handled by someone outside the house | Fix the door latch, radiator (super) |
| **Poll** | A question with options, about an item or on its own | Which vacuum? House name? |
| **Run** | A batch of items handled together: a grocery run, a **request** to the landlord, or a **visit** from the super | "Wren's grocery run", "Landlord request" |

On top of that:

- **Feelings.** Any roommate can add a feeling (😰 anxious, 😤 frustrated, 🙂 fine…) plus a note to any item. Feelings raise priority, so concerns are heard *and* acted on. Feelings are always about the item, never the person.
- **A ranked Home feed** that says why each thing is there ("Due tomorrow +25, 😰 Maya +20"). The feeling weights are a house-wide setting anyone can change.
- **Requests and visits.** Gather tasks on a landlord list, send one message, then record the reply by moving tasks: accepted ones to a visit, the rest back to the pool with a note.
- **An activity log** that's the single source of history: every task's path, every earlier feeling, every vote.

It's a PWA for iPhone Safari: roommates open a link, add it to their Home Screen, and sign in with a 6-digit email code. Only people with an invite link can join.

## Try the prototype

[`docs/archive/mockup-v1.html`](docs/archive/mockup-v1.html) is the original clickable iPhone prototype with sample data. Open it in any browser:

```bash
open docs/archive/mockup-v1.html
```

Things to try: vote on "Which vacuum?", record the landlord's reply on the Landlord request (Tasks tab), finish a grocery run and log the cost, change a feeling weight under House → Settings, and check House → Activity.

## Docs

| Doc | What's in it |
|---|---|
| [PRD](docs/PRD.md) | Problem, the five concepts, feature specs, priority formula, invites and access, notifications, what's parked for later (§13), and the decision log |
| [Architecture](docs/ARCHITECTURE.md) | Stack, auth and row-level security, the data model and domain types, the function catalog, the activity log schema, jobs, and ops |
| [Frontend](docs/FRONTEND.md) | Visual language (inspired by Focus Friend), color system, the apartment's rooms, screens, copy voice, and motion |
| [Testing](docs/TESTING.md) | Test layers, tools, commands, CI, and what each milestone's test task proves |
| [Deployment](docs/DEPLOYMENT.md) | The M5 plan: branches (`staging` and `main`), staging vs prod, what goes into Supabase, Vercel and GitHub, the security rules for a public repo, and the order of the steps |
| [Architecture guide](docs/architecture-guide.html) | An interactive field guide to the build: layers, the system map, journeys and decisions |

## Stack

- **Next.js** (App Router) + TypeScript + Tailwind, installable as a **PWA**
- **Supabase**: Postgres with row-level security, email-code auth, Realtime, and pg_cron
- **Vercel** for hosting (two projects: staging and production), a house **Gmail** for sign-in emails, **Web Push** for notifications, **Sentry** for error reports
- **Ports & adapters** with dependency injection: a pure domain layer, use cases with injected dependencies, and adapters for Supabase, Postgres (Kysely), and push. See [Architecture §4.1](docs/ARCHITECTURE.md).

Everything targets free tiers for one house of 2–8 people.

## Roadmap

| Milestone | Scope |
|---|---|
| **M0 Foundations** | Repo, CI, local Supabase, sign-in, PWA shell, UI kit |
| **M1 House & members** | House setup with rooms, invites, members, activity log |
| **M2 Items** | Needs, chores, tasks, feelings, priority feed, feeling weights |
| **M3 Polls, runs & calendar** | Polls, runs, requests and visits, costs, calendar |
| **M4 Notifications & polish** | Web push, reminders, polish, end-to-end tests |
| **M5 Hosting & launch** | Deploy tooling and security hardening first (server-only database writes, repo secret scanning), then everything that needs an outside account: hosted Supabase, the Gmail sender, Sentry, Vercel, staging, iPhone checks, production |
| **M6 Usability & personal needs** | Fewer taps (swipe, simpler item views, quicker runs), needs for one person or the house, the gaps from the docs↔code audit, docs that match the build |

Each milestone ends with a test task. M0–M4 and M6 run entirely on one Mac with no accounts; M5 is where the sign-ups happen, and launch waits for M6. Parked for v2: bills, ownership of shared things, heads-ups with a calendar button, rotating chores, and the Splitwise API ([PRD §13](docs/PRD.md)).

The tasks, their dependencies and progress are on the **roomies** board in Weyve.

## Run it and test it

Everything runs on one Mac with no accounts; it needs Node 22, pnpm 10, and Docker Desktop running (for local Supabase).

```bash
pnpm install && pnpm supabase start && pnpm env:local && pnpm dev
```

Sign in as `owner@roomies.test`; the 6-digit code arrives in Mailpit at http://127.0.0.1:54324.

One command runs the whole suite, stopping at the first failure:

```bash
pnpm install && pnpm test:all
```

It resets the local database, then runs typecheck, lint, formatting, unit, use-case and component tests (with coverage targets), contract and row-level-security tests against local Supabase, and the end-to-end journeys on the iPhone 15 profile (including axe on every screen, light and dark). It takes a few minutes. The pieces run on their own too: `pnpm test`, `pnpm test:db`, `pnpm test:e2e`. See [docs/TESTING.md](docs/TESTING.md).

## Repo layout

```
docs/
  PRD.md                  product requirements (v1 scope)
  ARCHITECTURE.md         system design and data model
  FRONTEND.md             visual design and screens
  TESTING.md              test suite plan
  DEPLOYMENT.md           hosting and launch plan (M5): branches, staging vs prod, the steps
  architecture-guide.html interactive field guide to the build
  archive/mockup-v1.html  the original clickable prototype
```
