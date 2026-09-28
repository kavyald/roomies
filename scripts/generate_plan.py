"""Generates docs/IMPLEMENTATION_PLAN.md from one task list so tables, graph, and critical path agree.

Usage: python3 scripts/generate_plan.py docs/IMPLEMENTATION_PLAN.md
"""
import sys

SIZE_DAYS = {"S": 0.5, "M": 1.5, "L": 3}

MILESTONES = [
    ("M0", "Foundations", "The owner signs in on an iPhone and sees the empty app shell. A stranger's email gets no code."),
    ("M1", "House & members", "The house exists with its rooms and contacts, and all roommates have joined through invite links."),
    ("M2", "Items: needs, chores, tasks", "The house uses the needs list and chores for a week, and feelings re-rank the Home feed."),
    ("M3", "Polls, runs & calendar", "One grocery run (with a cost), one poll, and one super visit are completed. Dated things show on the calendar."),
    ("M4", "Notifications & launch", "Everyone gets reminders on their phone, and the house runs on production."),
]

# id, milestone, title, size, depends_on, description, done_when
T = [
    # ---------------- M0
    ("T01", "M0", "Repo scaffold", "M", [],
     "Next.js (App Router) + strict TypeScript + Tailwind v4 + Vitest + ESLint/Prettier, with the folder layout from Architecture §8 (`lib/domain`, `lib/app`, `lib/adapters`, `lib/client`, `compose.ts`, `config.ts`).",
     "`pnpm dev`, `pnpm test`, and `pnpm lint` all pass on an empty app."),
    ("T02", "M0", "CI + architecture guardrails", "S", ["T01"],
     "A GitHub Actions workflow runs typecheck, lint, and tests. `eslint-plugin-boundaries` enforces the layer rules: domain imports nothing, app imports only domain + ports, and only adapters/compose touch Supabase or Kysely.",
     "A PR that imports Supabase from `lib/domain` fails CI."),
    ("T03", "M0", "Supabase & email setup", "M", [],
     "Local Supabase via the CLI, plus staging and prod projects. Auth: public sign-up off, 6-digit email code with a 10-min expiry, code-only template. Resend as custom SMTP.",
     "A code email arrives from staging for an existing user, and an unknown email gets nothing."),
    ("T04", "M0", "Domain primitives", "S", ["T01"],
     "Branded ids, `Instant`, `When`/`LocalDate`, `Cents`, `Result`, `Actor`, plus time-zone and money helpers, with unit tests (including DST).",
     "The primitives are covered by tests, and no `Date.now()` appears in `lib/domain`."),
    ("T05", "M0", "Config + composition root", "S", ["T01", "T04"],
     "`loadConfig(env)` validated by Zod (the only reader of `process.env`) and `compose.ts` with `depsForRequest` / `depsForJob` / `depsForTest` stubs.",
     "A missing env var fails at startup with a clear message."),
    ("T06", "M0", "Ports + in-memory adapters", "M", ["T04", "T05"],
     "`ports.ts` (UnitOfWork, Repos, EventSink, Clock, IdGenerator, HouseQueries, ChangeFeed, AuthGateway, Config) plus memory fakes, a fixed clock, sequential ids, and a reusable contract-test harness.",
     "A sample use case runs end to end against the memory adapters in a test."),
    ("T07", "M0", "Base schema + RLS", "M", ["T03"],
     "Migrations for houses (with settings), members, rooms, invites, profiles, contacts, `activity_events` (typed subject columns, per-kind CHECKs, indexes, no UPDATE/DELETE grant), and notifications_outbox. `is_member` / `is_admin`, RLS on every table, a CI check that fails if any table lacks RLS, and a sizing script (`pg_column_size` / `pg_total_relation_size` on sample events).",
     "RLS tests show a non-member reads nothing and a member reads only their house. An UPDATE on activity_events is refused, and the sizing script prints real bytes per event kind."),
    ("T08", "M0", "Postgres UnitOfWork adapter", "M", ["T06", "T07"],
     "Kysely over the Supavisor transaction pooler with an `app_server` role. Each transaction runs `set local role authenticated` + the user's JWT claims. Includes the EventSink writer.",
     "The same contract tests pass against memory and Postgres, and `auth.uid()` inside a transaction equals the actor."),
    ("T09", "M0", "Design tokens + UI kit", "M", ["T01"],
     "Light/dark CSS tokens (base, elements, plum, tiers) and core components: Card, Button, Chip, Avatar, Sheet (Vaul), TabBar, ListRow, SegmentedControl, Toast, EmptyState.",
     "A `/dev/kit` page shows every component in light and dark at 375pt, passing a contrast check."),
    ("T10", "M0", "PWA shell + navigation", "M", ["T09"],
     "Manifest, icons, a service worker that caches the app shell, safe areas, the 5-tab layout (Home, Needs, Chores, Tasks, House) with empty screens, and the Add-to-Home-Screen guide.",
     "It installs to the iPhone Home Screen and opens standalone with the tab bar above the home indicator."),
    ("T11", "M0", "AppClient + data layer", "M", ["T06", "T10"],
     "The `AppClient` interface + React context, TanStack Query setup, the Supabase browser adapter for `HouseQueries`, and a server-action helper that validates input and maps `Result`.",
     "One screen reads through `useX()` hooks and renders with a fake AppClient in a component test."),
    ("T12", "M0", "Deploy pipeline", "S", ["T02", "T03"],
     "The Vercel project in the same region as Supabase, env vars per environment, preview deploys against staging, migrations applied on merge, and Sentry.",
     "Merging to main deploys staging automatically with migrations applied."),
    ("T13", "M0", "Sign-in (returning users)", "M", ["T03", "T05", "T09"],
     "An AuthGateway adapter (Supabase), `/sign-in` → 6-digit code screen with one-time-code autofill, session middleware, and sign out. The same message shows whether or not the email exists.",
     "An existing user signs in on iPhone. An unknown email sees the neutral message and gets no code."),
    # ---------------- M1
    ("T14", "M1", "Activity log", "M", ["T08"],
     "The `DomainEvent` union (catalog in Architecture §6.4), pure `activityRowFor` and `activityLine` (grouping by `action_id`), EventSink wiring, and the Activity screen with keyset pagination.",
     "Any use case that returns events produces activity rows in the same transaction (rollback test included), and a 3-task bulk move shows as one feed line."),
    ("T15", "M1", "House setup + rooms", "M", ["T08", "T13"],
     "The `setupHouse` use case + `/setup/[token]`, seeding the apartment's rooms (Air, Fire, Water, Earth, Bathrooms 1–3, Fitness space, …) and default feeling weights, with the owner as admin. Blocked once a house exists.",
     "The owner creates the house once, and a second attempt is rejected."),
    ("T16", "M1", "Invites + join flow", "L", ["T14", "T15"],
     "Pure `validateInvite`, `startInvite` / `acceptInvite` use cases, admin create/revoke/expiry/use-limit UI, `/join/[token]` (name + email → code → \"Which room is yours?\"), and per-IP rate limits.",
     "A roommate joins from a link. Expired, revoked, and used-up links are rejected, and everyone gets a `member.joined` entry."),
    ("T17", "M1", "House tab: members, rooms, contacts", "M", ["T11", "T16"],
     "Element-colored avatars, the roommates list, rooms grouped by floor (rename, reorder), contacts CRUD with Copy number, remove member / moved out, and delete my account.",
     "The super and landlord are saved. Removing a member revokes access (RLS test)."),
    # ---------------- M2
    ("T18", "M2", "Items core", "M", ["T08", "T14"],
     "The `items` migration with its CHECKs, the `Need | Chore | Task` domain union, pure `createItem` (duplicate-need check) / `editItem` / `markDone` / `doChore`, the items repo with `toDomain`/`toRow`, and the use cases.",
     "Each category's rules hold in both the domain and the database (a chore can't be done, a need can't repeat), tested on both adapters."),
    ("T19", "M2", "Add sheet + item detail", "M", ["T11", "T18"],
     "The \"+\" picker (Need / Chore / Task / Poll / Run, with poll and run disabled until M3), title-first forms per category, the room picker, and the item detail sheet shell.",
     "Any item can be added with just a title in 3 taps and opened in the detail sheet."),
    ("T20", "M2", "Needs tab", "M", ["T19"],
     "The shared list with *Needed soon* first, Got it (with undo), the Soon toggle, and \"We need…\" add that points to an existing duplicate.",
     "Adding \"tomatoes\" twice points to the first. Got it removes it with undo."),
    ("T21", "M2", "Chores tab", "M", ["T19"],
     "As-needed and about-every-N-days chores, \"last done\" meta, sorting by overdue, and one-tap Did it.",
     "An every-7-days chore last done 9 days ago sorts to the top, and Did it resets it."),
    ("T22", "M2", "Tasks tab", "S", ["T19", "T17"],
     "Tasks with a date, assignee, and **Handled by** (a contact, with Copy number), settable at creation or later from the detail (\"Needs outside help?\" / Change, including adding a new contact inline), plus the Mine / All / Outside help filters.",
     "An existing task can be handed to the super later and shows under Outside help with the super's number."),
    ("T23", "M2", "Feelings + notes", "M", ["T19", "T14"],
     "The `feelings` table, pure `setFeeling` (the event carries the previous one), the feeling sheet, \"How the house feels\", and the Earlier list from activity.",
     "Changing a feeling moves the old one into Earlier."),
    ("T24", "M2", "Priority + Home feed", "M", ["T20", "T21", "T22", "T23"],
     "Pure `scorePriority` + `isInFeed` (weights and `now` injected), the Needs attention feed with Mine / All, tier chips, and \"Why is this here?\"",
     "A table of test cases matches PRD §8.1, and an as-needed chore appears only after someone shares a feeling."),
    ("T25", "M2", "Feeling weights setting", "S", ["T24"],
     "House → Settings → Feeling weights: steppers from −20 to +40, Reset to defaults, the `setFeelingWeights` use case (any member), and the Home card announcing the change.",
     "Setting 😰 to +40 re-ranks the feed for every member, and a non-admin can do it."),
    ("T26", "M2", "Realtime sync", "S", ["T11", "T18"],
     "A `ChangeFeed` adapter (Supabase Realtime) filtered by house that invalidates the matching queries.",
     "A change on one phone appears on another within a couple of seconds."),
    # ---------------- M3
    ("T27", "M3", "Polls", "M", ["T19", "T14"],
     "`polls`, `poll_options`, `poll_votes`. Pure `createPoll` / `vote` / `closePoll` (most votes wins, a tie → \"Tie\"), the poll sheet, `addPollOption` (anyone, while open), \"+ Poll about this\" on items, standalone polls, and Open polls on Home.",
     "\"Which vacuum?\" on a need and a standalone \"House name?\" both work, and a 2–2 result shows a tie."),
    ("T28", "M3", "Runs (batches) + item actions", "L", ["T20", "T21", "T22"],
     "`runs` (kind + per-kind status) and `items.run_id` / `run_kind` (current run, composite foreign key). History comes from `run.item_*` activity events, read back by pure `runHistory` / `itemPath`. Pure `startRun` / `addToRun` / `markRunItemsDone` / `moveRunItems` / `returnToPool` / `finishRun` (effects as data). Start a run from Needs, the run sheet with selection + bulk actions, \"On X's run\" badges, Runs in progress on Home, and item history.",
     "An item can only be on one run. Selected items can be done, moved to another run, or put back with a note, and finishing returns the rest."),
    ("T29", "M3", "Costs", "M", ["T19", "T28"],
     "The `costs` table, `addCost`, Add cost on items, \"Did you spend money?\" on finishing a run, Open Splitwise copy, and Spent this month on House.",
     "Finishing a grocery run with $42.50 records one cost on the run and updates Spent this month."),
    ("T30", "M3", "Requests & visits", "L", ["T28", "T22"],
     "Request runs (gathering → sent → closed) and visit runs. `addToRequest` (\"Add to Landlord list\"), `sendRequest` (composed message + copy + mark as sent), `handToContact`, Move to a visit (new or existing, optional date), `setVisitDate`, the **New request or visit** entry point on Tasks (start a request for any contact, or plan a visit), Requests & visits on Tasks, the tasks-only rule, and the feed rule for tasks on a visit.",
     "Landlord list → sent → the reply is recorded by moving 2 tasks to a new visit and 1 back to the pool with a note. The request closes itself, and each task's history shows the path."),
    ("T31", "M3", "Calendar + Coming up", "M", ["T20", "T22", "T28"],
     "The Coming up strip on Home (the next 7 days of dated tasks, needs, and runs) and the month calendar with a day list.",
     "Dated items and runs show on the right days, and tapping one opens it."),
    # ---------------- M4
    ("T32", "M4", "Job runner", "S", ["T08", "T12"],
     "`/api/cron/*` with a secret header, `depsForJob()` (system actor), and a pg_cron + pg_net migration that calls the routes on schedule.",
     "A no-op job runs every 15 minutes on staging and logs success."),
    ("T33", "M4", "Notification outbox", "M", ["T14"],
     "Pure `notificationsFor` (per-category prefs, quiet hours in the house timezone), `notification_prefs`, and EventSink writing outbox rows in the same transaction.",
     "Table tests cover quiet hours, and a 😰 feeling enqueues a message for the assignee."),
    ("T34", "M4", "Web push", "M", ["T33", "T10", "T32"],
     "VAPID keys, the enable-notifications flow, the service worker `push` / `notificationclick`, a PushSender adapter (drops 404/410 subscriptions), and `sendNotifications` (right after commit + every 5 min).",
     "An installed iPhone receives a push within seconds of being assigned something."),
    ("T35", "M4", "Reminder jobs", "M", ["T32", "T33", "T21", "T22", "T27", "T28"],
     "`runReminders` (due tasks and chores, polls closing tomorrow, dated runs tomorrow) and `closeDuePolls`, all with an injected clock.",
     "Each job has fixed-clock tests and is idempotent when run twice."),
    ("T36", "M4", "Notification settings", "S", ["T33"],
     "Personal settings (under your avatar): per-category toggles, quiet hours, and theme.",
     "Turning off a category stops those messages from being enqueued."),
    ("T37", "M4", "UX polish pass", "M", ["T25", "T29", "T30", "T31", "T17"],
     "Empty states, a copy pass against the FRONTEND voice table, completion bursts, reduced motion, and dark mode checks.",
     "Every screen has an empty state, and no copy uses \"overdue,\" \"failed,\" or \"missed\" about a person."),
    ("T38", "M4", "E2E + accessibility", "M", ["T37", "T34"],
     "Playwright on the iPhone profile: join, add a need, grocery run with a cost, poll with a tie, plan + finish a visit, share a feeling, change a feeling weight. Plus a VoiceOver pass and a contrast check.",
     "E2E suite green on the preview URL, with no critical VoiceOver issues."),
    ("T39", "M4", "Production launch", "S", ["T38", "T35", "T12"],
     "Prod project and env, a weekly `pg_dump` backup workflow, an uptime ping, the setup link for the owner, then invites to roommates.",
     "All roommates are on prod and a backup restores into staging."),
]

