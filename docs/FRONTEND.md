# Roomies — Frontend & Visual Design Guidance

**Status:** Draft v0.6 (flexible chores, shopping pool, runs & visits)
**Companions:** [PRD.md](./PRD.md) · [ARCHITECTURE.md](./ARCHITECTURE.md) (§8 covers frontend code structure) · [mockup.html](./mockup.html) (clickable prototype, open in a browser)
**Last updated:** 2026-09-24

> Same convention: **[DECIDED]** = default we'll build with, **[OPEN]** = needs your call. §10 lists every open item.

---

## 1. Inspiration: Focus Friend, by Hank Green

[Focus Friend](https://focusfriend.me/) is a focus-timer app. A little bean knits while you focus, and finishing sessions earns decorations for its rooms. Reviewers call it "cozy" and praise that it motivates with warmth instead of guilt.

**[DECIDED] (owner)** Roomies has **no custom illustrations or characters for now**. We take Focus Friend's *feeling* through **color, shape, and tone of voice** alone:

| Focus Friend quality | What it becomes in Roomies (no art needed) |
|---|---|
| Cozy, warm palette | Cream paper background, brown ink text, soft pastel fills (§3) |
| Soft, rounded, "coloring-book" feel | Rounded system font, pill buttons, visible soft outlines, and a "sticker" edge instead of blurry shadows (§3.3) |
| A home with rooms is the center of the app | **Your apartment's real rooms** are a first-class part of the app: every item can live in a room, and each elemental room has its own color (§4) |
| Positive motivation, never shame | Gentle copy ("This one's been waiting a bit"), no alarm-red "OVERDUE" (§7) |
| Simple, uncluttered screens | One primary action per screen, a big "+" button, and standard iPhone navigation |

**What we don't copy:** any Focus Friend assets or characters, or its guilt mechanic (the bean gets sad when you get distracted). Among roommates, a guilt mechanic would feel like public shaming.

---

## 2. Design principles

1. **Cozy, not childish.** Warm and soft, but still an adult tool.
2. **Color means something.** Color says *who* (a person's element) and *how urgent* (priority tier). Nothing is colored just for decoration.
3. **Kind by default.** Every string assumes good intent. Nothing labels a person as having failed.
4. **Feelings are welcome.** Sharing one should feel as low-stakes as an emoji reaction.
5. **Data stays legible.** Money, dates, and names are always high-contrast and plain.
6. **Standard iPhone patterns.** Tab bar, bottom sheets, swipe actions.

---

## 3. Visual language

### 3.1 The color system

Color has exactly three jobs:

| Job | Colors | Where it appears |
|---|---|---|
| **Base** | Cream paper, brown ink | Backgrounds, text, outlines |
| **Who / where** | The four **elements**: Air, Fire, Water, Earth, plus a neutral for shared rooms | Person avatars, room chips, the person's bedroom |
| **How urgent** | **Plum**, the app's accent | The priority tier chips, the "+" button, primary buttons |

Item *categories* (Chore, One-off, Purchase, Heads-up, Info) and states like *Outside help* or *Broken* do **not** get their own colors. They're shown with an **icon + label** on a neutral chip. Giving types, people, and tiers each their own color would make the screen noisy, and color would stop meaning anything.

Plum was chosen as the accent because it's the one warm hue that doesn't belong to any element, so "urgent" never gets confused with "Fire's."

All text/background pairs below were checked and pass **WCAG AA** (≥ 4.5:1). The lowest is Fire at 5.6:1.

#### Base (light · "daytime")

| Token | Hex | Use |
|---|---|---|
| `--paper` | `#FBF5EA` | App background |
| `--card` | `#FFFDF8` | Cards, sheets |
| `--ink` | `#3B2F2A` | Primary text, outlines |
| `--ink-soft` | `#6E5E53` | Secondary text (5.7:1) |
| `--line` | `#E6D9C4` | Dividers, borders |
| `--neutral-fill` / `--neutral-ink` | `#EFE6D6` / `#5E4E43` | Type chips, shared-room chips (6.4:1) |

#### Elements (light)

| Element | Fill | Ink | Contrast | Palette feel |
|---|---|---|---|---|
| **Air** | `#F7EBC0` | `#6B5410` | 6.1:1 | pale sunlight, straw |
| **Fire** | `#F6CDB8` | `#8A3413` | 5.6:1 | ember, terracotta |
| **Water** | `#CFE0F2` | `#1F4A73` | 6.8:1 | clear sky-blue, deep lake |
| **Earth** | `#D7E6CC` | `#3A5A2E` | 6.0:1 | moss, garden |

These follow the classic element colors (air = yellow, fire = red-orange, water = blue, earth = green), so they're easy to tell apart and remember.

#### Accent & priority (light)

| Token / tier | Fill | Ink / text | Contrast |
|---|---|---|---|
| `--accent` (buttons, "+") | `#7A3E6E` plum | `#FFFFFF` | 7.7:1 |
| `--accent-ink` (links, accent text on paper) | — | `#6A3460` | 8.5:1 |
| **Top** tier chip | `#EBD3E6` | `#6A2F5E` | 6.9:1 |
| **High** tier chip | `--card` with a 1.5px plum outline | `#6A3460` | 9.1:1 |
| **Normal** tier chip | `--neutral-fill` | `--neutral-ink` | 6.4:1 |
| **Low** | no chip, just "Low" in `--ink-soft` | | |

Tier chips always carry the word ("Top", "High"...). Color is never the only signal. The Top chip uses a **●● double dot** marker instead of the 🔥 emoji used in earlier drafts, so it can't be confused with the Fire room.

#### Dark ("cozy night"): warm browns, never pure black

| Token | Hex | | Element | Fill | Ink |
|---|---|---|---|---|---|
| `--paper` | `#211A16` | | Air | `#3D3418` | `#F2DC8C` |
| `--card` | `#2C2420` | | Fire | `#43261B` | `#F4B79C` |
| `--ink` | `#F5EBDD` | | Water | `#1C2F42` | `#A9CBEB` |
| `--ink-soft` | `#C4B4A4` | | Earth | `#26341F` | `#BFD9AE` |
| `--line` | `#3E332D` | | Neutral | `#3A302A` | `#D9CBB8` |
| `--accent` | `#D9A0CB` (text on it `#211A16`, 8.0:1) | | Top tier | `#46283F` | `#F0CDE7` |

All dark pairs are ≥ 7.9:1.

**[DECIDED]** Dark mode follows the system setting, with a Light / Dark / Auto override in personal settings.

### 3.2 Typography

- **[DECIDED]** `font-family: ui-rounded, "Nunito", system-ui, sans-serif`. On iPhone this is **SF Pro Rounded**: built in, no download, and instantly friendly. Nunito (Google Fonts) is the fallback elsewhere.
- Support iOS **Dynamic Type** with `font: -apple-system-body` on the root and `rem` sizing everywhere.

| Style | Size / weight | Use |
|---|---|---|
| Display | 28 / 800 | Screen titles |
| Title | 20 / 700 | Sheet titles, section headers |
| Body | 17 / 400 | Default |
| Body strong | 17 / 600 | Item titles in lists |
| Caption | 13 / 500 | Meta line (room · person · due) |
| Number | 17 / 600, tabular-nums | Money, dates |

Inputs are always ≥ 16px, which prevents iOS from zooming in on focus.

### 3.3 Shape, line & depth

- **Outlines:** cards, chips, and buttons get a 1.5px `--ink` outline at ~15% opacity. This gives the soft "drawn" edge without any illustration.
- **Radius:** cards 20px, buttons and chips fully rounded (pill), sheets 28px top corners.
- **Depth:** no blurry shadows. We use a **"sticker" edge**: `box-shadow: 0 2px 0 <darker tone of fill>`. When pressed, the edge disappears and the element moves down 2px, so buttons feel squishy.
- **Spacing:** 4px grid, 16px screen gutters, 12px between cards, 44×44pt minimum touch targets.

### 3.4 Icons

[Lucide](https://lucide.dev) icons at a 2px stroke with round caps. Type icons:

| Category / state | Icon | Label on chip |
|---|---|---|
| Chore | `sparkles` / `repeat` | mode label: "As needed", "About weekly", "Rotates", "Fixed" |
| Run: shopping / errand | `shopping-cart` / `route` | "Kavya's run" |
| Run: visit | `phone` | "Super visit" |
| On a run (badge) | `shopping-cart` / `calendar` | "On Kavya's run" / "On Super visit · Thu" |
| Shopping item emphasis | `arrow-up` (not `flame`, which means the Fire room) | "Soon" chip, and "+2" with avatars |
| One-off | `check-circle` | One-off |
| One-off, broken | `wrench` | Broken |
| One-off with outside help | `phone` | Outside help · {contact}, e.g. "Outside help · Super" |
| Purchase: owned | `shopping-bag` | Owned |
| Purchase: bill | `receipt` | Monthly / Quarterly / Yearly |
| Purchase: supplies | `package` | Supplies |
| Heads-up / schedule entry | `calendar` | the date and time, e.g. "Thu 10:00" |
| Info | `book-open` | Info |
| Linked purchase | `link` | the linked item's title, e.g. "🔗 Internet" |

Element icons (for room chips and the small element icon on avatars): Air `wind`, Fire `flame`, Water `droplet`, Earth `sprout`.

---

## 4. People & rooms

### 4.1 The apartment

The apartment's real layout is seeded into the app. Every item can optionally be placed in a room ("Leak under the sink" → **Kitchen**, "Radiator clanking" → **Fire**).

```
FIRST FLOOR                                         BASEMENT
                                                    (stairs come down here)
[Air]  ← end of the long hallway                    [Downstairs living room]  ← bottom of stairs
  │    small · 2 windows                              │   [Bathroom 3] (half bath, right, back)
[Fire]                                                │   [Laundry]    (opposite Bathroom 3)
  │    1 window · closed-off fireplace              [Craft room]
[Water]                                             [Earth]
  │                                                 [Fitness space] → door → [Garden]
[Bathroom 1]  (full)
[Bathroom 2]  (full)
  │
[Front door]
  ├── left → [Kitchen] ── stairs down ── [Living room] (forward from kitchen)
[Hallway] runs the full length
```

**Seeded rooms**

| Floor | Room | Kind | Color |
|---|---|---|---|
| 1 | Hallway | common | neutral |
| 1 | **Air** | bedroom | **Air** |
| 1 | **Fire** | bedroom | **Fire** |
| 1 | **Water** | bedroom | **Water** |
| 1 | Bathroom 1 | bath (full) | neutral |
| 1 | Bathroom 2 | bath (full) | neutral |
| 1 | Front door / entry | entry | neutral |
| 1 | Kitchen | common | neutral |
| 1 | Living room | common | neutral |
| 1→B | Stairs | common | neutral |
| B | Downstairs living room | common | neutral |
| B | Bathroom 3 | bath (half) | neutral |
| B | Laundry | utility | neutral |
| B | Craft room | common (shared) | neutral |
| B | **Earth** | bedroom | **Earth** |
| B | Fitness space | common (door to the garden) | neutral |
| — | Garden | outdoor | neutral |

- Rooms are editable in House → Rooms (rename, reorder, add, archive, set the element color).

**[DECIDED] (owner)** Air, Fire, Water, and Earth are the four bedrooms, one per roommate. The craft room is shared. The baths are Bathroom 1 and 2 (upstairs, full) and Bathroom 3 (downstairs, half). The space with the garden door is the Fitness space.

### 4.2 People: element-colored avatars

**[DECIDED] (owner: keep it simple)** Each person is a **colored circle with their initials**. There are no characters and no customization.

- A person's color is the **element of their bedroom**. Whoever lives in Air is yellow, in Fire red-orange, in Water blue, in Earth green. Their avatar also has a tiny element icon badge.
- That makes one consistent visual idea: **your color is your room.** On a card, a green avatar means an Earth person, and a green room chip means Earth's room.
- Anyone without an elemental bedroom (a future roommate, a guest room) gets the neutral color until they pick an element.
- Sizes: 20px (inline), 32px (list rows), 48px (detail and feelings sheet), 64px (members list).

### 4.3 Feelings belong to items, not people

**[DECIDED] (owner)** A feeling is about an **item** (a chore, one-off, purchase, or heads-up), never about a person as a whole. So:

- Avatars never show feelings. There's no badge, no mood, and no "how is Maya doing" summary anywhere.
- Feelings appear only on the item: an emoji count on the card ("😰 1") and the full list (who + note) in the item's detail view.
- A person's avatar next to a feeling just shows who shared it, the same way it shows who's assigned.

---

## 5. Key screens

Tabs: **Home · Chores · One-offs · Purchases · House**. The calendar opens from Home.

### 5.1 Home

```
┌───────────────────────────────┐
│ Home                    (KD)  │  ← your avatar → settings
│ Coming up              All ›  │  ← next 7 days of schedule entries; "All" opens the calendar
│ [Thu 10:00 Super · Fire]      │  ← horizontal scroll of entry pills:
│ [Sat  All day Parents stay]   │     time · title · room chip
│ ┌ We're out of… ──────── + ┐  │  ← one-line quick add to the shared shopping list
│ Runs in progress              │  ← compact rows: "Wren's grocery run · 3 items · Sat"
│ Needs attention    Mine | All │
│ ┌───────────────────────────┐ │
│ │ ●● Top                    │ │
│ │ Leak under the kitchen sink│ │
│ │ [🔧 Broken] [📞 Outside   │ │
│ │  help · Landlord] [Kitchen]│ │
│ │ (K) Not contacted     😤1 │ │
│ └───────────────────────────┘ │
│                          (+)  │  ← plum "+"
│ [Home][Chores][One-offs][Purchases][House]
└───────────────────────────────┘
```

- **Card anatomy:** tier chip → title → chip row (category/state chips in neutral, room chip in the room's color, linked purchase chip) → meta line (assignee avatar + status/due + feelings count).
- **Swipe:** right = complete (chores, one-offs) or mark paid (bills), left = share a feeling.
- Heads-ups never appear in the ranked list, only in Coming up and the calendar.

### 5.2 Sharing a feeling (the most important interaction)

Tap **🙂+** on a card or detail screen, or swipe left, to open a short bottom sheet:

- Title: "How do you feel about this?" Subtitle: "Only if it matters to you. The house will see it."
- Six big emoji buttons with labels: Anxious 😰 · Frustrated 😤 · Confused 😕 · Fine 🙂 · Not a big deal 😌 · Thanks 🙏
- An optional note field, then **Share with the house**.
- Confirmation toast: "Shared. The house can see how you feel. 💛"
- Tap your own feeling to change it or **Remove my feeling**.
- Two taps without a note, which meets the PRD's ≤ 3.

### 5.3 Add sheet (+)

1. Pick a category from six tiles: **"A chore"** (ongoing upkeep), **"A one-off"** (broken thing or errand), **"A run"** (grocery run, errand run, or a visit), **"Something we bought"**, **"A heads-up"** (something happening at a time), **"House info"**.
2. Title field (autofocused) + **Add**. Optional rows below depend on the category:
   - **Chore:** mode (*As needed* default, *On a rhythm* → every N days, *Rotating* → who + how often, *Fixed* → who + how often), room.
   - **One-off:** *Something's broken* toggle, **Who's handling it?** (*One of us* / *Outside help* → contact picker), room.
   - **Purchase:** *Owned / Bill / Supplies*, amount. Bill reveals cadence + due day.
   - **Heads-up:** **When** (date, time or all-day, optional end), room, note. It's created with its schedule entry in one step.
3. **Room picker:** a list grouped by floor ("First floor", "Basement", "Outside"). Elemental rooms show their color dot.

### 5.4 Item detail

A full-height sheet with the tier + category chips, title, status control, then meta rows (room chip, assignee avatars, due, tags), **linked purchases**, **schedule entries** (with "+ Add to calendar"), "How the house feels" (each person's current feeling + note, with an **Earlier** list of previous notes; this is where the house discusses and decides), attachments, and a one-line history. There is no separate comments section.

### 5.4a Chores tab & the shopping list

- **Shopping list card** (top):
  - rows sorted *Soon* → +1s → newest. Each row has a check circle (**grab**: "Got it" removes it), the name, an optional note, a **+1** button (avatars of who +1'd), and a **Soon** toggle.
  - items on an open run show a quiet **"On Wren's run"** badge and can't be grabbed into another run
  - an add field at the bottom (re-adding an existing item gives it a +1)
  - a primary **Start a run** button
- **Start a run sheet:** kind (*Groceries* / *Errands*) → a checklist of open, unclaimed items with *Select all* / *Select Soon* chips. Errands also list open one-offs and chores. Optional **When** → **Start run**. Toast: "Run started. Everyone can see what's on it."
- **Chores list** (below): cards show the mode chip and a "Last done 9 days ago · Wren" meta line. Rhythm chores past their rhythm float to the top with "Due for a clean." One-tap **Done** from the card.

### 5.4b One-offs tab, outside help & visits

- Filters: *Mine / All / Broken / Outside help*. A primary **Plan a visit** button sits above the list.
- **Plan a visit sheet:** contact picker → a checklist of open one-offs (broken first; one-offs already escalated to that contact pre-checked) → date + time → point person → **Plan visit**. It creates one calendar entry for the visit.
- A one-off's detail has a **"Who's handling it?"** row: *One of us* · *Outside help*. Choosing **Outside help** opens the escalate sheet (contact + point person).
- Once escalated, the **outside-help box** shows the progress stepper, contact buttons (**Call / Text / Copy number**), **Log a contact** + the log, and "Actually, we've got it." Tapping **Scheduled** opens *Plan a visit* with this one-off pre-selected, or **"Add to the Super visit · Thu 10am"** if one is already planned.
- Items on an open visit show **"On Super visit · Thu"**. Their detail lists every visit they've been on, with outcomes ("Thu: needs a part → Tue: fixed").

### 5.4c Run detail

- Header: kind chip, runner/point person, when (and a calendar entry if timed), contact for visits.
- A **checklist** of `run_items` (each tick sets *done*). For visits, each row has *Fixed* / *Not fixed* and an optional note.
- **Add more** opens the same picker. **Finish run** (shopping/errand) asks "Did you spend money?" → **Log purchase** / **Skip**. **Wrap up visit** asks for per-item outcomes.
- Unticked items go back to the pool on finish. The toast says so ("2 items went back on the list").

### 5.4d Purchases tab

- The top card is **"Your share this month: $X"**.
- Segments: *Bills / Owned / Supplies*.
- Bill rows show amount, due date, and payer, with a **Mark paid** check. The detail has **Change amount** (*From now on* / *Just this payment*) and the payment history.
- Owned rows show price, buyer, and vote status ("It's a tie (1–1)"), and settle once the vote or return window is done.
- Supplies rows show the amount, who paid, the linked run, and what was bought.
- The purchase detail shows **linked chores/one-offs** and a **"+ Link"** button.

### 5.4e Calendar

- Opens from **Coming up → All**. It shows a **month grid** (a dot on days with entries, today outlined), with the selected day's entries listed below.
- Each entry row shows the time (or "All day"), title, room chip, the parent item's category ("One-off · Outside help · Super" or "Heads-up"), and **Got it 👍** with the avatars of people who've acknowledged it.
- Tapping an entry opens its parent item. A floating "+" here creates a standalone heads-up on the selected day.
- **Schedule entries only (owner).** No chore or bill due dates.

### 5.5 House tab → Rooms & Contacts

A simple list grouped by floor. Each row shows the room name, its color dot or chip, and a count of open items ("Kitchen · 3 open"). Tapping a room shows everything in it, which is handy for "what's broken in the basement?" Below the rooms is **Contacts** (landlord, super, providers), each with the number and a Copy button, and a count of the open one-offs escalated to them.

**[OPEN] F3:** Later, this could become a simple **floor plan made of colored blocks** (no illustration, just rectangles in element and neutral colors, laid out like §4.1) that you tap to open a room. Recommendation: phase 2. The list covers the need for v1.

### 5.6 Join, sign-in, empty states

- Join page: "Sam invited you to the apartment 🏠" → name + email → 6-digit code (six big boxes, `autocomplete="one-time-code"`) → **"Which room is yours?"** (pick from bedrooms, which sets your element color) → Add to Home Screen guide.
- Empty states are text + an icon in a soft neutral circle + one button. For example, Chores all done: "Nothing to do. Enjoy the quiet." Nothing on the calendar: "Nothing coming up. Quiet week." House info: "Add the Wi‑Fi so nobody has to ask again."

---

## 6. Delight (kept small)

- **Complete a chore or one-off, or mark a bill paid:** the checkbox fills with a quick spring and a short burst of 5–6 small dots in the completer's element color (≤ 500ms).
- **A Top item gets resolved:** the card fades out with a gentle "Handled 💛" toast.
- **Move-in checklist done:** a one-time full-screen card, "You're all moved in," with a confetti burst in all four element colors.
- Everything respects `prefers-reduced-motion`, falling back to a simple fade.
- **[DECIDED] (owner)** No unlockable decorations or reward loop.

---

## 7. Voice & copy

**The voice:** a warm, slightly funny housemate who's good at remembering things. Casual, kind, short, with at most one emoji per string.

| Situation | ✅ Write | ❌ Not |
|---|---|---|
| Overdue chore or one-off | "This one's been waiting a couple days" | "OVERDUE" · "You missed this" |
| Due today | "Today's the day" | "DUE" |
| Escalated, no reply | "No word from the super in 3 days. Nudge them?" | "Request stalled" |
| Escalating | "Who should we reach out to?" | "Create external request" |
| Someone shares 😰 | "Maya's feeling anxious about Radiator clanking" | "Maya flagged Radiator" |
| Push: assigned | "You're on trash this week 🗑️" | "New assignment" |
| Vote tie | "It's a tie (1–1). Talk it out?" | "Vote failed" |
| Network error | "Couldn't reach the house. Check your connection and try again." | "Error 500" |
| Invite expired | "This invite has expired. Ask a roommate for a fresh link." | "Invalid token" |
| Archive confirm | "Archive this? You can bring it back for 30 days." | "Are you sure?" |

Rules:
- Use people's names in copy, never their room name. The element shows up in the avatar color, not the words.
- Describe the *item's* state, never a person's failure.
- Sentence case. Plain numbers ("$62.40 · due Oct 3").

---

## 8. Motion

| Token | Value | Use |
|---|---|---|
| `--ease-spring` | `cubic-bezier(.34,1.56,.64,1)` | Press release, checkbox fill |
| `--ease-out` | `cubic-bezier(.22,1,.36,1)` | Sheets, transitions |
| `--dur-fast` | 120ms | Press states |
| `--dur-base` | 240ms | Sheets, toggles |
| `--dur-slow` | 480ms | Completion burst |

Press: `scale(.96)` and the sticker edge collapses. Sheets are drag-to-dismiss. Reduced motion leaves only fades.

---

## 9. Implementation guidance

| Concern | Decision |
|---|---|
| Tokens | CSS variables in `app/globals.css` for `:root`, `[data-theme=dark]`, and `@media (prefers-color-scheme: dark)`, exposed to Tailwind v4 via `@theme`. Element colors are tokens (`--air-fill`, `--air-ink`, ...), and components take an `element` prop instead of raw hex. No raw hex values in components. |
| Components | `components/ui/`: `Card`, `Button`, `Chip` (type / room / tier), `Avatar` (initials + element), `Sheet`, `TabBar`, `ListRow`, `SegmentedControl`, `Toast`, `EmptyState`, `FeelingPicker`, `RoomPicker`, `ComingUpStrip`, `MonthCalendar`, `ShoppingList`, `RunPicker`, `RunChecklist`, `PlanVisitSheet`, `SpentMoneySheet`. Radix / Vaul for accessible sheet behavior. |
| Data | `rooms` table (see Architecture §6), `artifacts.room_id` (optional), `house_members.room_id` for the member's bedroom, which drives their color. No per-user avatar config. |
| Animation | CSS transitions + Framer Motion for sheets and list reordering only |
| Safe areas | `env(safe-area-inset-*)` on the tab bar, "+" button, and sheets. `viewport-fit=cover`. |
| Performance | Home interactive in < 2s on a mid-range iPhone over 4G. No web font on iOS. |
| Accessibility | WCAG AA (verified above), emoji have text labels, avatars have labels ("Maya, Fire room"), no color-only meaning (element icons + tier words), a VoiceOver pass per milestone |
| Visual QA | Playwright screenshots at 375pt and 430pt widths, light + dark |

---

## 10. Open questions

| # | Question | Recommendation |
|---|---|---|
| F1 | Bedrooms and room names | **Decided (owner):** Air/Fire/Water/Earth = bedrooms. Craft room shared. Bathrooms 1–3. Fitness space. |
| F2 | Feeling badge on avatars? | **Decided (owner):** No. Feelings live only on items. |
| F3 | Tappable colored-block floor plan instead of a room list? | Phase 2 |

Decided in this revision **(owner)**: no custom art or characters, no reward loop, a color-led design.
