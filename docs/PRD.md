# Roomies — Product Requirements Document

**Status:** v1 (M0–M7, launched) and v2 (M8). v1 was simplified to five concepts (2026-09-28): needs, chores, tasks, polls, runs; v2 keeps the same five.
**Owner:** Kavya
**Companions:** [ARCHITECTURE.md](./ARCHITECTURE.md) · [FRONTEND.md](./FRONTEND.md) · [mockup v1](./archive/mockup-v1.html)

> Decisions are marked **[DECIDED]**. The ones you answered directly are tagged *(owner)*. §13 lists what's **iceboxed** (deliberately not in v1 or v2), and §14 is the decision log, where rows tagged **[v2]** came with M8.

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

Needs, chores, and tasks are **items**. Any roommate can attach a **feeling** (e.g. 😰 anxious) plus a note to any item. Feelings raise priority, so concerns are both *heard* and *acted on*. Each list puts what people feel about first, and a **calendar** shows anything with a date.

### 2.1 Goals

1. One place for what the house needs to buy, do, and decide.
2. Make ownership visible without forcing it: things can sit in a shared pool until someone takes them on.
3. Surface emotional signal (stress, frustration) as a first-class input to prioritization.
4. Work from any roommate's iPhone with no App Store install.

### 2.2 Non-goals (v1 and v2)

- **No in-app payments.** We record what was spent and hand off to Splitwise. We never move money.
- **No replacement for the group chat.** There are no comment threads. Each person's feeling + note on an item is the only in-app conversation (§7).
- **No landlord or super accounts.** They're contacts, not users.
- **No native Android polish.** It will work in Android Chrome, but we design and QA for iPhone Safari.
- Everything in §13 (bills, ownership, and more) is iceboxed: not in v1 or v2.

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
- **[DECIDED] (owner)** v1 and v2 are for **one house**. There's no public sign-up and no house switcher. The owner creates the house through a one-time private setup link, and after that the only way anyone gets an account is a valid invite link. Every row still carries a `house_id`.

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

### 4.3 Navigation (bottom tab bar, 4 tabs)

| Tab | Contents |
|---|---|
| **House** | Where the app opens. **Polls** (open ones first with how many have voted, then the latest closed ones, and **New poll**), the "feeling weights changed" card, **Calendar** ("3 this week") and **Activity**, then the house's setup in labelled groups: **People** (Roommates and the invite link for organizers; Contacts), **Chores** (Routines, Rooms), **Money** (the Splitwise group) and **Priority** (how feelings raise priority: the feeling weights). Everyone sees this tab and can change everything on it except the invite link and roommate controls, which are the organizer's. Nothing personal: that's on **You** (your avatar, top right of every tab, T109). |
| **Needs** | **Runs in progress** (open batches), then the shared list of things to buy, ranked by priority (§8.1). **Start a run** from here. |
| **Tasks** | **Coming up** (visits dated in the next 7 days), then tasks ranked by priority with filters *Mine / All / Outside help*, then the other open **Requests & visits** (unsent and sent requests, later visits). Requests and visits start from the + or from a task (T108). |
| **Chores** | Who has which rooms this period, as cards, and the shared Upkeep list below, ranked by priority |

There is no Home feed (T107, D43): each tab ranks its own kind by priority (T108, D44), and an item's detail says why (**Why it's near the top**). A tab with something Urgent on it carries a dot. Calendar, Activity and You open over House with a back button to it; **You** (your avatar, top right on all four tabs) holds everything that's yours: your room, Notifications, Appearance, feedback, Sign out and Delete my account (T109); old Home and Admin links land on House.

A floating **"+"** on Needs, Tasks and Chores opens that tab's form (a need, a task, a chore). Only the title is required. Polls start from House, runs from Needs.

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
- **Adding something that's already on the list** doesn't duplicate it. The app points to the existing one. "Already on the list" means the same title for the same owner: the house's "Milk" and Kavya's "Milk" are two needs.
- **For me or for the house** (T45, owner): a need is the house's unless whoever adds it picks **Me** (a House / Me toggle beside "We need…" and on the need form; the last choice is remembered on that phone). It's a label only: costs and Splitwise don't change. Everyone sees personal needs ("For Kavya"), anyone can get one or put it on a run, and priority treats them like any need. Anyone can change whose it is on the detail; it shows in Activity.
- **Clearing a need:**
  - **Got it:** check it off directly.
  - **On a run:** it's checked off when the run finishes (§6.5).
