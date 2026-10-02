# Roomies — Product Requirements Document

**Status:** v1 scope (2026-09-28). Simplified to five concepts: needs, chores, tasks, polls, runs.
**Owner:** Kavya
**Companions:** [ARCHITECTURE.md](./ARCHITECTURE.md) · [FRONTEND.md](./FRONTEND.md) · [mockup v1](./archive/mockup-v1.html)

> Decisions are marked **[DECIDED]**. The ones you answered directly are tagged *(owner)*. §13 lists what's deliberately **not** in v1, and §14 is the decision log.

---

## 1. Problem

When you move in with roommates, and while you live with them, a lot of information and responsibility piles up:

- **Things get dropped.** Buying what the house needs, keeping up with chores, getting the super to fix the leak: nobody knows who's on what or what's already done.
- **Decisions stall.** "Which vacuum?" or "keep the lamp?" gets lost in the group chat.
- **Priorities differ and concerns go unheard.** One roommate is stressed about the heat not working, and another doesn't know it matters to them. Group chats bury these signals.

## 2. Solution

Roomies is a shared, phone-first house hub built on **five concepts**:

| Concept | What it is | Examples |
|---|---|---|
| **Need** | Something the house needs to buy. Cost only matters when it matters. | Tomatoes, dish soap, a vacuum |
| **Chore** | Ongoing upkeep | Wipe the stove, clean Bathroom 3 about weekly |
| **Task** | Anything one-off, optionally handled by someone outside the house | Fix the door latch, assemble the vacuum, radiator (super), set up for the party |
| **Poll** | A question with options, about an item or on its own | Which vacuum? Keep it? House name? |
| **Run** | A batch of items handled together: by a roommate (**batch**), asked of a contact (**request**), or taken on by a contact (**visit**) | Grocery run, landlord request, super visit, party setup |

Needs, chores, and tasks are **items**. Any roommate can attach a **feeling** (e.g. 😰 anxious) plus a note to any item. Feelings raise priority, so concerns are both *heard* and *acted on*. A **Home feed** ranks what needs attention, and a **calendar** shows anything with a date.

### 2.1 Goals

1. One place for what the house needs to buy, do, and decide.
2. Make ownership visible without forcing it: things can sit in a shared pool until someone takes them on.
3. Surface emotional signal (stress, frustration) as a first-class input to prioritization.
4. Work from any roommate's iPhone with no App Store install.

### 2.2 Non-goals (v1)

- **No in-app payments.** We record what was spent and hand off to Splitwise. We never move money.
- **No replacement for the group chat.** There are no comment threads. Each person's feeling + note on an item is the only in-app conversation (§7).
- **No landlord or super accounts.** They're contacts, not users.
- **No native Android polish.** It will work in Android Chrome, but we design and QA for iPhone Safari.
- Everything in §13 (bills, ownership, rotations, and more) waits until after v1.

### 2.3 Success metrics

- Every roommate joins within 48h of the invite being sent.
- The house uses the needs list and at least one run per week for a month.
- Median time from a 😰 feeling to the item being done goes down over the first month.
- Each roommate opens the app at least 2×/week.

---

## 3. Users & usage requirements

| Persona | Needs |
|---|---|
| **House organizer** | Sets up the house, invites people, cares about structure |
| **Casual roommate** | Wants to see what needs doing and add things fast with minimal typing |
| **Anxious or conflict-averse roommate** | Wants a low-friction way to flag "this is bothering me" without starting a confrontation |

**Requirements**

- Every roommate uses the app from their own phone, with their own identity.
- The UI is designed for **iPhone Safari, portrait, 375–430pt widths**, installable to the Home Screen as a PWA.
- Common actions (add an item, mark done, add a feeling, vote) take **≤ 3 taps**.
- House size: **2–8 members** (design target 2–5).
- **[DECIDED] (owner)** v1 is for **one house**. There's no public sign-up and no house switcher. The owner creates the house through a one-time private setup link, and after that the only way anyone gets an account is a valid invite link. Every row still carries a `house_id`.

