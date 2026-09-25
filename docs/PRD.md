# Roomies — Product Requirements Document

**Status:** Draft v1.0 (flexible chores, shopping pool, runs, 2026-09-25)
**Owner:** Kavya
**Last updated:** 2026-09-24
**Companions:** [ARCHITECTURE.md](./ARCHITECTURE.md) · [FRONTEND.md](./FRONTEND.md) (visual design, inspired by Focus Friend)

> Every decision is marked **[DECIDED]**. The ones you answered directly are also tagged *(owner)*, and the rest are defaults we can revisit. Section 12 is the decision log.

---

## 1. Problem

When you move in with roommates, and while you live with them, a lot of information and responsibility piles up:

- **The info is scattered.** The Wi‑Fi password is in a group chat, the landlord's number is in one person's phone, the lease is a PDF in someone's email, and the receipt for the shared vacuum is gone.
- **Tasks get dropped.** Setting up internet, paying bills, chores, calling the super about the leak: nobody knows who owns what or what's already done.
- **Priorities differ and concerns go unheard.** One roommate is stressed about the heat not working, and another doesn't know it matters to them. Group chats bury these signals.

## 2. Solution

Roomies is a shared, phone-first "house hub." Everything the household needs to track goes in as an **artifact** in one of five categories: **chores** (routine upkeep, including grocery runs), **one-offs** (broken things and errands, which can be escalated to outside help like the landlord), **purchases** (owned things, bills, supplies), **heads-ups** (things happening at a time, shown on a shared calendar), and house **info**. Every artifact has:

- an **owner/assignee**,
- a **status**,
- a computed **priority score**, and
- a **feelings layer**, where any roommate can attach a feeling (e.g. 😰 anxious) plus an optional note. Feelings raise the artifact's priority, so concerns are both *heard* and *acted on*.

A single **Home feed** ranks what needs attention now. An **activity log** shows everything that happened.

### 2.1 Goals

1. One place for all house info and to-dos. Nobody has to ask "where's the ___?" in the group chat.
2. Make ownership explicit: every actionable artifact has an assignee, or is visibly unassigned.
3. Surface emotional signal (stress, frustration) as a first-class input to prioritization.
4. Make moving in easy with a guided setup checklist.
5. Work from any roommate's iPhone with no App Store install.

### 2.2 Non-goals (v1)

- **No in-app payments.** We track money and hand off to Splitwise or Venmo. We never move money.
- **No replacement for the group chat.** There are no comment threads or chat. Each person's feeling + note on an item is the only in-app conversation (§7).
- **No landlord or super accounts.** They're contacts, not users.
- **No native Android polish.** It will work in Android Chrome, but we design and QA for iPhone Safari.
- **No multi-language or accessibility beyond WCAG AA basics.**

### 2.3 Success metrics (for a personal/small-scale app)

- Every roommate in the house joins within 48h of the invite being sent.
- At least 70% of actionable artifacts have an assignee.
- Median time from 😰 anxious feeling → artifact resolved goes down over the first month.
- Each roommate opens the app at least 2×/week.

---

## 3. Users & usage requirements

| Persona | Needs |
|---|---|
| **House organizer** (usually whoever creates the house) | Sets up the house, invites people, seeds the move-in checklist, cares about structure |
| **Casual roommate** | Wants to see "what do I need to do" and log things fast with minimal typing |
| **Anxious or conflict-averse roommate** | Wants a low-friction way to flag "this is bothering me" without starting a confrontation |

**Requirements**

- Every roommate joins the house and uses the app from their own phone, with their own identity.
- The UI is designed for **iPhone Safari, portrait, 375–430pt widths**, installable to the home screen as a PWA.
- Common actions (add an item, mark done, add a feeling, add to the shopping list) take **≤ 3 taps**.
- House size: **2–8 members** (design target 2–5).
- **[DECIDED] (owner)** v1 is for **one house**. There's no public sign-up and no house switcher. You (the owner) create the house through a one-time private setup link, and after that the only way anyone gets an account is by opening a valid invite link. Every row still carries a `house_id`, so supporting more houses later is a UI change, not a migration.

---

## 4. Information architecture — resolving the category overlap

### 4.1 The problem with the original tabs

The original tabs (Subscriptions, Chores, Reaching out, Purchases) mix two different things:

- **What kind of thing it is**: something to do, something to pay, something to ask someone else for, or something we own.
- **What it's about**: internet, kitchen, heating, the lease.

"Internet" shows up in several tabs because it's a *topic*, not a type. The internet bill is a subscription. Calling Spectrum because it's down is a request. Rebooting the router is a chore. The Spectrum support number is a contact.

### 4.2 Options

| Option | Description | Pros | Cons |
|---|---|---|---|
| **A. Keep topic tabs** | Tabs = Subscriptions, Chores, Help, Purchases as written | Matches the original mental model | The overlap never goes away, and users have to guess where things go |
| **B. Type tabs + topic tags** ⭐ | Tabs are by *artifact type* (what action it needs). Topics like "Internet" are cross-cutting **tags** that link related items. | Every item has one obvious home. Each type gets fields that fit it (purchases have amounts, tasks have assignees and due dates). Topic pages still show "everything about Internet". | Two concepts (type + tag) to learn |
| **C. Topic-first "areas"** | Top level = areas (Internet, Kitchen, Bathroom, Lease...), each holding mixed items | Very intuitive for browsing | Hard to answer "what do *I* need to do this week"; needs a strong global feed anyway |