- **Money is optional.** Tomatoes never ask for a price. For a bigger need, anyone can **add a cost** when it's bought (§6.6).
- **Bigger needs** use the same item plus the other concepts: a **poll** to choose ("Which vacuum?"), a **run** to order it (an Amazon order), a **cost**, and later new **tasks** ("Assemble it") or **polls** ("Keep it?").
- Needs with a feeling come first on the Needs tab, ranked by their feelings' weights (§8.2).

### 6.2 Chores (ongoing upkeep)

Two concepts only: a **room** is where chores live, and a **routine** is who's responsible for a set of rooms and how often that changes hands. A routine has many rooms; a room is in at most one routine. Houses start with no routines. **[DECIDED] (owner)**

- **Two kinds of chore** **[DECIDED] (owner)**:
  - **Deep clean:** the routine holder's checklist for the period. Every chore, every period. It resets when the period does; what wasn't finished doesn't carry over and nothing is marked.
  - **Upkeep:** shared, everyday (dishes, trash). Nobody's job and no tick: people share a feeling when it piles up, and anyone taps **Took care of it**, after which older feelings stop counting (§7). It comes back only with a new feeling. Chores with no owner count as upkeep too.
- **Who's on a chore is worked out, never stored:** the chore's first room in house order → that room's routine → who has it this period. No room, or a first room in no routine, means no owner. **A chore is in one room** **[DECIDED] (owner, T101)**: a room gets its own copy of a chore (the kitchen's Vacuum and the living room's are two chores, ticked by whoever has each room). Chores saved across several rooms before this keep working, under their first room.
- **Routines:** anyone in the house creates and edits them (House → Routines, the only place the word appears). **Resets** weekly (Monday), every 2 weeks (every other Monday) or monthly (the 1st), in the house's time zone. **Who:** takes turns among everyone by when they joined, or always one person; a fixed person's checklist still resets.
- **Handover:** nothing is written. The holder gets one message when a routine that takes turns changes hands ("You have the kitchen and dining this week"), combined per person, only on the period's first day.
- **Joining and moving out:** the rotation restarts so this period's holders don't shift. If the holder moves out, the next person in turn takes over; if a fixed person moves out, the routine goes back to taking turns.
- **Setting up a room's chores** **[DECIDED] (owner, T101)**: in House → Rooms, or on the Chores tab (a room's sheet, or **+ Add** on a group of rooms), a room offers every chore name already in the house (plus a few starters like Vacuum and Swiffer) as one-tap picks, several at once, with a search that ignores case. On the Chores tab they sit behind **Edit chores**, so a room's sheet opens on its checklist (T112). Upkeep is added on the Chores tab.
- **Someone on no routine** **[DECIDED] (owner, T112)**: when every routine is always one person and none is theirs (a newcomer, say), the Chores tab tells them and links to House → Routines, and organizers see a line there naming them. A line, not a push: it isn't urgent.
- **Anyone can tick any chore** (helping counts): **Did it** records who and when, with Undo.
- Chores can go on a run (e.g. a cleaning session).
- **[DECIDED] (owner)** No numbers, no "due", and no chore balance or "who's done what" view: ticks show in your own rooms only (a room's sheet shows them to anyone, so a helper sees what's left), and people are shown as their avatar with their name ("Alex's this week", T105).

### 6.3 Tasks (one-offs)