ids = [t[0] for t in T]
by = {t[0]: t for t in T}
assert len(ids) == len(set(ids)), "duplicate ids"
for t in T:
    for d in t[4]:
        assert d in by, f"{t[0]} depends on unknown {d}"
        assert ids.index(d) < ids.index(t[0]), f"{t[0]} depends on later task {d}"

# earliest finish (days) and critical path
ef, prev = {}, {}
for t in T:
    start = max((ef[d] for d in t[4]), default=0.0)
    prev[t[0]] = max(t[4], key=lambda d: ef[d]) if t[4] else None
    ef[t[0]] = start + SIZE_DAYS[t[3]]
end = max(ef, key=ef.get)
path, cur = [], end
while cur:
    path.append(cur); cur = prev[cur]
path.reverse()
total = sum(SIZE_DAYS[t[3]] for t in T)
dependents = {i: [t[0] for t in T if i in t[4]] for i in ids}

out = []
w = out.append
w("# Roomies — Implementation Plan\n")
w("**Status:** Draft v0.1  ")
w("**Built from:** [PRD.md](./PRD.md) · [ARCHITECTURE.md](./ARCHITECTURE.md) · [FRONTEND.md](./FRONTEND.md) · [mockup.html](./mockup.html)  ")
w("**Last updated:** 2026-09-25\n")
w("> **Generated file.** The task list lives in [`scripts/generate_plan.py`](../scripts/generate_plan.py), so the tables, the dependency graph, and the critical path always agree. To change a task, edit the list there and run `python3 scripts/generate_plan.py docs/IMPLEMENTATION_PLAN.md`. The script fails if a dependency is unknown or points forward.\n")
w("---\n")
w("## 1. How the work is divided\n")
w("- **Milestones follow the PRD release plan** (§12, v1 scope). Everything in PRD §13 (bills, belongings, rotations, outside-help stages, heads-ups, info, email) is out of this plan.")
w("- **Each task is a vertical slice** (migration → domain types + pure functions → use case → adapter → UI → tests), so it can be demoed and merged on its own. The exceptions are the M0 plumbing tasks, which have nothing to show on screen.")
w("- **Tasks are sized** S ≈ half a day, M ≈ 1–2 days, L ≈ 3 days, for one person. The estimates are only used to find the critical path.")
w("- **Dependencies are hard dependencies only**: a task can't start until the tasks it depends on are merged. Everything else can happen in any order.\n")
w("### Definition of done (every task)\n")
w("1. The migration (if any) has RLS on every new table, plus an RLS test.")
w("2. Domain functions are pure, with unit tests. Use cases are tested against the in-memory adapters with a fixed clock.")
w("3. New ports or adapters pass the shared contract tests on both memory and Postgres.")
w("4. Lint boundaries pass. No `process.env`, `new Date()`, or Supabase imports outside the allowed layers.")
w("5. It's deployed to a preview, checked at 375pt in light and dark, and uses the copy voice from FRONTEND §7.\n")
w("---\n")
w("## 2. Summary\n")
w(f"- **{len(T)} tasks** across **{len(MILESTONES)} milestones**, about **{total:g} working days** in total for one person.")
w(f"- **Critical path** (longest chain of dependencies, about **{ef[end]:g} days**): " + " → ".join(f"{p}" for p in path) + ".")
w("- Everything off the critical path can fill gaps, e.g. while waiting on a review or on a roommate to test.\n")
w("| Milestone | Tasks | Est. days | Exit criteria |")
w("|---|---|---|---|")
for m, name, exitc in MILESTONES:
    ts = [t for t in T if t[1] == m]
    w(f"| **{m} · {name}** | {ts[0][0]}–{ts[-1][0]} ({len(ts)}) | {sum(SIZE_DAYS[t[3]] for t in ts):g} | {exitc} |")