---

## 4. Information architecture

### 4.1 How we got to five concepts

- **Types, not topics.** The original tabs (subscriptions, chores, reaching out, purchases) mixed *what kind of thing* with *what it's about* ("internet" appeared everywhere). Items are organized by what you do with them. Location is a **room**.
- **Needs, not purchases.** Most things the house buys are small (tomatoes) and shouldn't require a price. So a **need** is "we need X." Money is recorded only when someone actually spends it (§6.6).
- **One-offs are just tasks.** A broken thing, an errand, event prep, and "assemble the vacuum" are all tasks added by someone.
- **Polls and runs stand on their own.** A poll can be about an item or about nothing ("house name"). A run batches any needs and tasks: a grocery run, an Amazon order, a super visit, party setup.
- **Things don't change type. New ones get created.** When the vacuum arrives, the need is done. "Assemble the vacuum" is a new task and "Keep it?" is a new poll about it. **[DECIDED] (owner)**

### 4.2 Supporting entities

- **Rooms:** the apartment's real spaces, seeded at setup. First floor: hallway, Air, Fire, Water, Bathroom 1, Bathroom 2, front door, kitchen, living room, stairs. Basement: downstairs living room, Bathroom 3, laundry, craft room, Earth, fitness space. Outside: garden. **Air, Fire, Water, and Earth are the four bedrooms**, and each member's bedroom sets their color (FRONTEND §4).
- **Contacts:** super, landlord, providers. Name, phone, and a note.
- **Members:** the roommates (§10).

### 4.3 Navigation (bottom tab bar, 5 tabs)

| Tab | Contents |
|---|---|
| **Home** | **Coming up** (the next 7 days of dated items and runs; tap for the calendar), **Open polls**, **Runs in progress**, then the ranked **Needs attention** feed (*Mine / All*) |
| **Needs** | The shared list of things to buy. Needs with a feeling come first. **Start a run** from here. |
| **Chores** | Chores, sorted by what's due for a go, with "last done" |
| **Tasks** | **Requests & visits** (unsent and sent requests, planned visits) with **+ New** (start a request or plan a visit), then tasks with filters *Mine / All / Outside help* |
| **House** | **Settings** (feeling weights), rooms, contacts, roommates, invite link, activity log |

A floating **"+"** opens a picker (Need / Chore / Task / Poll / Run) and then a short form. Only the title is required.

---

## 5. Items (needs, chores, tasks)

Every item has:

| Field | Notes |
|---|---|
| title | required, ≤ 120 chars |
| category | need / chore / task. It never changes. |
| note | optional |
| room | optional, one room |
| assignee | optional, one member ("who's on it"). Empty means anyone. |
| when | optional date (+ time). Due date for a task, "needed by" for a need. |
| priority | Low / Normal / High / Urgent, default Normal |
| feelings | one current feeling + note per member (§7) |
| done | who and when |

- **[DECIDED]** (owner, D30) Removing an item is called **Delete**. It asks first ("Delete this? You can undo it right after."), and the toast offers Undo. The row is kept for history (soft delete), and a deleted item opened from the activity log can be brought back. There's no archive list and no time limit.
- **[DECIDED]** Any member can edit any item. Edits go to the activity log.

---

## 6. Feature specs

### 6.1 Needs (things to buy)

- **Adding:** a title is enough ("tomatoes"). Optional: room, who's getting it, needed by, note ("the oat one, not almond").
- **Urgency comes from feelings**, not a separate flag. **[DECIDED] (owner)** 😰 "we're on the last roll" does what a "needed soon" toggle would, and it says why. Needs with a feeling sort to the top of the list. A needed-by date also raises priority.
- **Adding something that's already on the list** doesn't duplicate it. The app points to the existing one.
- **Clearing a need:**
  - **Got it:** check it off directly.
  - **On a run:** it's checked off when the run finishes (§6.5).
