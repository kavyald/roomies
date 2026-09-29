# Build log

Judgment calls, deviations, and blockers, newest last. Format: date · task · what · why.

| Date | Task | What | Why |
|---|---|---|---|
| 2026-09-29 | T01 | TypeScript 5.9 and ESLint 9, not the newest TypeScript 7 / ESLint 10. | `typescript-eslint` (pulled in by `eslint-config-next`) supports TypeScript `<6.1`, and `create-next-app@16.3.7` scaffolds ESLint 9. |
| 2026-09-29 | T01 | Added `AGENTS.md` holding the Next.js agent-rules block. | Next 16's `next dev` writes that block into `CLAUDE.md` unless `AGENTS.md` exists. Keeping it separate leaves `CLAUDE.md` hand-written. |
| 2026-09-29 | T01 | Next 16 renames `middleware.ts` to `proxy.ts`, and request APIs (`cookies()`, `params`) are async only. | Noted for T13's session handling. |
| 2026-09-29 | T01 | Prettier: no semicolons, single quotes, width 100; Markdown is not formatted. | Matches the code samples in ARCHITECTURE.md; the docs are hand-written. |