w("")
w("---\n")
w("## 3. Dependency graph\n")
w("Arrows point from a task to the tasks it unblocks. Critical-path tasks are outlined in plum. It renders on GitHub.\n")
w("```mermaid")
w("flowchart TD")
w("  classDef crit stroke:#7A3E6E,stroke-width:3px;")
for m, name, _ in MILESTONES:
    w(f'  subgraph {m}["{m} · {name}"]')
    for t in T:
        if t[1] == m:
            w(f'    {t[0]}["{t[0]} {t[2]}"]')
    w("  end")
for t in T:
    for d in t[4]:
        w(f"  {d} --> {t[0]}")
w("  class " + ",".join(path) + " crit;")
w("```\n")
w("---\n")
w("## 4. Tasks\n")
for m, name, exitc in MILESTONES:
    w(f"### {m} · {name}\n")
    w(f"**Exit:** {exitc}\n")
    w("| ID | Task | Size | Depends on | Unblocks |")
    w("|---|---|---|---|---|")
    for t in [t for t in T if t[1] == m]:
        deps = ", ".join(t[4]) or "—"
        unb = ", ".join(dependents[t[0]]) or "—"
        crit = " ⭑" if t[0] in path else ""
        w(f"| {t[0]}{crit} | **{t[2]}** | {t[3]} | {deps} | {unb} |")
    w("")
    for t in [t for t in T if t[1] == m]:
        w(f"- **{t[0]} {t[2]}**: {t[5]}  ")
        w(f"  *Done when:* {t[6]}")
    w("")