- Anything done once: fix the latch, get renter's insurance, assemble the vacuum, set up for the party.
- **Optional "Handled by":** pick a **contact** (super, landlord, provider) when someone outside the house needs to do it. The task shows "Handled by: Super," the contact's number (copy button), and appears under the *Outside help* filter.
  - **Setting it:** when adding the task, or **any time later** from the task's detail, where it's one field with the assignee, **Who's doing it** (T111): any of us, a roommate, or a contact. You can pick an existing contact, **add someone new** right there (name + optional phone, saved to Contacts), or switch back to "Any of us." **I'll do it** claims an unclaimed task in one tap. **[DECIDED] (owner)**
  - Planning a visit or adding it to a contact's list also sets it.
  - **While the task is on a request or visit, "Handled by" follows that run.** To change it, move the task (Move to…, Back to the pool…, Hand to…); "Who's doing it?" says so and opens the run.
- **"Handled by" is who *should* handle it.** Whether they've actually taken it on is tracked by the **request** and **visit** it's on (§6.5): *on the landlord list · not sent* → *sent to landlord · 2 days ago* → *landlord visit · Thu 10:00* → *fixed*.
- **"Add to Landlord list"** on a task with a contact puts it on that contact's unsent request (starting one if needed).
- Tasks can have a date (shows on the calendar) and an assignee.

### 6.4 Polls

- **A question + 2 or more options.** It's either **about an item** ("Which vacuum?" on the Vacuum need, "Keep it?" on the Vacuum need after it arrives) or **standalone** ("House name?").
- Options have a label and an optional note (e.g. a link or a price: "Dyson V8, $189").
- **[DECIDED] (owner) Anyone can add options while the poll is open**, not just at creation. Existing votes stay. People who already voted can switch to the new option. Each option shows who added it. Duplicate labels are rejected, and once the poll closes, options are locked.
- **Voting:** each member picks one option and can change their vote, or take it back, until the poll closes.
- **Closing:** anyone can close it, or it closes at an optional deadline. Anyone can change or clear the deadline while it's open, and anyone can reopen a closed poll: the votes stay, the result goes away until it closes again, and a deadline that has already passed comes off.
- **[DECIDED] (owner) Result:** the option with the most votes wins. **If the top options are tied, the result is "Tie,"** the app does nothing automatically, and the house talks it out (in feeling notes or in person).
- Polls show on House, open ones first with how many people have voted, then the latest closed ones with their result.
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
- **Starting one:** the **+** → *A poll or a run instead?* → **A request** (T108; Requests & visits had a + New before) → *Ask someone (request)* → pick a contact (or add someone new) and any tasks. It can start empty. Or tap "Add to Landlord list" on a task, or use "Hand to…" from another run.
- **Gathering:** anyone can add tasks while it's unsent.
- **Send request** builds a message (a numbered list with rooms and notes), which you copy and send by text, email, the portal, or in person. **Roomies never sends on your behalf.** "Mark as sent" records when and how.
- **Waiting:** the request shows "Sent 2 days ago · waiting on 3." There's no automatic nudge in v1 or v2.

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
- The same actions work in batches and visits too (e.g. move an item from Wren's run to Saturday's run). In a batch they sit behind **Move some, or put them back**, since a tap on a row there marks it done.