- **Money is optional.** Tomatoes never ask for a price. For a bigger need, anyone can **add a cost** when it's bought (§6.6).
- **Bigger needs** use the same item plus the other concepts: a **poll** to choose ("Which vacuum?"), a **run** to order it (an Amazon order), a **cost**, and later new **tasks** ("Assemble it") or **polls** ("Keep it?").
- Needs appear in the Home feed only when someone shares a feeling on them or the needed-by date is close. The list itself lives on the Needs tab.

### 6.2 Chores (ongoing upkeep)

- **Two kinds of schedule** **[DECIDED]**:
  - **As needed** (default): no due date. The chore shows "last done 9 days ago · Wren." It appears in the Home feed only if someone shares a feeling on it (😤 "something in the fridge is alive").
  - **About every N days:** it enters the Home feed once it's past N days since last done. Priority grows the longer it's past.
- **Anyone can do it:** tap **Done** to record who and when. An optional **assignee** covers "Jo always waters the garden."
- Chores can go on a run (e.g. a cleaning session).
- **[DECIDED] (owner)** No chore balance or "who's done what" view.

### 6.3 Tasks (one-offs)

- Anything done once: fix the latch, get renter's insurance, assemble the vacuum, set up for the party.
- **Optional "Handled by":** pick a **contact** (super, landlord, provider) when someone outside the house needs to do it. The task shows "Handled by: Super," the contact's number (copy button), and appears under the *Outside help* filter.
  - **Setting it:** when adding the task, or **any time later** from the task's detail ("Needs outside help?" / "Change"). You can pick an existing contact, **add someone new** right there (name + optional phone, saved to Contacts), or switch back to "One of us." **[DECIDED] (owner)**
  - Planning a visit or adding it to a contact's list also sets it.
  - **While the task is on a request or visit, "Handled by" follows that run.** To change it, move the task (Move to…, Back to the pool…, Hand to…); "Who's handling it?" says so and opens the run.
- **"Handled by" is who *should* handle it.** Whether they've actually taken it on is tracked by the **request** and **visit** it's on (§6.5): *on the landlord list · not sent* → *sent to landlord · 2 days ago* → *landlord visit · Thu 10:00* → *fixed*.
- **"Add to Landlord list"** on a task with a contact puts it on that contact's unsent request (starting one if needed).
- Tasks can have a date (shows on the calendar) and an assignee.

### 6.4 Polls

- **A question + 2 or more options.** It's either **about an item** ("Which vacuum?" on the Vacuum need, "Keep it?" on the Vacuum need after it arrives) or **standalone** ("House name?").
- Options have a label and an optional note (e.g. a link or a price: "Dyson V8, $189").
- **[DECIDED] (owner) Anyone can add options while the poll is open**, not just at creation. Existing votes stay. People who already voted can switch to the new option. Each option shows who added it. Duplicate labels are rejected, and once the poll closes, options are locked.
- **Voting:** each member picks one option and can change their vote until the poll closes.
- **Closing:** anyone can close it, or it closes at an optional deadline.
- **[DECIDED] (owner) Result:** the option with the most votes wins. **If the top options are tied, the result is "Tie,"** the app does nothing automatically, and the house talks it out (in feeling notes or in person).
- Open polls show on Home with how many people have voted.
- Polls don't change other items. Acting on a result ("buy the Dyson," "return it") is a new task or need someone adds.

### 6.5 Runs: batches, requests & visits **[DECIDED] (owner)**

A run is **a batch of items handled together**. There are three kinds:

