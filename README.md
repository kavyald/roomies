# Roomies

A shared, phone-first hub for a house of roommates: what we need to buy, what needs doing, what we need to decide, and how everyone feels about it.

> **Status: planning.** The product, architecture, and visual design are specified, and a clickable prototype exists. No app code yet. Building starts with task T01 in the [implementation plan](docs/IMPLEMENTATION_PLAN.md).

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

[`docs/mockup.html`](docs/mockup.html) is a clickable iPhone prototype with sample data. Open it in any browser:

```bash
open docs/mockup.html
```

Things to try: vote on "Which vacuum?", record the landlord's reply on the Landlord request (Tasks tab), finish a grocery run and log the cost, change a feeling weight under House → Settings, and check House → Activity.

## Docs

| Doc | What's in it |
|---|---|
| [PRD](docs/PRD.md) | Problem, the five concepts, feature specs, priority formula, invites and access, notifications, what's parked for later (§13), and the decision log |
| [Architecture](docs/ARCHITECTURE.md) | Stack, auth and row-level security, the data model and domain types, the function catalog, the activity log schema, jobs, and ops |
| [Frontend](docs/FRONTEND.md) | Visual language (inspired by Focus Friend), color system, the apartment's rooms, screens, copy voice, and motion |
| [Implementation plan](docs/IMPLEMENTATION_PLAN.md) | 39 tasks across 5 milestones with sizes, dependencies, a dependency graph, and the critical path |

## Planned stack

- **Next.js** (App Router) + TypeScript + Tailwind, installable as a **PWA**
- **Supabase**: Postgres with row-level security, email-code auth, Realtime, and pg_cron
- **Vercel** for hosting, **Resend** for sign-in emails, **Web Push** for notifications
- **Ports & adapters** with dependency injection: a pure domain layer, use cases with injected dependencies, and adapters for Supabase, Postgres (Kysely), and push. See [Architecture §4.1](docs/ARCHITECTURE.md).

Everything targets free tiers for one house of 2–8 people.

## Roadmap

| Milestone | Scope |
|---|---|
| **M0 Foundations** | Repo, CI, Supabase, sign-in, PWA shell, UI kit |
| **M1 House & members** | House setup with rooms, invites, members, activity log |
| **M2 Items** | Needs, chores, tasks, feelings, priority feed, feeling weights |
| **M3 Polls, runs & calendar** | Polls, runs, requests and visits, costs, calendar |
| **M4 Notifications & launch** | Web push, reminders, polish, end-to-end tests, production |

Roughly 53 working days for one person. The critical path runs through the core plumbing, items, runs, and requests and visits. Parked for v2: bills, ownership of shared things, heads-ups with a calendar button, rotating chores, and the Splitwise API ([PRD §13](docs/PRD.md)).

Tasks are also tracked on the **roomies** board in Weyve.

## Updating the plan

The implementation plan is generated from one task list, so the tables, the graph, and the critical path always agree:

```bash
python3 scripts/generate_plan.py docs/IMPLEMENTATION_PLAN.md
```

Edit the task list in [`scripts/generate_plan.py`](scripts/generate_plan.py), then rerun. The script fails if a dependency points at an unknown or later task.

## Repo layout

```
docs/
  PRD.md                  product requirements (v1 scope)
  ARCHITECTURE.md         system design and data model
  FRONTEND.md             visual design and screens
  IMPLEMENTATION_PLAN.md  generated task plan
  mockup.html             clickable prototype
scripts/
  generate_plan.py        source of truth for the task plan
```