**[DECIDED] Option B.** The type answers "what do I do with this," and the tag answers "what is this about." A topic tag page (e.g. `#internet`) shows the internet bill, the "internet is down" one-off escalated to the provider, and the router chore together.

### 4.3 Categories

**[DECIDED] (owner)** Almost everything in a house is "something someone has to do," and purchases are no exception. So Roomies has **one kind of record (an artifact)**, and a **category** is a preset that switches on the features that item needs.

| Category | What it's for | Examples | Features switched on |
|---|---|---|---|
| **Chores** | Ongoing upkeep. **Flexible by default:** anyone does it when it needs doing. Rotation is opt-in. | Wipe the stove, clean the fridge, clean Bathroom 3 (about weekly), trash night (rotating) | Four modes: *Anyone, as needed* (default) · *Anyone, on a rhythm* · *Rotating* · *Fixed*. "Last done" tracking, room, checklist. |
| **One-offs** | Anything that happens once: something broken, an errand, setup | Kitchen sink leak, radiator clanking, renter's insurance, copy keys, return the lamp | Room, photos, checklist, a **"Something's broken"** toggle, **outside help**, schedule entries, optional linked purchase |
| **Purchases** | Money the house spends, in three kinds: **owned**, **bill**, **supplies** | Standing lamp (owned). Internet, rent (bill). Groceries (supplies). | Amount, split, Splitwise. Owned: ownership + keep/return vote. Bill: recurring, editable amount, payment history. Supplies: just split. |
| **Runs** *(new)* | **A batch someone takes on at once**: a grocery run, an errand run, or a visit from outside help | "Kavya's grocery run Sat" (6 shopping items), "Hardware run" (bulbs + return the lamp), "Super visit Thu 10am" (3 one-offs) | Pick many items from the shopping list, one-offs, or chores. Shows them as claimed ("On Kavya's run"). Optional time on the calendar. Finish → what got done, what didn't, and optionally what you spent. |
| **Heads-ups** | Something happening at a time: a guest, an appointment, a delivery | "My parents are staying this weekend", "Exterminator Thu 9am" | A **schedule entry** (when, optional room), "Got it 👍" acknowledgments, feelings + notes. No priority score. |
| **Info** | Reference material | Wi‑Fi, trash days, lease | Pinned, sensitive fields |

- **[DECIDED] (owner)** "Fixes" and "To-dos" are one category, **One-offs**, with a *Something's broken* toggle. The toggle powers a "What's broken" filter and pre-selects outside help as an option.
- **[DECIDED] (owner)** There's no Decisions category. Anything the house needs to talk through goes in **feeling notes** on the related item (§7). Keep/return votes on owned purchases stay.
- **[DECIDED] (owner)** Outside help is a **state of a one-off**, not a type or a tag (§6.3).
- **[DECIDED] (owner) Needs and runs.** Work that piles up (groceries, small fixes) sits in a shared **pool** with nobody assigned: the shopping list, open one-offs, as-needed chores. Anyone can grab one thing, or start a **run** that bundles many and clear them together. Grocery runs and super visits both work this way (§6.4).
- **[DECIDED] (owner) Links:** chores and one-offs can be linked to purchases, in both directions ("Return lamp" ↔ Standing lamp; "Ask about the double charge" ↔ Internet). A run links to the supplies purchase it produced.
- **[DECIDED] (owner) Schedule entries** can belong to any item. A **visit run** owns the entry for an outside-help visit and covers all the one-offs handled in it. A heads-up is either **attached** to another item or **standalone** ("parents staying"). Non-time notices are a **feeling note** on the related item (🙂 Fine + "Super says the part is backordered"). See §6.5.