| Kind | What it means | Examples | Lifecycle |
|---|---|---|---|
| **Batch** | A roommate takes these on | Grocery run, Amazon order, party setup | open → finished |
| **Request** | The house is asking a contact to take these on | "Landlord request": the leak, the window, the mold | **gathering** (anyone adds) → **sent** (waiting on a reply) → **closed** (everything on it has been sorted) |
| **Visit** | A contact **has taken these on** | "Landlord visit · Thu 10:00," "Super visit · date TBD" | open (date optional) → finished |

**Responsibility moves when a task moves from a request to a visit.** Before that, it's still on the house.

**Requests**
- **Starting one:** Tasks → Requests & visits → **+ New** → *Ask someone (request)* → pick a contact (or add someone new) and any tasks. It can start empty. Or tap "Add to Landlord list" on a task, or use "Hand to…" from another run.
- **Gathering:** anyone can add tasks while it's unsent.
- **Send request** builds a message (a numbered list with rooms and notes), which you copy and send by text, email, the portal, or in person. **Roomies never sends on your behalf.** "Mark as sent" records when and how.
- **Waiting:** the request shows "Sent 2 days ago · waiting on 3." There's no automatic nudge in v1.

**Recording the reply is just actions on the tasks. There's no special reply form.** In any run's sheet, select one or more tasks (or *Select all*) and:

| Action | Use it when | What happens |
|---|---|---|
| **Move to a visit…** / **Move to…** | The landlord accepted ("sending a plumber Thu") | The tasks go to an existing visit or a **new visit** with that contact (date optional), with an optional note |
| **Back to the pool…** | "That one's on you," or not done this time | The tasks leave the run with a **note**, and optionally "Handled by" switches back to *One of us* |
| **Hand to…** | "Call a plumber yourselves" | "Handled by" changes to another contact (or someone new), and the tasks join that contact's unsent list |
| **Done** / **Fixed** | It's already sorted | The tasks are marked done |

- **Bulk by design:** one reply usually covers several tasks, so every action works on a selection.
- **A request closes on its own** once nothing is left on it.
- **History:** each task keeps a history of every request and visit it passed through, with the notes ("Sent to landlord by text → Moved to Landlord visit · Sending a plumber → Fixed").
- The same actions work in batches and visits too (e.g. move an item from Wren's run to Saturday's run).