w("⭑ = on the critical path.\n")
w("---\n")
w("## 5. Suggested order for one person\n")
w("A valid order that follows every dependency, front-loads the critical path, and gets something usable to the house early:\n")
order = []
done = set()
crit = set(path)
remaining = list(ids)
while remaining:
    ready = [i for i in remaining if all(d in done for d in by[i][4])]
    ready.sort(key=lambda i: (by[i][1], 0 if i in crit else 1, ids.index(i)))
    nxt = ready[0]
    order.append(nxt); done.add(nxt); remaining.remove(nxt)
for m, name, _ in MILESTONES:
    seq = [i for i in order if by[i][1] == m]
    w(f"{m}. " + " → ".join(seq))
w("")
w("**Early-feedback checkpoints**")
w("- **After T20:** the needs list works. That's the first thing worth handing to roommates, even before chores and the feed.")
w("- **After T28–T29:** grocery runs with costs work, which is the first real weekly use.")
w("- **After M2:** if people forget to open the app, pull **T32–T34** (push) ahead of M3. They only depend on M0 tasks plus T14.\n")
w("---\n")
w("## 6. Parallel tracks\n")
w("For a second contributor (or to interleave work), these groups have no dependencies on each other once their inputs are done:\n")
w("| Track | Tasks | Needs first |")
w("|---|---|---|")
w("| UI kit & shell | T09, T10 | T01 |")
w("| Infra & deploy | T03, T07, T12 | — |")
w("| Needs / chores / tasks tabs | T20, T21, T22 | T19 (T22 also T17) |")
w("| Polls | T27 | T19, T14 |")
w("| Notifications | T33, T36, then T34 | T14 (T34 also T32, T10) |")
w("")
w("---\n")
w("## 7. Out of scope (later)\n")
w("Everything in PRD §13: bills, belongings & ownership, rotating chores, outside-help stages, standalone heads-ups, info items, +1s, full priority presets, tags/attachments/links, email digest, passkeys, Splitwise API, multiple houses. None of these block v1, and none are in the graph.\n")

open(sys.argv[1], "w").write("\n".join(out))
print("critical path:", " → ".join(path), f"({ef[end]} days), total {total} days")
