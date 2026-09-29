# Build log

Judgment calls, deviations, and blockers, newest last. Format: date · task · what · why.

| Date | Task | What | Why |
|---|---|---|---|
| 2026-09-29 | T01 | TypeScript 5.9 and ESLint 9, not the newest TypeScript 7 / ESLint 10. | `typescript-eslint` (pulled in by `eslint-config-next`) supports TypeScript `<6.1`, and `create-next-app@16.3.7` scaffolds ESLint 9. |
| 2026-09-29 | T01 | Added `AGENTS.md` holding the Next.js agent-rules block. | Next 16's `next dev` writes that block into `CLAUDE.md` unless `AGENTS.md` exists. Keeping it separate leaves `CLAUDE.md` hand-written. |
| 2026-09-29 | T01 | Next 16 renames `middleware.ts` to `proxy.ts`, and request APIs (`cookies()`, `params`) are async only. | Noted for T13's session handling. |
| 2026-09-29 | T01 | Prettier: no semicolons, single quotes, width 100; Markdown is not formatted. | Matches the code samples in ARCHITECTURE.md; the docs are hand-written. |
| 2026-09-29 | T06 | `Repos` covers only the M0 tables (houses, profiles, members, rooms, contacts, invites + the EventSink). Items, polls, runs, costs and feelings repos join with their tasks. `DomainEvent` likewise holds the item and house/people/places families now; feelings, polls, runs and money join later. | Keeps each port honest about what exists; the architecture's full list is the target. |
| 2026-09-29 | T06 | The memory UnitOfWork enforces the same access rules as the RLS policies (member of the house; admins for invites and members; own profile; events only in your own name). | A use case that reaches across houses fails in unit tests too, not just against Postgres. T07's policies must match `lib/adapters/memory/db.ts`. |
| 2026-09-29 | T06 | `activityRowFor` lives in `lib/domain/events.ts` now (T14 adds `activityLine` and the screen). | The EventSink (T06 memory, T08 Postgres) needs the mapping. |
| 2026-09-29 | T06 | ARCHITECTURE A21: `uow.run` rolls back on a failed Result; `EventSink.record(houseId, events, at)`. | See the decision log. |
| 2026-09-29 | T03 | **Blocked.** `supabase start` fails: Docker "input/output error" creating the db container. The Mac has ~190 MB free; Docker.raw uses ~179 GB (21 GB reclaimable build cache inside). Waiting on the owner to free disk space. T03's config, template and seed are written but uncommitted. | Outside the code; freeing space means deleting the owner's data, so it's their call. |
| 2026-09-29 | T03 | Unblocked after the owner freed space and restarted Docker. Supabase images pulled during the disk-full window were corrupt (Studio crashed), so they and this project's Supabase volumes were removed and pulled fresh. Other projects' images were left alone. | Recovery from the disk-full incident. |
| 2026-09-29 | T03 | Only `[auth] enable_signup = false`; `[auth.email] enable_signup` stays true. | In GoTrue the email-level switch disables the whole email provider, codes included ("Email logins are disabled"). |
| 2026-09-29 | T03 | GoTrue's own `/auth/v1/otp` answers an unknown email with 422 "Signups not allowed for otp" (a known one gets 200), so a direct caller with the anon key can tell whether an email has an account. | T13 sends codes through a server route that always returns the same neutral message (and rate-limits); the UI never shows GoTrue's answer. Worth revisiting for prod (E1). |