**Visits and batches**
- **Planning a visit** directly (when they've already agreed): the **+** → *A poll or a run instead?* → **A request** → *They've agreed (visit)*. It's also created by "Move to a visit → New visit."
- **Requests and visits hold tasks only.** Needs and chores stay in batches.
- **Finishing:** mark things done or fixed as you go, then **Finish**. Anything left goes back to the pool with the note "Not done this time."
- **Batches** have an optional **Spent** amount beside **Finish** ("Did you spend money?" without a separate step): an amount records one cost paid by you (who paid can be changed), and leaving it empty records none (§6.6).
- **Fewer taps:** *Start a run* opens with every open need not already on a run checked, and in a batch tapping an item marks it done (tap again to put it back on the run). A grocery run (start, get 3 things, finish with $40) is about 6 taps.
- While open, items show **"On Kavya's run"** or **"Sent to Landlord · 2 days ago"** so nobody doubles up. **An item can be on only one open run at a time.**
- Runs with a date show on the calendar; open batches also show on Needs under Runs in progress, and visits dated in the next 7 days on Tasks under Coming up (T108).

### 6.6 Money (costs)

- **[DECIDED]** Money is a **cost record**: an amount, who paid, an optional note, and what it was for (an item or a run). Nothing requires one.
- **Adding one:** "Add cost" on any item, or the **Spent** amount beside a batch's **Finish**.
- **Changing one:** any member can **edit** a cost (amount, who paid, note) or **remove** it ("Remove this cost?"), from the item's Costs section (open right under its main button, and on its Edit sheet, T104) or the run's sheet. A removed cost leaves the item or run; the activity log keeps the edit or removal.
- **Splitting** is left to Splitwise; Roomies shows no monthly total or shares (T64).
- **The Splitwise icon** **[DECIDED] (owner, T89)** sits on every cost (an item's Costs, a run's Spent) and in the toast after adding one or finishing with Spent. Tapping it copies "{title} — ${amount}" and opens the house's Splitwise group, where you paste it in (Splitwise has no link that fills in an expense, and there's no Splitwise API). Once anyone has tapped it for a cost, the icon is highlighted with a check; it stays tappable to send it again. It shows that someone tapped, not that Splitwise saved it.
- **The Splitwise group** **[DECIDED] (owner, T89)** is a house setting any roommate sets, changes or removes on House → Money (paste the group's link). Until it's set, the icon opens Splitwise's home page. Activity notes each change under Money ("Kavya linked the Splitwise group").

### 6.7 Calendar

- Shows **anything with a date**: tasks, needs with a needed-by date, and runs (grocery runs, deliveries, visits, party setup).
- House's Calendar row says how many things are dated in the next 7 days and opens the calendar: a month grid with a day list.
- A plain heads-up ("Jo's parents staying Sat") is a **task with a date** in v1 and v2.

### 6.8 Feedback **[DECIDED] (owner)**

- The row **Send a bug, idea or praise** on **You** (T109; an icon on House before) opens a sheet: **Bug 🐞 · Idea 💡 · Praise 💛** (Idea to start), a message, and the header check, **Send**.
- It goes to the owner, not the house: it's saved for the owner to read in the Supabase dashboard, isn't in the activity log, and notifies nobody. Housemates can't read each other's feedback.
- Each one carries who sent it, their house, the app version and the browser. No screenshot or page.

---

## 7. Feelings

- **Opt-in.** A roommate adds a feeling to an item only when they think the house should know how they feel about it. Nobody is prompted. **(owner)**
- **About the item, never the person.** There's no per-person mood, and avatars never show feelings. **(owner)**
- **One current feeling + an optional note** (≤ 280 chars) per member per item. Changing it moves the old one to an **Earlier** list, so the conversation isn't lost (adding or editing the note keeps it the same feeling). **(owner)** Feeling notes replace comments.
- **Always named.** There's no anonymous option. **(owner)**
- When someone adds 😰 or 😤 to a need or a task, its assignee gets a notification. On a chore, every active member but the sharer does (their toggles and quiet hours apply): a chore's feeling is about the chore, never routed to one person. **(owner)**
- **Feelings go quiet once the chore is taken care of.** A feeling on a chore counts only if it was shared after the chore was last done; sharing again counts again. Undoing Did it, or reopening a need or a task, brings older feelings back, since it was an undo. Nothing is deleted. **(owner)**

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

The score is computed when it's shown (each tab's order and an item's **Why it's near the top**), because it depends on today's date.

```
score = base(priority) + due_pressure(when) + Σ feeling_weight(each member's active feeling)
clamped to 0–100
```

| Part | Value |
|---|---|
| base | Low 10 · Normal 25 · High 45 · Urgent 70 |
| due pressure | overdue: +35, +2/day overdue (up to +15 more) · due today: +25 · within 3 days: +15 · within 7 days: +5 · no date: 0. Chores have none. |
| feelings | from the **feeling weights** setting (§8.2). Only **active** feelings count: on a chore, those shared after it was last done (§7) |

Users see a **tier**: ●● **Urgent** (≥ 70), **Soon** (45–69), Normal (20–44), Low (< 20). Only Urgent and Soon get a chip on a card; Normal and Low show nothing (T108). An item's **"Why it's near the top"** says what moved it, in words rather than points ("Normal priority", "Maya is 😰", "Due Friday"), and links to House → How feelings raise priority, which gives the scale ("Items start at 25 out of 100; each feeling adds this much").

