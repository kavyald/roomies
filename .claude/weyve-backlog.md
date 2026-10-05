# Weyve backlog

Card updates waiting for Weyve access (since 2026-10-05: the API answers `HTTP 403: beta access is
not enabled for this account`). When access is back, apply each entry to its card on project
`736d65d894464a82b9cc38603c43a532` (find the card by ID with `find_tasks`), then delete the entry.
Delete this file once it's empty.

## Q6 M6 tests

- `append_note`: "Decision 2026-10-05: in m6-tap-targets, the Quiet hours switch on /me is scrolled into view before the viewport check, instead of having to fit above the 667pt fold. Why: CI's Linux WebKit has none of the app's fonts (SF Pro Rounded, Nunito), so the fallback wraps the notification descriptions onto more lines and pushed the switch below the fold (run 37097127620 failed in light and dark). PRD §12 asks only item views to fit without scrolling; the sideways fit and axe checks on /me stay. Commit bafe746."