**Visits and batches**
- **Planning a visit** directly (when they've already agreed): Tasks → Requests & visits → **+ New** → *They've agreed (visit)*. It's also created by "Move to a visit → New visit."
- **Requests and visits hold tasks only.** Needs and chores stay in batches.
- **Finishing:** mark things done or fixed as you go, then **Finish**. Anything left goes back to the pool with the note "Not done this time."
- **Batches** ask **"Did you spend money?"** on finish, which records one cost (§6.6).
- While open, items show **"On Kavya's run"** or **"Sent to Landlord · 2 days ago"** so nobody doubles up. **An item can be on only one open run at a time.**
- Runs with a date show in Coming up and on the calendar.

### 6.6 Money (costs)

- **[DECIDED]** Money is a **cost record**: an amount, who paid, an optional note, and what it was for (an item or a run). Nothing requires one.
- **Adding one:** "Add cost" on any item, or "Did you spend money?" when finishing a run.
- **Split** is equal among all members in v1.
- **Open Splitwise** copies "{title} — ${amount}" and opens Splitwise. **[DECIDED] (owner)** There's no Splitwise API in v1.
- The House tab shows **"Spent this month: $X · your share $Y"**.

### 6.7 Calendar

- Shows **anything with a date**: tasks, needs with a needed-by date, and runs (grocery runs, deliveries, visits, party setup).
- **Coming up** (Home) shows the next 7 days. The full calendar is a month grid with a day list.
- A plain heads-up ("Jo's parents staying Sat") is a **task with a date** in v1.

---

## 7. Feelings

- **Opt-in.** A roommate adds a feeling to an item only when they think the house should know how they feel about it. Nobody is prompted. **(owner)**
- **About the item, never the person.** There's no per-person mood, and avatars never show feelings. **(owner)**
- **One current feeling + an optional note** (≤ 280 chars) per member per item. Changing it moves the old one to an **Earlier** list, so the conversation isn't lost. **(owner)** Feeling notes replace comments.
- **Always named.** There's no anonymous option. **(owner)**
- When someone adds 😰 or 😤, the item's assignee gets a notification.

| Feeling | Emoji | Default weight | Meaning |
|---|---|---|---|
| Anxious | 😰 | +20 | This is stressing me out |
| Frustrated | 😤 | +15 | This keeps happening / isn't getting handled |
| Confused | 😕 | +5 | I don't understand what's going on |
| Fine | 🙂 | 0 | Aware. Also the choice for a plain update. |
| Not a big deal | 😌 | −5 | Don't prioritize this on my account |
| Thanks | 🙏 | 0 | Appreciation |

The weights are editable (§8.2).

---

## 8. Priority

### 8.1 Formula

The score is computed when the feed is shown, because it depends on today's date.

```
score = base(priority) + due_pressure(when or chore rhythm) + Σ feeling_weight(each member's current feeling)
clamped to 0–100
```

| Part | Value |
|---|---|
| base | Low 10 · Normal 25 · High 45 · Urgent 70 |
| due pressure | overdue: +35, +2/day overdue (up to +15 more) · due today: +25 · within 3 days: +15 · within 7 days: +5 · no date: 0. A chore past its "every N days" counts as overdue by the days past. |
| feelings | from the **feeling weights** setting (§8.2) |

Users see a **tier**: ●● **Top** (≥ 70), **High** (45–69), **Normal** (20–44), **Low** (< 20). Tapping it shows **"Why is this here?"**, the breakdown (e.g. "Due tomorrow +25, 😰 Maya +20").

**What's in the feed:** tasks that aren't done, **except tasks on a visit** (the contact has taken them on). Those come back only if someone shares a feeling or the visit is within 3 days. Chores past their rhythm, or with a feeling. Needs with a feeling or a needed-by date within 7 days. Polls and runs have their own sections on Home.

### 8.2 Settings: feeling weights **[DECIDED] (owner)**

- **House → Settings → Feeling weights**: one row per feeling with its emoji, name, and a number (−20 to +40, in steps of 5), plus **Reset to defaults**.
- **One setting for the whole house.** **Any member** can change it. **(owner)**
- Saving re-ranks the feed for everyone, is logged, and shows a card on Home ("Maya set 😰 Anxious to +30").
- The other parts of the formula are fixed in v1.

---

## 9. Activity log

- A reverse-chronological record of every change: items added, edited, done, or deleted (and brought back); feelings; poll votes and results; runs started and finished; costs added; members joining; settings changed.
- **[DECIDED]** Written in the same transaction as the change, so it's always complete.
- **[DECIDED] (owner) It's the only place history lives.** An item's path through requests and visits, Earlier feelings, votes and cost edits are all read back from it. It's append-only: undo adds a new entry ("reopened") and never erases one. A bulk action (moving 3 tasks) shows as one line. Details and the full event list are in Architecture §6.4.

---

## 10. Membership, invites & access

- **Creating the house:** done once by the owner through a private one-time setup link. Fields: name, address (optional), unit number. The owner becomes an **admin**, and the rooms are seeded.
- **No public sign-up.** Typing an email into the app without an invite does nothing. No code is sent and no account is created.
- **Inviting:** the admin shares an **invite link** (`<app>/join/<token>`) in the group chat. The link:
  - expires after 7 days (configurable) or after its use limit (default: number of open spots),
  - can be revoked or regenerated anytime,
  - is **not** tied to a specific email **(owner)**. Whoever opens it can join, which is why joins notify everyone.
- **Joining:** open the link → enter name + email → type the 6-digit code → pick your bedroom → you're in. **(owner)** It's instant, with no admin approval.
- **Signing in later:** enter your email → type the code. This only works for emails that already have an account.
- **Roles:** `admin` (manage invites, remove members) and `member` (everything else, including settings). **(owner)**
- **Moving out:** an admin (or the person themselves) marks a member as moved out. They lose access, and their name stays on past items.
- **Deleting your account:** removes your email and profile. Your name on past items becomes "Former roommate."
- **Access guarantee:** nobody outside the house can read or write its data, and this is enforced at the database layer.

---

## 11. Notifications

| Trigger | Who | Default |
|---|---|---|
| Assigned to you | assignee | on |
| Your task or chore is due (day before + day of) | assignee | on |
| 😰 / 😤 on an item you're assigned to | assignee | on |
| A new poll, or a poll closing tomorrow | everyone | on |
| Someone started a run ("Add anything?") | everyone | on |
| A run with a date is tomorrow (delivery, visit) | everyone | on |
| Someone joined | everyone | on |

- **Web Push** only, which requires adding the app to the Home Screen on iOS. The email digest fallback comes later (§13).
- Quiet hours per person (default 10pm–8am), with per-category toggles in personal settings.

---

## 12. Release plan

| Milestone | Scope | Exit criteria |
|---|---|---|
| **M0: Foundations** | Repo, CI, local database, email codes, sign-in, PWA shell, UI kit | The owner signs in locally |
| **M1: House & members** | Setup + rooms, invites, join, members, activity log | Test roommates join locally through invite links |
| **M2: Items** | Needs, chores, tasks, feelings, priority feed, feeling-weights setting | Items work end to end locally, and feelings re-rank the feed |
| **M3: Polls & runs** | Polls, runs (grocery, order, visit, event), costs, calendar | A grocery run, a poll, and a super visit can each be completed locally |
| **M4: Notifications & polish** | Push, reminders, polish, end-to-end tests | Reminders and push work locally, and the E2E suite is green in CI |
| **M5: Hosting & launch** | The external services: hosted Supabase, the Gmail sender, Vercel, iPhone checks, production | Everyone is on production from their phones |
| **M6: Usability & personal needs** | Fewer taps (swipe, simpler item views, quicker runs), needs for one person or the house, the gaps chosen from the docs↔code audit (D35), docs that match the build | Every action hits its tap target, item views fit at 375pt without scrolling, and personal needs work end to end |

M6 is built locally before launch, so production waits on its test task (Q6). The tasks are on the **roomies** board in Weyve.

---

## 13. Later (not in v1)

Everything below was designed and decided in earlier drafts. It's parked, not dropped.

| Feature | v1 stand-in |
|---|---|
| **Bills**: cadence, due reminders, editable amounts ("from now on" / "just this payment"), payment history | A chore like "Pay internet" with a cost |
| **Belongings & ownership shares**, settled state, move-out checklist | A "Keep it?" poll + a cost |
| **Rotating / fixed chore schedules** (take turns, rrule) | An optional assignee |
| **Outside-help stages** (not contacted → fixed), contact log, "no word in 3 days" nudges | "Handled by" a contact + visit runs |
| **Heads-ups + calendar icon**: a `heads_up` item category (date, optional end date, room, host; never done, never on a run, not in the feed), an "A heads-up" tile on +, a calendar button on Home, "heads-up tomorrow" notifications. Designed in detail, deferred by the owner. Later still: "Got it" acknowledgments. | A task with a date |
| **Info items** (Wi‑Fi, trash days) with hidden values | None |
| **+1s** on needs | Feelings (😰 / 😤) on the need |
| Full **priority preferences** (presets, deadline weight, outside-help boost) | Feeling weights only |
| Tags, attachments, links between items | Rooms and titles |
| Email digest fallback, passkeys, Splitwise API, multiple houses, floor-plan view | — |

---

## 14. Decision log

| # | Decision | Source |
|---|---|---|
| D1 | Chores assigned to a person are visible to everyone (no private items) | Owner |
| D2 | No chore balance / "who's done what" view | Owner |
| D3 | Poll result: most votes wins, and a tie is shown as "Tie" with no automatic action | Owner |
| D4 | Splitwise via an "Open Splitwise" copy button. The house already uses it. | Owner |
| D5 | Feelings are always named, opt-in, about items (never people), with notes replacing comments and an Earlier list | Owner |
| D6 | No weekly check-in or house mood | Owner |
| D7 | Feeling weights are one house-wide setting, and any member can change them | Owner |
| D8 | Invites: instant join, links not tied to emails, public sign-up off, owner bootstraps via a setup link | Owner |
| D9 | Sign-in with a 6-digit email code (magic links break in iOS PWAs) | Default |
| D10 | One house only in v1 | Owner |
| D11 | Visual style: Focus Friend-inspired feel via color, shape, and tone. No custom art. | Owner |
| D12 | Rooms are the real apartment. The four elemental rooms are the bedrooms and set member colors. | Owner |
| D13 | **v1 = needs, chores, tasks, polls, runs**. Everything in §13 is later. | Owner |
| D14 | Money is optional: a cost record on an item or run, only when something was spent | Owner |
| D15 | Items never change category. New linked items (tasks, polls) are created instead. | Owner |
| D16 | Runs batch any needs, tasks, and chores. Visits are runs with a contact. | Owner |
| D17 | Polls stand alone or attach to an item | Owner |
| D18 | Items are stored in one table with per-category columns (Architecture §6) | Owner |
| D19 | "Handled by" can be set or changed on any task at any time, including adding a new contact inline; on a request or visit it follows the run (D35) | Owner |
| D20 | Anyone can add poll options until the poll closes | Owner |
| D21 | Runs have three kinds: batch, request (gathering → sent → closed), visit (contact has taken it on) | Owner |
| D22 | Recording a reply = bulk actions on tasks in a run: move to a visit/run, back to the pool with a note, hand to another contact, done. No reply form. | Owner |
| D23 | Tasks on a visit leave the Home feed unless there's a feeling or the visit is within 3 days | Default |
| D24 | No automatic "no reply" nudge in v1, only a "Sent N days ago" label | Default |
| D25 | Items point at their current run. The activity log (typed columns, append-only) is the single store of history, including run moves. | Owner |
| D26 | No "needed soon" flag on needs. Feelings and the needed-by date carry urgency. | Owner |
| D27 | Heads-ups and the calendar icon are v2 (design parked in §13) | Owner |
| D28 | Sign-in codes come from a house Gmail address, and the app lives at a `*.vercel.app` URL. No custom domain in v1. | Owner |
| D29 | Everything that needs an outside account is its own, later milestone (M5). M0–M4 are built and checked entirely on one Mac. | Owner |
| D30 | Removing an item is called "Delete" in the app. The row stays for history and the toast offers Undo. No archive list, no 30-day window (T62). | Owner |
| D31 | House → Rooms is a compact grid grouped Bedrooms / Bathrooms / Spaces (T60) | Owner |
| D32 | Extra pushes: feeling weights changed, a new poll option, a new point person, tasks moved into a visit (T59) | Owner |
| D33 | Offline shows the offline page only. No cached data. | Owner |
| D34 | Not building: deleting the house, a move-in checklist, a "Handled 💛" toast, adding or archiving rooms, a room's element setting, item counts on rooms | Owner |
| D35 | Built from the docs↔code audit: conflict detection on edits, "Handled by" follows the run, an app-wide CSP, `security_events`, undo "Did it", poll withdraw / reopen / deadline, run rename and point person, cost edit and remove, poll and run deep links, notification settings in one section (T50–T58, T61) | Owner |

Earlier drafts had more decisions (categories, bills, purchases, heads-ups, outside-help stages). They're superseded by D13–D18 and parked in §13, and the git history keeps the full versions.