**Each tab ranks (T108, D44):** Home and its feed are gone (T107, D43), so each list ranks itself: Needs, Tasks and Chores' Upkeep list are ordered by score, highest first (equal scores by date, then newest). Every open item shows; nothing is left out for its score. A dot on the Needs, Tasks or Chores tab says something on it is Urgent (on Chores, in Upkeep: routine rooms aren't ranked).

### 8.2 Settings: feeling weights **[DECIDED] (owner)**

- **House → Priority** ("How feelings raise priority", showing today's weights) opens **Feeling weights**: one row per feeling with its emoji, name, and a number (−20 to +40, in steps of 5), plus **Reset to defaults**.
- **One setting for the whole house.** **Any member** can change it. **(owner)**
- Saving changes everyone's priorities (and the order of every tab), is logged, and shows a card on House ("Maya set 😰 Anxious to +30"). Everyone else also gets a push ("Maya set 😰 to +30", §11, D32).
- The other parts of the formula are fixed in v1 and v2.

---

## 9. Activity log

- A reverse-chronological record of every change: items added, edited, done, or deleted (and brought back); feelings; poll votes and results; runs started and finished; costs added; members joining; settings changed.
- **[DECIDED]** Written in the same transaction as the change, so it's always complete.
- **[DECIDED] (owner) It's the only place history lives.** An item's path through requests and visits, Earlier feelings, votes and cost edits are all read back from it. It's append-only: undo adds a new entry ("reopened") and never erases one. A bulk action (moving 3 tasks) shows as one line. Details and the full event list are in Architecture §6.4.

---

## 10. Membership, invites & access

- **Creating the house:** done once by the owner through a private one-time setup link. Fields: name, address (optional), unit number. The owner becomes an **organizer**, and the rooms are seeded. The owner also answers **"Which room is yours?"** (a bedroom, or Not yet) (T93).
- **No public sign-up.** Typing an email into the app without an invite does nothing. No code is sent and no account is created.
- **Inviting:** an organizer shares an **invite link** (`<app>/join/<token>`) in the group chat. The link:
  - expires after 7 days (configurable) or after its use limit (default: number of open spots),
  - can be revoked or regenerated anytime,
  - is **not** tied to a specific email **(owner)**. Whoever opens it can join, which is why joins notify everyone.
- **Joining:** open the link → enter name + email → type the 6-digit code → pick your bedroom → you're in. **(owner)** It's instant, with no organizer approval.
- **Signing in later:** enter your email → type the code. This only works for emails that already have an account.
- **Roles:** **organizer** (manage invites, remove members) and **member** (everything else, including settings). **(owner)** The data calls the organizer role `admin`; people never see that word for a person, (D40, T103).
- **Changing rooms (T93):** anyone, the organizer included, picks, changes or clears their own bedroom on **You** (T109; House → Roommates before, which still shows everyone's room). Only bedrooms nobody lives in can be picked; nobody changes someone else's room. Activity shows the move.
- **Moving out:** an organizer (or the person themselves) marks a member as moved out. They lose access, and their name stays on past items.
- **Deleting your account:** removes your email and profile. Your name on past items becomes "Former roommate."
- **What stays on your phone (T114, D46):** so the app opens with the house already on screen, it keeps a copy of the house's lists (items, feelings, runs, polls, costs, rooms, routines, contacts, and roommates' names) in the phone's browser storage between opens: one person and one house's copy, at most a day old. It's shown only while the phone is online, and the latest replaces it as soon as it arrives. Signing out, deleting your account, or reaching the sign-in page for any reason removes it.
- **Access guarantee:** nobody outside the house can read or write its data, and this is enforced at the database layer.

---

## 11. Notifications

| Trigger | Who | Default |
|---|---|---|
| Assigned to you | assignee | on |
| Your task is due (day before + day of) | assignee | on |
| The last day of your routine's period, while its checklist isn't all ticked (T85): "Last day for the kitchen and dining this week" | whoever holds it | on |
| A need's "needed by" date is today (T85): "Needed today: Oat milk", its own **Needed today** switch | everyone | on |
| 😰 / 😤 on an item you're assigned to | assignee | on |
| A new poll, or a poll closing tomorrow or later today ("Closing today", T85) | everyone who hasn't voted (closing) | on |
| Someone started a run ("Add anything?") | everyone | on |
| A run with a date is tomorrow (delivery, visit) | everyone | on |
| Someone joined | everyone | on |
| Someone moved out, or your role changed | everyone / that member | on |
| The feeling weights changed (D32) | everyone but whoever changed them | on |
| A new option on a poll you voted on (D32) | people who already voted | on |
| You're the new point person on a run (D32) | that person, unless they picked themselves | on |
| Tasks moved into a visit you're the point person for (D32) | that person, once per move, unless they moved them | on |

- **Who gets reminded, and when (T85, owner 2026-11-10 and 2026-11-14):** tasks for "anyone" remind no one; runs and visits get only "Tomorrow: …", requests nothing; "today" is the house's calendar for everyone; your own actions never notify you. Each notification stacks on the device (one per message, not one per thing), and a push waits up to 24 hours for an offline phone.
- **Web Push** only, which requires adding the app to the Home Screen on iOS. The email digest fallback comes later (§13).
- Quiet hours per person (default 10pm–8am), with per-category toggles in personal settings. A notification held by quiet hours is checked again when they end (T83): it isn't sent if the person switched that category off or moved out meanwhile, or if it's a reminder whose day is over ("Tomorrow: …" queued late at night isn't pushed the next morning). **Changing quiet hours re-times what's already waiting (owner, 2026-11-10):** held notifications go out when the new quiet hours end, or straight away if they're turned off.
- **Nothing from before push was on (owner, 2026-11-10):** a notification for someone with no device turned on is dropped, and turning notifications on later doesn't deliver it.
- Notifications follow the person, not the phone: signing out stops that device getting yours, and turning them on moves the device to whoever is signed in (T84); a device that allows Roomies does this by itself when the app opens (D42). If the push service is briefly down, a notification is tried again after 5 minutes, 30 minutes and 2 hours before it's given up.
- **On from the start (T95, T110, D41):** every category is on by default. Joining and setup end in **onboarding** before the app opens: a welcome ("Welcome to <house>", a line each on Needs, Tasks, Chores and House), then a notifications step that fits the device: **Turn on** or **Not now** ("Not now" says they can turn them on later from You → Notifications); on an iPhone in Safari, the Add to Home Screen guide (the question comes on the first open from the Home Screen); blocked, the numbered steps for that phone or browser with **Skip for now**; a browser that can't, one line and **Continue**. Then House. Members who never answered on a device get one sheet asking (**Turn on** · **Not now**) the first time the app opens there with push off; a blocked or unsupported device gets no sheet on open (nobody's first screen is a problem), and You → Notifications has the steps. Any answer is remembered on that device.
- **Allowed means on (owner, D42):** once the browser or phone allows Roomies, notifications are on. A device that allows Roomies but isn't connected to the person signed in (they just followed the steps, or someone else signed in on it) connects itself when the app opens, with no tap, and says "Notifications are on. 🔔". Turning them off is the person's call: switch categories off in the app, or block Roomies again in the browser or phone settings.
- Everything about notifications sits in one **Notifications** section of personal settings: this device's status with its one button (turn on / blocked / add to Home Screen first), a switch per category with a line saying when you get it, and quiet hours as one row. It is reached only from personal settings (your avatar), not from House (T67).

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
| **M7: Simpler screens** | Tabs Home, Needs, Tasks, Chores, Admin (four tabs since T107, D43); Home as one priority list; check-to-save sheets; icon buttons for edit and delete; Appearance apart from Notifications; rooms renamed from one sheet; no monthly cost total | Every M7 screen passes axe at 375pt in light and dark, and the M7 journeys pass |

M6 and M7 are built locally before launch, so production waits on M7's test task (Q7). Work after launch (dates and times, undo, run history, speed, money) is M8. The tasks are on the **roomies** board in Weyve.

---

## 13. Iceboxed (not in v1 or v2)

Everything below was designed and decided in earlier drafts. It's iceboxed, not dropped: we'll take it on later, and v2 (M8) took none of it.

| Feature | Stand-in in v1 and v2 |
|---|---|
| **Bills**: cadence, due reminders, editable amounts ("from now on" / "just this payment"), payment history | A chore like "Pay internet" with a cost |
| **Belongings & ownership shares**, settled state, move-out checklist | A "Keep it?" poll + a cost |
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
| D4 | Splitwise via a copy-and-open button, the Splitwise icon on each cost, opening the house's group (T89). The house already uses it. | Owner |
| D5 | Feelings are always named, opt-in, about items (never people), with notes replacing comments and an Earlier list | Owner |
| D6 | No weekly check-in or house mood | Owner |
| D7 | Feeling weights are one house-wide setting, and any member can change them | Owner |
| D8 | Invites: instant join, links not tied to emails, public sign-up off, owner bootstraps via a setup link | Owner |
| D9 | Sign-in with a 6-digit email code (magic links break in iOS PWAs) | Default |
| D10 | One house only in v1 and v2 | Owner |
| D11 | Visual style: Focus Friend-inspired feel via color, shape, and tone. No custom art. | Owner |
| D12 | Rooms are the real apartment. The four elemental rooms are the bedrooms and set member colors. | Owner |
| D13 | **v1 = needs, chores, tasks, polls, runs**. Everything in §13 is iceboxed; v2 (M8) keeps the same five. | Owner |
| D14 | Money is optional: a cost record on an item or run, only when something was spent | Owner |
| D15 | Items never change category. New linked items (tasks, polls) are created instead. | Owner |
| D16 | Runs batch any needs, tasks, and chores. Visits are runs with a contact. | Owner |
| D17 | Polls stand alone or attach to an item | Owner |
| D18 | Items are stored in one table with per-category columns (Architecture §6) | Owner |
| D19 | "Handled by" can be set or changed on any task at any time, including adding a new contact inline; on a request or visit it follows the run (D35) | Owner |
| D20 | Anyone can add poll options until the poll closes | Owner |
| D21 | Runs have three kinds: batch, request (gathering → sent → closed), visit (contact has taken it on) | Owner |
| D22 | Recording a reply = bulk actions on tasks in a run: move to a visit/run, back to the pool with a note, hand to another contact, done. No reply form. | Owner |
| D23 | Tasks on a visit leave the Home feed unless there's a feeling or the visit is within 3 days. **Moot since D43** (no feed) | Default |
| D24 | No automatic "no reply" nudge in v1 or v2, only a "Sent N days ago" label | Default |
| D25 | Items point at their current run. The activity log (typed columns, append-only) is the single store of history, including run moves. | Owner |
| D26 | No "needed soon" flag on needs. Feelings and the needed-by date carry urgency. | Owner |
| D27 | Heads-ups and the calendar icon are iceboxed (design kept in §13) | Owner |
| D28 | Sign-in codes come from a house Gmail address, and the app lives at a `*.vercel.app` URL. No custom domain in v1 or v2. | Owner |
| D29 | Everything that needs an outside account is its own, later milestone (M5). M0–M4 are built and checked entirely on one Mac. | Owner |
| D30 | Removing an item is called "Delete" in the app. The row stays for history and the toast offers Undo. No archive list, no 30-day window (T62). | Owner |
| D31 | Rooms (Admin then, House → Chores since T107) is one row that opens a sheet of plain names grouped Bedrooms / Bathrooms / Spaces, renamed in place (T66; T60's grid had icons) | Owner |
| D32 | Extra pushes: feeling weights changed, a new poll option, a new point person, tasks moved into a visit (T59) | Owner |
| D33 | Offline shows the offline page only. No cached data. | Owner |
| D34 | Not building: deleting the house, a move-in checklist, a "Handled 💛" toast, adding or archiving rooms, a room's element setting, item counts on rooms | Owner |
| D35 | Built from the docs↔code audit: conflict detection on edits, "Handled by" follows the run, an app-wide CSP, `security_events`, undo "Did it", poll withdraw / reopen / deadline, run rename and point person, cost edit and remove, poll and run deep links, notification settings in one section (T50–T58, T61) | Owner |
| D36 | A feedback button (bug / idea / praise) at the top right of Admin (House since T107), saved for the owner in Supabase, with the sender, house, app version and browser (§6.8, T91) | Owner |
| D37 | **[v2]** Feelings on a chore count only if shared after it was last done; 😰/😤 on a chore notifies every active member, not an assignee. Reopening a need or a task is an undo, so its feelings count again (§7, §8.1, T99) | Owner |
| D46 | **[v2]** The house's lists are kept on the phone between opens so the app opens with them (T114, §10): one person and house, at most a day old, shown only online, removed on sign-out, account deletion and the sign-in page. Roomies stays online-only (A25) | Owner (2026-11-16, 2026-11-22) |
| D45 | **[v2]** Who gets reminded, and when: a need dated today reminds everyone through its own `needs` category; a poll closing later today gets "Closing today" (as well as "Closing tomorrow"); on a routine's last day its holder hears only if the checklist isn't all ticked, in gentle words; every push stacks (its own tag); TTL stays 24 h; unassigned tasks, runs on the day and requests stay silent (§11, T85) | Owner |
| D44 | **[v2]** Each tab ranks by priority: Needs, Tasks and Chores' Upkeep list are ordered by score (§8.1), and every open item shows. Only **Urgent** and **Soon** get a chip (the tiers were Top / High / Normal / Low; Normal shows nothing now). A dot on a tab with something Urgent. Tasks shows visits coming up this week first and has one add button, the +; requests and visits start from its sheet or from a task. "Why is this here?" becomes **Why it's near the top**, in words, not points (T108, 2026-11-15) | Owner |
| D43 | **[v2]** Four tabs, **House · Needs · Tasks · Chores**, House first and where the app opens. Home and its ranked feed are removed (the feed rule hid items from newcomers); Admin becomes House: polls, Calendar and Activity on top, then the house's setup in labelled groups, and nothing personal (sign out and delete account are on You). Runs in progress moves to Needs. The + shows on Needs, Tasks and Chores only. Supersedes the M7 tab set (§4.3, T107, 2026-11-14) | Owner |
| D42 | **[v2]** Allowed means on: a device that allows Roomies connects itself to whoever is signed in when the app opens, with no Turn on tap (§11, T95) | Owner |
| D41 | **[v2]** Notifications are asked about in onboarding, right after joining or setup and before the app opens (owner, T110), after a welcome that says what each tab is for. Members who never answered on a device are asked once, the first time the app opens there with push off, but only with the question: a blocked or unsupported device gets no sheet on open, so nobody's first screen is "Notifications are blocked" (T110); You → Notifications has the steps. Any answer, including closing the sheet, is remembered on the device (§11, T95) | Owner (T110); the once-per-device sheet was a build call (T95) |
| D40 | **[v2]** The role that manages invites and removes roommates is called **organizer** in every toast, button, activity line and notification, and Roommates rows show no role label at all (owner, 2026-11-10). The Admin tab kept its name (every member uses it) until T107 made it House, and the data keeps `role = 'admin'`, as items keep `archived_at` while the app says "deleted". `copy.test.ts` refuses "admin" for a person (§10, T103) | Owner |
| D39 | **[v2]** A chore is in one room, and a room's chores are set up in House → Rooms from one-tap picks of the house's chore names. The Chores tab shows a box per room. **Reverses D38's multi-room chores** (§6.2, T101) | Owner |
| D38 | **[v2]** Routines: rooms grouped under who's responsible and how often it changes hands; chores are Deep clean or Upkeep, and who's on one is worked out. **Reverses the decided chore rhythms** ("as needed" / "about every N days") and the chore assignee: chores have neither now. Rotations are no longer deferred (§6.2, T96) | Owner |

Earlier drafts had more decisions (categories, bills, purchases, heads-ups, outside-help stages). They're superseded by D13–D18 and iceboxed in §13, and the git history keeps the full versions.