Supporting entities (not artifacts, since they don't get priority or feelings):

- **Contacts**: landlord, super, internet provider, utilities, repair people. Fields: name, role, phone, email, notes, preferred channel. One-offs with outside help and bills link to contacts.
- **Rooms**: the apartment's real spaces, seeded from the actual layout (first floor: hallway, Air, Fire, Water, Bathroom 1, Bathroom 2, entry, kitchen, living room; basement: downstairs living room, Bathroom 3, laundry, craft room, Earth, fitness space; plus the garden). Each room has a floor, a kind (bedroom/bath/common/utility/outdoor), and a color. The four elemental rooms (Air, Fire, Water, Earth) are the four bedrooms, one per roommate, and each has its own element color. Each member picks their bedroom, which sets their color in the app. The full list is in [FRONTEND.md §4](./FRONTEND.md).
- **Shopping list**: **[DECIDED] (owner) one shared list for the house.** Everything on it is shared (split), with no personal requests (§6.2).
- **Tags/Topics**: house-defined, with seeded defaults: `#internet`, `#utilities`, `#lease`, `#repairs`, `#cleaning`, `#move-in`. (Locations are rooms, not tags. Outside help and "broken" are states, not tags.)

**[DECIDED] Room vs. tag:** a room answers *where* ("the leak is in the Kitchen"), and a tag answers *what topic* ("#internet"). An artifact has at most one room and any number of tags.

**How the original overlap example resolves:**
- "Internet" becomes a **bill** (Purchase, $60/mo) with the provider as its contact.
- "Internet is down, call them" becomes a **one-off** (broken) with outside help (contact: the provider), linked to Internet. When a technician is booked, a **visit run** puts it on the calendar, and can cover other one-offs too ("while they're here, the router in the living room is flaky").
- "Reboot router weekly" becomes a **chore**.
- All of them are tagged `#internet`.

### 4.4 Navigation (iPhone bottom tab bar, 5 tabs)

| Tab | Contents |
|---|---|
| **Home** | **Coming up** strip (the next 7 days of schedule entries, including planned runs and visits; tap it to open the calendar), a **"We're out of…"** quick-add for the shopping list, **Runs in progress**, then the ranked **Needs attention** feed (*Mine / All*) and the entry point to the activity log |
| **Chores** | The **shopping list** (the pool) with **Start a run**, then chores sorted by what needs doing. Filters: *All / Mine*. |
| **One-offs** | Filters: *Mine / All / Broken / Outside help*. **Plan a visit** multi-selects one-offs into a visit run. Items on a run show "On Super visit · Thu". |
| **Purchases** | "Your share this month" summary. Segments: *Bills / Owned / Supplies*. |
| **House** | Pinned info, **Rooms** (grouped by floor, with open-item counts), **Contacts**, roommates, tags, activity log, preferences, invite link |

The **calendar** (§6.5) opens from Home's Coming up strip. A global **"+" button** (floating, bottom right) opens a category picker (Chore / One-off / Run / Purchase / Heads-up / Info) and then a short form. The first screen of every form only asks for the title, and everything else is optional, so adding stays fast.

**[DECIDED] (owner) "Personal chores" means chores assigned to a person, and everyone can see them.** There are no private items. The *Mine* segment shows chores that are rotating or fixed to you, plus runs you're doing.

---

## 5. Artifact model (shared behavior)

Every artifact, whatever its category, has:

| Field | Notes |
|---|---|
| title | required, ≤ 120 chars |
| category | Chore / One-off / Run / Purchase / Heads-up / Info |
| description | optional, markdown-lite (links, line breaks, lists) |
| status | category-specific (§6), normalized into `open / in_progress / blocked / done / archived` for the feed |
| created_by, created_at, updated_at | |
| assignees | 0..n members. A one-off with outside help requires exactly one point person. For purchases, this is the buyer or payer. |
| due_at | optional |
| base_priority | Low / Normal / High / Urgent, set by the user, default Normal (not used for heads-ups or info) |
| room | optional, one room (e.g. Kitchen, Fire, Laundry) |
| tags | 0..n |
| attachments | photos/PDFs (receipts, damage photos, lease) |
| feelings | one current feeling + optional note per member (§7). This is also where the house discusses and decides things. Not on info. |
| linked purchases | chore/one-off ↔ purchase (§4.3) |
| schedule entries | 0..n (§6.5) |
| runs | 0..n runs this item has been on, with outcomes (§6.4) |
| computed_priority | see §8, never stored as user input |

**[DECIDED]** Deleting is a soft delete (archive). Only the creator or a house admin can archive, and archived items are restorable for 30 days. Hard delete happens only when a house is deleted.

**[DECIDED]** Any member can edit any artifact. Edits are logged in the activity log. It's a house of trusted people, so audit beats permissions.

---

## 6. Feature specs by category

### 6.1 Chores (ongoing upkeep)

**[DECIDED] (owner) Flexible by default.** A chore picks one of four modes, and the loosest one is the default:

| Mode | How it works | Shows up in the Home feed when… | Good for |
|---|---|---|---|
| **Anyone, as needed** ⭐ default | No assignee, no due date. Shows "Last done 9 days ago · Wren." Anyone does it and taps **Done**. | someone shares a feeling on it (😤 "something in the fridge is alive") | Wiping the stove, cleaning the fridge |
| **Anyone, on a rhythm** | No assignee, with a gentle "usually every N days" | it's past its rhythm (priority grows the longer it's past), or someone shares a feeling | Bathroom cleaning, vacuuming |
| **Rotating** | Takes turns through a chosen set of people, with a due date | its due date is close, as before | Trash night |
| **Fixed** | Always the same person, with a due date | its due date is close | "Wren waters the garden" |

- **Completing** records who did it and when ("last done"), and for rotating/fixed chores creates the next occurrence (§7.2 of the architecture doc). Missed rotating/fixed occurrences are marked `missed` in the log (not shame-y, just visible).
- **Optional checklist** (e.g. "Deep clean kitchen" → fridge, oven, floors).
- **Chores can go on a run** (a "cleaning run" that knocks out several at once, §6.4).
- **Grocery shopping isn't a chore anymore.** It's a **run** anyone starts from the shopping list. A house can still create a "Grocery run" chore as a rhythm reminder if it wants one.
- **[DECIDED] (owner) No chore balance / "who's done what" view.** Completions still show up in the activity log.

### 6.2 Shared shopping list (the pool)

- **[DECIDED] (owner) One shared list**, and **everything on it is shared** (split among the house).
- **Adding:** anyone, anytime, from Home's **"We're out of…"** field or the list on the Chores tab. One line per item ("dish soap"), with an optional short note ("the oat one, not almond"). Adding something that's already on the list gives it a +1 instead of duplicating it.
- **[DECIDED] (owner) Showing an item matters:**
  - **+1 "me too"**: shows who else needs it, with avatars.
  - **Need soon**: pulls the item to the top and highlights it.
  - The list sorts *Need soon* first, then by +1s, then newest.
- **Nobody is assigned.** Two ways to clear items:
  - **Grab one:** check it off directly ("got it on the way home"). It leaves the list.
  - **Start a run:** pick many at once (§6.4). While the run is open, those items show **"On Kavya's run"** so nobody double-buys, and they can't be claimed by another run.
- **Items are lines, not artifacts.** They have no priority, feelings, or assignee. Home shows a small summary ("Shopping list: 8 items, 2 needed soon").

### 6.3 One-offs (broken things, errands, setup)

- **Fields:** title, room, photos, due date, checklist, **Something's broken** toggle (default off; on for anything created from "What's broken").
- **Who's handling it** is a field on every one-off: *One of us* (default) or *Outside help*. **[DECIDED] (owner) Two levels only:**

```
 One of us            →      Outside help
 (a roommate does it)        (landlord · super · provider · repair person)
```

- **Escalate:** tap **"We need outside help"** → pick a contact (or add one) → confirm the point person. It takes 2–3 taps.
- **De-escalate:** "Actually, we've got it" flips it back. The contact log is kept.
- **Start escalated:** a new one-off can be created as outside help right away (e.g. "Heat's out").
- **[DECIDED] (owner) A point person is required.** An escalated one-off always has exactly one roommate assignee, responsible for chasing it. It defaults to whoever escalated.
- **Outside-help progress:** `Not contacted → Reached out → Heard back → Scheduled → Fixed`. Setting **Fixed** completes the one-off.
- **Scheduled = on a visit run.** Moving to *Scheduled* opens **Plan a visit** with this one-off pre-selected. If a visit with the same contact is already planned, it offers **"Add to the Super visit on Thu 10am"** instead (§6.4).
- **Contact log:** each attempt gets a date, channel (call/text/email/portal/in person), and note. Logging one while *Not contacted* moves it to *Reached out*.
- **Quick actions:** Call / Text / Email, with a prefilled message: "Hi {contact}, this is {me} at {address}. {description}."
- **[DECIDED] (owner) Follow-up nudges:** 3 days in *Reached out* with no update (house setting) marks it *stalled*, and the point person gets "No word from the super in 3 days. Nudge them?"
- **Paper trail:** the contact log can be copied as text, for security-deposit or repair disputes.
- **Linked purchases:** a repair bill or a replacement part links to the one-off.

### 6.4 Runs (shopping runs, errand runs, visits)

**[DECIDED] (owner)** A run is **a batch of things someone takes on at once**. It's its own category, so it gets a room, feelings, a calendar entry, and history like any item.

| Kind | Who does it | What it can hold | Example |
|---|---|---|---|
| **Shopping** | a roommate (the runner) | shopping items | "Kavya's grocery run · Sat" |
| **Errand** | a roommate | shopping items, one-offs, chores | "Hardware run": lightbulbs, return the lamp, copy keys |
| **Visit** | an outside contact, with a roommate as point person | one-offs (and chores, rarely) | "Super visit · Thu 10am": hallway light, radiator, Bathroom 2 fan |

**Starting a run**
- From the shopping list: **Start a run** → multi-select items (shortcuts: *Select all*, *Select Need soon*) → optionally **when** (puts it on the calendar and in Coming up) → **Start**. Everyone sees "Kavya is doing a grocery run: 6 items. Add anything?"
- From One-offs: **Plan a visit** → pick the contact → multi-select one-offs (broken ones first) → when → point person → **Plan**. Every selected one-off is escalated to that contact (if it wasn't already) and moves to *Scheduled*.
- From **+ → A run** for an errand run mixing shopping items, one-offs, and chores.
- **Adding more later:** "Add to this run" from the run, or from an item ("while he's here, can he look at the fan?").

**While it's open**
- Covered items show **"On {run}"** badges and can't be claimed by another open run.
- The run's detail is a **checklist**. The runner (or point person) ticks items off as they go.

**Finishing**
- **Shopping / errand:** **Finish run** → confirm what got done → **"Did you spend money?"** (amount, or Skip). Spending creates a **supplies** purchase linked to the run that lists what was bought.
- **Visit:** whenever it suits them, the point person opens the visit and taps **Wrap up visit**, marking each one-off *Fixed* / *Not fixed* with an optional note. **[DECIDED] (owner)** There's no automatic follow-up prompt. An open visit just stays in *Visits planned* until someone wraps it up.
- **Outcomes per item:** *done* completes it (a shopping item leaves the list, a one-off is completed, a chore records "last done"). *Not done* sends it back to the pool: a shopping item returns to the list, and a one-off goes back to *Heard back* with the note ("needs a part"). A one-off can be on several visits over time, and its detail shows that history.

### 6.5 Heads-ups, schedule entries & the calendar

**[DECIDED] (owner) Model: every schedule entry belongs to exactly one item.**

| Kind | How it's created | What it belongs to |
|---|---|---|
| **Attached** | "Add to calendar" on any item, or giving a run a time (a planned grocery run, a visit) | That item or run (the entry reuses its title and room unless overridden) |
| **Standalone** | **+ → Heads-up** → title, when, optional room | A lightweight **Heads-up** item, created together with the entry in one step |

- **Fields on an entry:** starts at, ends at (optional), all-day, title override, room override, note.
- An item can have **several entries** (a first visit and a follow-up).
- **"Got it 👍":** anyone can acknowledge an entry, and the entry shows who has. This is useful for "the exterminator needs everyone's rooms cleared."
- **Other notices that aren't about a time** are a **feeling note** on the related item, not heads-ups.
- **Heads-ups have no priority score and aren't in the ranked feed.** They're time-driven, so they show in **Coming up** instead.
- **Reminders:** everyone gets a notification the evening before and the morning of (standalone and attached alike).
- Past entries fade in the calendar. A standalone heads-up item is auto-archived once its last entry has passed.

**Calendar view** **[DECIDED] (owner): schedule entries only.** Chore due dates and bill due dates are not shown.
- **Coming up** (Home): a horizontal strip of the next 7 days' entries. Tap an entry to open its item, or tap the strip header to open the calendar.
- **Calendar:** a month grid with a dot on days that have entries, and the selected day's entries listed below. Each row shows the time, title, room chip, and its parent item's category (e.g. "One-off · Outside help · Super").

### 6.6 Purchases

Shared by all kinds: amount, payer/buyer, split (equal / custom % / custom $), receipt photo, provider contact (optional), linked chores/one-offs, Splitwise, room, tags.

**Owned** (things bought for the house)
- **Fields:** item, price, bought by, date, store, **return-by date**.
- **Ownership:** a list of members with shares (default equal among the people splitting). This answers "who owns the couch when we move out." An item can also be marked "personal, shared use" (one owner, everyone uses it).
- **Keep/return vote:**
  - Anyone can start a vote on an owned purchase. Each member votes Keep / Return / Don't care.
  - The deadline defaults to 2 days before the return-by date.
  - **[DECIDED] (owner) Decision rule:** the majority of Keep vs. Return among the people who voted wins ("Don't care" votes don't count). If Keep and Return are equal, the result is **Tie**. The app just shows "Tie (1–1)" and does nothing else automatically, and the house sorts it out in feeling notes or in person. Anyone can reopen the vote. If nobody votes Keep or Return, the result is also Tie.
  - "Return" automatically creates a linked **one-off** ("Return {item} by {date}") assigned to the buyer.
- **[DECIDED] (owner) Settled state.** An owned purchase is **open** while its return window or vote is live, then **settled** with an outcome: *kept*, *returned* (when the linked return one-off is done), or *no vote* (the return-by date passed with no vote). A settled purchase leaves the Home feed but stays in the Purchases tab as the ownership record.

**Bills** (subscriptions, utilities, rent)
- Cadence (monthly/quarterly/yearly), due day, amount (fixed or "varies"), **account holder** (whose name the account is in, which matters at move-out), **payer** (who pays the provider), provider contact, account number (last 4 only, masked), provider portal link.
- **[DECIDED] (owner) The amount can always be changed.** Anyone can tap **Change amount** and choose a scope:
  - **From now on**: a lasting change (the internet went from $55 to $60). It updates the amount for every future payment.
  - **Just this payment**: a one-off (a late fee, a prorated first month). It overrides only the upcoming payment, then reverts.
  - Past payments never change. Each payment records the amount actually paid, so history stays accurate.
  - Every change is logged ("Wren changed Internet from $55.00 to $60.00, from now on").
- **"Varies" bills** (electricity, gas) prompt the payer for the actual amount at **Mark paid**, prefilled with the last payment.
- **Due reminders** go to the payer 3 days before and on the due day. The payer taps **"Mark paid"** (confirming or editing the amount), then optionally "Open Splitwise." Each payment is kept in the bill's **payment history**, which shows the amount per period so price changes are visible.
- A problem with a bill (a wrong charge, an outage) becomes a **linked one-off**, escalated to outside help if needed.

**Supplies** (groceries, cleaning stuff, toilet paper)
- Amount, paid by, date, split (default equal), Splitwise. No ownership, no vote, no return window.
- Usually created from a run's "Did you spend money?" prompt (§6.4) and linked to that run, listing what was bought. They can also be added directly.
- Settled immediately. They appear in the Supplies segment and in the monthly share, not in the Home feed.

**Purchases tab summary:** "Your share this month: $X", covering bills due this month (actual amount if paid, otherwise the upcoming amount including any one-off override) plus owned and supplies purchases made this month.

**[DECIDED]** No bank or credit card connections, ever. That's a security and compliance burden with little upside for this app.

**Splitwise integration.** **[DECIDED] (owner)** v1 ships option (a), the **"Open Splitwise" button**. The house already uses Splitwise. Option (b) is phase 2. The options were:

| Option | How | Effort | UX |
|---|---|---|---|
| **a. Manual link-out** | "Open Splitwise" button + copy-to-clipboard of amount/description. User marks "added to Splitwise." | Tiny | Two apps, but reliable |
| **b. Splitwise API** ⭐ (phase 2) | Each user connects Splitwise once via OAuth. We map house members to Splitwise group members. "Add to Splitwise" creates the expense with the right split via `create_expense`. | Medium: OAuth app registration, token storage, member mapping UI | One tap |
| **c. Build our own ledger** | Track balances in-app | Large, and duplicates Splitwise | Replaces Splitwise, which is a non-goal |

The v1 button opens Splitwise (the app if it's installed, otherwise the website) and copies "{item} — ${amount}" to the clipboard. After that, the purchase shows an "Added to Splitwise ✓" toggle, so others know it's done. The data model already has a `splitwise_expense_id` field so (b) can drop in later.

### 6.7 Info (house reference)

- Pinned items appear at the top of the House tab (Wi‑Fi, door code instructions, trash days).
- **[DECIDED]** We don't store secrets in plaintext in general artifacts. For the Wi‑Fi password, we offer a "sensitive" field that's hidden behind a tap-to-reveal and excluded from notifications and the activity log. Door codes and alarm codes get the same treatment.

### 6.8 Move-in checklist (template)

When a house is created, the organizer can seed a **Move-in** template. They pick which items apply, and each item becomes a real artifact tagged `#move-in`:

- One-offs: sign lease, get renter's insurance, document move-in condition (photos of every room), set up the chore rotation, get keys copied, change address (USPS), agree on house rules.
- Chores: trash & recycling (rotating), bathroom cleaning (about weekly), wipe down the kitchen (as needed).
- Bills: internet, electricity, gas, water, rent.
- Heads-ups: move-in day, landlord walkthrough.
- Contacts: landlord, super/management, internet provider, utilities.
- Info: lease PDF, Wi‑Fi, trash/recycling schedule, building rules.

The Home feed shows a progress bar ("Move-in: 9/17 done") until the checklist is complete or dismissed.

---

## 7. Feelings

### 7.1 Feelings on artifacts

This is how Roomies covers "easy ways to check in" from the original PRD. **(owner)** There's no scheduled check-in or survey. Feelings are **opt-in**: a roommate adds one to a chore, one-off, or any other item only when they think it's important for the group to know how they feel about it. Nobody is prompted to rate things, and most artifacts will have no feelings at all. **(owner)** A feeling is always about that item, never about the person. The app never rolls feelings up into a per-person mood or shows them on someone's avatar.

Any member can attach **one current feeling** to any artifact, with an optional short note (≤ 280 chars). Changing your feeling replaces the old one, and removing it is one tap.

**[DECIDED] (owner) Feelings + notes replace comments.** There's no separate comment thread, so this is where the house talks about an item: concerns, updates ("🙂 Super says the part is backordered"), and decisions ("😌 Fine to return it, honestly").
- **Earlier notes stay visible.** When someone changes their feeling or note, the old one moves to an **Earlier** list under "How the house feels," with the time, so the conversation isn't lost. It's read from the activity log, and nothing is edited in place.
- **🙂 Fine is the neutral option** for a plain update that isn't really a feeling. It adds 0 to priority.

**[DECIDED] Starting set of feelings (fixed list in v1, weights configurable):**

| Feeling | Emoji | Default priority weight | Meaning |
|---|---|---|---|
| Anxious | 😰 | +20 | This is stressing me out |
| Frustrated | 😤 | +15 | This keeps happening / isn't getting handled |
| Confused | 😕 | +5 | I don't understand what's going on with this |
| Fine | 🙂 | 0 | Aware, no strong feelings |
| Not a big deal | 😌 | −5 | Don't prioritize this on my account |
| Thanks | 🙏 | 0 | Appreciation. Doesn't affect priority. |

- Adding one: tap the 🙂+ button on any artifact card or detail screen → pick a feeling → optional note → done (2–3 taps).
- Feelings are shown as an emoji row on the artifact card. Tapping it shows who feels what and their notes.
- When someone adds 😰 or 😤, the **assignee** gets a notification (the note is included if the author wrote one).
- **[DECIDED] (owner) Feelings always show who posted them.** There's no anonymous option.
- **[DECIDED]** No custom house-defined feelings in v1. A fixed set keeps the signal comparable. The weights can still be changed (§8.2).
- **[DECIDED] (owner) No weekly check-in, house mood score, or survey.**

---

## 8. Priority score

### 8.1 Formula (v1)

The score is computed at read time, because it changes as due dates approach.

```
score = base(base_priority)
      + due_pressure(due_at, now)
      + Σ feeling_weight(f) for each member's current feeling
      + staleness(handler, outside_stage, last_activity_at)
      + outside_boost(handler)
clamped to [0, 100]
```

| Component | Default |
|---|---|
| base | Low 10 · Normal 25 · High 45 · Urgent 70 |
| due_pressure | overdue: +35, +2/day overdue (cap +15) · due ≤ 24h: +25 · ≤ 3d: +15 · ≤ 7d: +5 · no due date: 0 |
| feelings | per §7.1 table. Each member contributes at most one feeling. |
| staleness | One-offs with outside help only: +1 per day since the last update (cap +15) while in *Reached out* |
| outside_boost | One-off handled by outside help: +5 (outside parties are slow, so start early) · otherwise 0 |

Done/archived items, **heads-ups**, **runs** (shown in *Runs in progress* instead), **info**, settled purchases, supplies, and shopping items have no score and don't appear in the feed. **As-needed chores** appear only when someone has shared a feeling on them. **Rhythm chores** appear once past their rhythm, with the days past counting as due pressure. Bills appear when a payment is coming due, and owned purchases while a vote or return window is open.

**Display:** users see a **tier**, not a raw number: ●● **Top** (≥ 70), **High** (45–69), **Normal** (20–44), **Low** (< 20). Tapping the tier shows "Why is this here?", a breakdown of the components (e.g. "Due tomorrow +25, 😰 Maya +20"). That transparency matters for trust.

### 8.2 Preferences: who controls the weights?

The original PRD says "can change what impacts the priority score in preferences." **[DECIDED] (owner) Option (a): one shared set of weights for the house.** The options were:

| Option | Behavior | Pros | Cons |
|---|---|---|---|
| **a. House-level weights** ⭐ | One set of weights. Any member can change them, and changes are logged and announced in the feed. | Everyone sees the same ranking, so it's a shared source of truth | One person's preference affects everyone |
| **b. Per-user weights** | Each member tunes their own weights, and their Home feed is sorted by their weights | Respects "different priorities of different roommates" | No shared view of what matters most, and the "concerns are heard" signal gets fragmented |
| **c. Both** | House weights drive the shared feed. Personal weights power an optional "My priorities" sort. | Most flexible | More UI, more to explain |

Preferences UI: presets ("Deadlines first", "Feelings first", "Balanced", with Balanced as the default) plus advanced sliders for each weight. Any member can change them. Every change is logged and shows up as a card on Home ("Maya changed priorities to Feelings first"). Personal differences come through **feelings**, which is what they're for.

---

## 9. Activity log

- An append-only, reverse-chronological feed of every meaningful event: artifact created/edited/completed/archived, assignment changed, feeling or note added/changed, escalated/de-escalated, contact attempt logged, schedule entry added/moved/canceled, heads-up acknowledged, run started/finished (with per-item outcomes), shopping item added/+1/need soon/grabbed, vote cast/closed, payment marked, member joined/left, preference changed.
- Filters: by member, by type, by tag.
- Each entry deep-links to the artifact.
- **[DECIDED]** Entries are generated server-side (database triggers), so the log is complete no matter which client made the change. Sensitive fields are never written to the log.
- Retention: forever (it's tiny). Export as CSV from House → Settings.

---

## 10. Membership, invites & access

- **Creating the house:** done once by the owner through a private one-time setup link (see Architecture §5.2). Fields: name, address (optional, used in outside-help message templates), unit number. The owner becomes an **admin**.
- **No public sign-up.** Typing an email into the app without an invite does nothing. No code is sent and no account is created.
- **Inviting:** the admin shares an **invite link** (`<app>/join/<token>`) through the group chat. The link:
  - expires after 7 days (configurable) or after its use limit (default: number of open spots),
  - can be revoked or regenerated anytime,
  - is **not** tied to a specific email **[DECIDED] (owner)**. Whoever opens it can join, which is why joins notify everyone.
- **Joining:** open the link → enter name + email → type the 6-digit code from the email → you're in. Four steps, no password.
- **Signing in later** (new phone, cleared Safari): enter your email → type the code. This only works for emails that already have an account.
- **[DECIDED] (owner) Joining via the link is instant.** There's no admin approval. Everyone gets a notification ("Sam joined the house"), and an admin can remove someone with one tap. Links expire and can be revoked, which limits the damage if one gets forwarded.
- **Roles:** `admin` (manage invites, remove members, change house settings, delete house) and `member` (everything else). Multiple admins are allowed.
- **Moving out:** an admin (or the person themselves) marks a member as **moved out**. They lose access, but their name stays on historical artifacts and ownership records. At that point the app shows the items they co-own and the recurring purchases where they're the account holder, as a move-out checklist.
- **Deleting your account:** "Delete my account" in settings removes your email and profile. Your name on past artifacts becomes "Former roommate."
- **Access guarantee:** nobody who isn't a current member of the house can read or write any of its data. This is enforced at the database layer, not only in the UI.

---

## 11. Notifications

| Trigger | Recipient | Default |
|---|---|---|
| Assigned to you | assignee | on |
| Chore / one-off / bill due (day before + day of) | assignee / payer | on |
| Overdue | assignee | on (once) |
| 😰 / 😤 feeling added | assignee (or all if unassigned) | on |
| A note added to a feeling on something you're assigned to or created | those people | on |
| Vote started / closing soon | all members | on |
| Outside help: no word in 3 days | point person | on |
| Heads-up (any schedule entry): evening before + morning of | all members | on |
| New heads-up added | all members | on |
| Someone started a shopping/errand run ("Add anything?") | all members | on |
| Member joined/left | all | on |

- Delivered via **Web Push** (requires installing the PWA to the Home Screen on iOS 16.4+) with **email fallback** for people who haven't installed it. See Architecture §7.
- Quiet hours are per user (default 10pm–8am local), and pushes in that window are held until morning.
- Per-category toggles in personal settings.

---

## 12. Decision log

| # | Question | Decision | Source |
|---|---|---|---|
| Q1 | "Personal chores": assigned-to-me or private? | Assigned to a person, everyone can see them | Owner |
| Q2 | Chore balance / "who's done what" view? | No | Owner |
| Q3 | Keep/return vote rule? | Majority of Keep/Return voters. An equal count shows **Tie** and nothing happens automatically. | Owner |
| Q4 | Splitwise? | House uses it. v1 = "Open Splitwise" button. API in phase 2. | Owner |
| Q5 | Feelings anonymity? | Always show who posted | Owner |
| Q6 | Custom feelings in v1? | No | Default |
| Q7 | Weekly check-in / house mood? | Removed. Feelings on artifacts are opt-in and are the only check-in mechanism. | Owner |
| Q8 | Priority weights? | One shared set for the house, with presets | Owner |
| Q9 | Invite joins? | Instant, everyone notified, no approval | Owner |
| Q10 | Sign-in method? | Email 6-digit code (magic links open outside the installed app on iOS). Passkeys later. | Default |
| Q14 | Who can join? | Only people with a valid invite link. Public sign-up off. The owner bootstraps the house via a one-time setup link. | Owner |
| Q15 | Lock invites to specific emails? | No. Expiry, use limit, and join notifications are enough. | Owner |
| Q16 | Visual style? | Focus Friend-inspired *feel* through color, shape, and tone only. No custom art, characters, or reward loop. | Owner |
| Q17 | Rooms? | The real apartment layout is seeded as rooms. Air/Fire/Water/Earth are the bedrooms and set each member's color. | Owner |
| Q18 | Are feelings about people? | No. A feeling is only about a task/item. Avatars and profiles never show feelings or mood. | Owner |
| Q19 | Separate "Request" type for outside help? | No. Outside help is a two-level escalation on a one-off (*one of us* → *outside help*), with a required point person and follow-up nudges. | Owner |
| Q20 | Name of the money area? | **Purchases**. Bills are recurring purchases. | Owner (name) / Default (merging bills in) |
| Q21 | Linking? | Chores and one-offs can be linked to purchases, both directions | Owner |
| Q23 | What happens to a one-time purchase after its vote? | It's **settled** (kept / returned / no vote): out of the feed, kept as the ownership record | Owner |
| Q24 | Categories? | One record type with category presets: **Chores** (incl. grocery runs), **One-offs** (broken toggle, outside help), **Purchases** (owned / bill / supplies), **Heads-ups**, **Info** | Owner |
| Q25 | Fixes vs. To-dos? | One category, **One-offs**, with a "Something's broken" toggle | Owner |
| Q26 | Decisions category? | No. Discussion happens in feeling notes on the related item. | Owner |
| Q30 | Comments? | **Removed.** Feeling + note already covers it. Each person has one current feeling and note per item, and earlier notes stay visible as history. | Owner |
| Q27 | Heads-ups model? | Schedule entries that always belong to one item. Standalone heads-ups are a lightweight Heads-up item that owns its entry. Non-time notices are feeling notes. | Owner |
| Q28 | Calendar contents? | Schedule entries only (no chore or bill due dates) | Owner |
| Q29 | Shopping list? | One shared list, cleared by grabbing items or by runs (superseded by Q31) | Owner |
| Q31 | How do batches work? | **Runs**: a category (shopping / errand / visit) that claims many items via a join table. Items can be shopping items, one-offs, or chores. | Owner |
| Q32 | Emphasis on shopping items? | +1 "me too" and a "Need soon" flag | Owner |
| Q33 | Default chore mode? | *Anyone, as needed*. Rhythm, rotating, and fixed are opt-in. | Owner |
| Q34 | Personal vs. shared shopping items? | Everything on the list is shared | Owner |
| Q22 | Can a recurring purchase's amount change? | Yes, scoped "from now on" or "just this payment." Past payments keep their actual amounts. | Owner |
| Q11 | Scope? | One house only | Owner |
| Q12 | Domain? | `*.vercel.app` to start | Default |
| Q13 | Priority formula? | As written in §8.1. Tune after 2 weeks of real use. | Default |

Rows marked "Default" are my calls. You can override any of them.

---

## 13. Release plan

| Phase | Scope | Exit criteria |
|---|---|---|
| **M0: Foundations** | Repo, CI, hosting, DB, Resend email, auth with public sign-up off, PWA shell, tab bar, design tokens (base + element + plum colors) + core UI components | Owner creates the house via the setup link on iPhone. A stranger's email gets no code. |
| **M1: House & members** | Invite links (create/revoke/expiry/use limit), join flow, returning sign-in, seeded rooms + "which room is yours?", element-colored avatars, roles, members list, remove member, delete account | All roommates joined. Expired/revoked links are rejected. |
| **M2: Core artifacts** | Artifact CRUD with categories, Chores (four modes, last done), One-offs (basic), Info, shared shopping list (+1, need soon, grab), shopping & errand runs, tags, attachments, links to purchases, activity log | House actively using chores and the shopping list for 1 week |
| **M3: Feelings & priority** | Feelings, priority score + tiers + "why", Home feed, preferences (house weights) | Home feed ordering feels right to all roommates |
| **M4: Outside help & heads-ups** | Contacts, escalate/de-escalate, outside-help progress, contact log, quick actions, follow-up nudges, visit runs (plan, add to, wrap-up), schedule entries, standalone heads-ups, "Got it", Coming up strip, calendar | One real super visit covering several one-offs, wrapped up with per-item outcomes |
| **M5: Purchases** | Bills (reminders, mark paid, editable amounts, payment history), owned (ownership, keep/return votes, settled state), supplies (from "Did you spend money?"), monthly share, Splitwise link-out | Move-in checklist usable end-to-end. One real vote completed. |
| **M6: Notifications** | Web push, email fallback, quiet hours | Every roommate receives a reminder on their phone |
| **Phase 2** | Splitwise API, move-out flow, CSV export, passkeys, multi-house support (if ever wanted) | — |

Notifications (M6) could move earlier if reminders turn out to be what gets people to use the app. That's worth revisiting after M2.
