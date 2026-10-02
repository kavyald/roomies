# Roomies — Frontend & Visual Design Guidance

**Status:** v1 scope (2026-09-28): needs, chores, tasks, polls, runs
**Companions:** [PRD.md](./PRD.md) · [ARCHITECTURE.md](./ARCHITECTURE.md) (§8 covers frontend code structure) · [mockup v1](./archive/mockup-v1.html) (original clickable prototype, open in a browser)

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

Item types (need, chore, task), polls, runs, and states like *Handled by* do **not** get their own colors. They're shown with an **icon + label** on a neutral chip. Giving types, people, and tiers each their own color would make the screen noisy, and color would stop meaning anything.

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

| Concept / state | Icon | Label on chip |
|---|---|---|
| Need | `shopping-bag` | Need |
| Chore | `sparkles` | Chore (on Home; the rhythm, "As needed" or "About every 7 days", is plain text on the Chores tab and under the detail's title) |
| Task | `check-circle` | Task |
| Task handled by a contact | `phone` | "Handled by: Super" |
| Poll | `bar-chart-3` | "Poll · 2/4 voted" |
| Run | `shopping-cart` (grocery/order) · `calendar` (visit/event) | "Kavya's run" / "Super visit" |
| On a run (badge) | same as the run | "On Kavya's run · Sat" |
| Cost | `receipt` | "$189 · Wren paid" |
| Date | `calendar` | "Thu 10:00" / "Needed by Fri" |

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

- Rooms can be renamed and reordered in House → Rooms.

**[DECIDED] (owner)** Air, Fire, Water, and Earth are the four bedrooms, one per roommate. The craft room is shared. The baths are Bathroom 1 and 2 (upstairs, full) and Bathroom 3 (downstairs, half). The space with the garden door is the Fitness space.

### 4.2 People: element-colored avatars

**[DECIDED] (owner: keep it simple)** Each person is a **colored circle with their initials**. There are no characters and no customization.

- A person's color is the **element of their bedroom**. Whoever lives in Air is yellow, in Fire red-orange, in Water blue, in Earth green. Their avatar also has a tiny element icon badge.
- That makes one consistent visual idea: **your color is your room.** On a card, a green avatar means an Earth person, and a green room chip means Earth's room.
- Anyone without an elemental bedroom (a future roommate, a guest room) gets the neutral color until they pick an element.
- Sizes: 20px (inline), 32px (list rows), 48px (detail and feelings sheet), 64px (members list).

### 4.3 Feelings belong to items, not people

**[DECIDED] (owner)** A feeling is about an **item** (a need, chore, or task), never about a person as a whole. So:

- Avatars never show feelings. There's no badge, no mood, and no "how is Maya doing" summary anywhere.
- Feelings appear only on the item: an emoji count on the card ("😰 1") and the full list (who + note) in the item's detail view.
- A person's avatar next to a feeling just shows who shared it, the same way it shows who's assigned.

---

## 5. Key screens

Tabs: **Home · Needs · Chores · Tasks · House**. The calendar opens from Home.

### 5.1 Home

```
┌───────────────────────────────┐
│ Home                    (KD)  │  ← your avatar → personal settings
│ Coming up              All ›  │  ← next 7 days: dated tasks, needs, runs
│ [Thu 10:00 Super visit]       │
│ [Sat Wren's grocery run]      │
│ Open polls                    │  ← "Which vacuum? · 2/4 voted"
│ Runs in progress              │  ← "Wren's grocery run · 1/3 · Sat"
│ Needs attention    Mine | All │
│ ┌───────────────────────────┐ │
│ │ ●● Top [✓ Task]   😤1     │ │
│ │ Leak under the sink       │ │
│ │ [Kitchen] [📞 Landlord]   │ │
│ │ (K) Due yesterday         │ │
│ └───────────────────────────┘ │
│                          (+)  │
│ [Home][Needs][Chores][Tasks][House]
└───────────────────────────────┘
```

- **Card:** one line with the tier chip (and, on Home only, the category chip) and the feelings ("😤1 🙏2") → title → at most two chips: the room, then "On X's run" or, when it isn't on a run, "Handled by: Landlord" → one meta line (the assignee's avatar + the date, or "Last done 9 days ago · Wren"). On the Chores tab the first line shows the chore's rhythm ("About every 7 days") instead of a category. The card's button is named by the title; the rest is its description.
- **Swipe:** right = done, left = share a feeling.
- A card appears when someone changes the feeling weights ("Maya set 😰 Anxious to +30").

### 5.2 Sharing a feeling (the most important interaction)

Tap **🙂+** on a card or detail, or swipe left:
- "How do you feel about this?" · "Only if it matters to you. The house will see it."
- Six big emoji buttons: Anxious 😰 · Frustrated 😤 · Confused 😕 · Fine 🙂 · Not a big deal 😌 · Thanks 🙏
- An optional note, then **Share with the house**. A toast: "Shared. The house can see how you feel. 💛"
- Tap your own feeling to change or remove it. The old one moves to **Earlier**.

### 5.3 Add sheet (+)

1. Pick one of five tiles: **A need** (something to buy) · **A chore** (ongoing upkeep) · **A task** (one-off) · **A poll** (a question) · **A run** (a batch).
2. Title (autofocused) + **Add**. Optional fields by type:
   - **Need:** needed by, room
   - **Chore:** *As needed* or *About every N days*, room, optional assignee
   - **Task:** date, room, assignee, **Handled by** (a contact)
   - **Poll:** a question, 2+ options (each with an optional note), an optional deadline. It can be started from an item ("+ Poll about this") or on its own.
   - **Run:** the item picker (below)

### 5.4 Item detail

A sheet, simplest first, so the title, the primary action and the meta rows fit on a 375pt screen without scrolling:
- **Header:** the title, with the category under it ("Task", "Chore · About every 7 days", "· Deleted"), and a **…** menu beside Close holding **Edit** and **Delete**. Delete asks first, in place of the primary action: "Delete this? You can undo it right after." · **Keep it** / **Delete**. Deleting closes the sheet with a "Deleted." toast and **Undo** (PRD D30); a deleted item opened from Activity has no menu.
- **The primary action** at the top: **Done** (task) · **Got it** (need) · **Did it** (chore); **Not done after all** once it's done; **Bring it back** when deleted (opened from Activity).
- **Meta rows:** Room · Last done (chores) · When / Needed by · Who's on it · Handled by (tasks) · Ask them · On a run · Done/Got it. Then the note.
- **Tasks: "Handled by"** is always shown. It reads *One of us · Needs outside help?* or *Super · (555) 010-2231 · Copy · Change*, and either link opens **Who's handling it?**: One of us, the contacts, or **+ Someone new** (name + optional phone). On a request or visit it reads *It's on the Landlord request. Move it to change who's handling it.* with **Open the Landlord request** instead, because "Handled by" follows the run (PRD §6.3).
- **How the house feels** stays open (current feelings + notes, **Earlier**, **🙂+ Share a feeling**): it's the core interaction.
- **Tap-to-open sections**, closed by default, each a row with a short summary: **Why is this here?** (the tier; open, the score breakdown) · **Polls** (how many; open, the polls and **+ Poll about this**) · **Costs** (the total, "$42.00"; open, each cost with Open Splitwise and **Add cost**: amount, who paid) · **History** (how many steps; open, the item's path through runs). Each section is a named region, and its row says whether it's open, so they work with VoiceOver.

### 5.5 Needs tab

- The shared list. Needs with a feeling come first (by priority), then newest. Each row has a check circle (**Got it**), the title, an optional note, its feeling emoji, and badges ("On Wren's run", "Poll", "$189"). There's no Soon toggle: a 😰 or 😤 feeling is how someone says "we need this soon."
- An add field at the top: "We need…". Adding something already on the list points to the existing one.
- **Start a run**: a sheet with a checklist of open needs (*Select all* / *Clear*; needs with a feeling show their emoji and are listed first), an optional title ("Amazon order"), and an optional date → **Start run**.

### 5.6 Chores tab

- Chore cards sorted by how overdue they are against their rhythm (as-needed chores last), each with "Last done 9 days ago · Wren" and a one-tap **Did it**. Its toast (here, on Home, and in the detail sheet) offers **Undo**, which puts the chore back to its last done before; if someone has done it again since, it says "It's been done again since. Nothing to undo."

### 5.7 Tasks tab

- **Requests & visits** at the top. Unsent lists come first ("Landlord request · not sent yet · 2 tasks"), then sent requests ("Sent 2 days ago by text · waiting on 3"), then visits ("Landlord visit · Thu 10:00 · 2 to look at").
- Filters: *Mine / All / Outside help*.
- **+ New** (in the Requests & visits header, which replaces the old Plan a visit button) opens **New request or visit**:
  - **Ask someone (request):** a contact (or + Someone new) → a checklist of open tasks, with that contact's pre-checked (optional, since it can start empty) → **Start list**. It opens the request, ready for *Add more* or *Send request*.
  - **They've agreed (visit):** a contact → tasks → an optional date → **Plan visit**.
- The section always shows, with an empty state ("No requests yet. Start one when something needs the landlord or super.").
- A task with a contact but no run shows **"Add to {Contact} list"** on its detail.

### 5.8 Poll sheet

- The question, and what it's about (a link to the item) if anything.
- Options as big rows with vote counts and voter avatars. Tap to vote, tap another to change, tap yours again to take your vote back (a hint says so once you've voted).
- **Add an option** (label + optional note) is at the bottom while the poll is open. Each option shows who added it, and people who already voted can switch.
- "2 of 4 voted · closes Fri." While it's open, a deadline row ("Closes Fri" · **Change**, or "No deadline" · **Add a deadline**) opens a date field with **Save**, **No deadline** and **Cancel**.
- **Close poll** shows the result: "Dyson V8 wins (3–1)," or **"It's a tie. Talk it out?"** A closed poll has **Reopen poll** instead.

### 5.9 Run sheet (batch, request, visit)

- **Header:** point person or runner, the contact (for requests and visits), and the date (a visit shows *Change / Set a date*). While the run is going, *Change* hands it to another roommate and *Rename* edits its name (empty, or *Use "Kavya's run"*, goes back to the usual name).
- **Request stage line:** "Gathering: not sent yet" or "Sent 2 days ago by text · no reply recorded yet."
- **Rows:** every item that's been on the run. Pending ones have a **selection checkbox**, and resolved ones show where they went ("Moved → Landlord visit", "Back in the pool · that one's on us", "✓ Fixed").
- **Selection actions** (a row of buttons that apply to the selected items; *Select all* first):
  - **Move to a visit…** (primary on requests) / **Move to…** (other kinds): pick an open run or a **new visit** with the same contact (optional date), plus an optional note. Requests and visits only accept tasks, so a selection that includes needs or chores only offers batches.
  - **Back to the pool…**: a note, and "Change *Handled by* to One of us" (checked by default for requests and visits)
  - **Hand to…**: another contact or **+ Someone new**, plus an optional note. The items join that contact's unsent list.
  - **Done** / **Fixed**
- **Request buttons:** *Add more* and **Send request** while gathering. Send opens the composed message with **Copy message**, a "Sent by" picker, and **Mark as sent**.
- **Batch and visit button:** **Finish** (anything left goes back to the pool). Batches then ask "Did you spend money?"
- A footnote on requests: "Recording their reply is just moving tasks." 

### 5.10 Calendar

- A month grid with dots on days that have something, and the selected day's list below: dated tasks, needs with a needed-by date, and runs. Tap one to open it.

### 5.11 House tab

- **Settings → Feeling weights**: six rows (emoji, name, a −/+ stepper from −20 to +40 in steps of 5), **Reset to defaults**, **Save for the house**. "One setting for the whole house. Anyone can change it."
- **Spent this month**: total and your share.
- **Rooms** grouped by floor. Tap one to rename it or move it up or down.
- **Contacts** with Copy number. **Roommates**. **Invite link** (admins).
- **Activity**: everything that happened in the house, newest first, one line per action (a bulk move is one line), under day headings ("Today", "Yesterday", "Mon, Sep 28"). Each line has the person's avatar, the sentence ("Kavya felt 😰 about Lemons"), and a topic icon and word with the time. A filter row (All · Items · Polls & runs · Money · House) narrows it, and **Show earlier** loads older history. A line about an item, run or poll opens its sheet in place.

### 5.12 Join, sign-in, empty states

- Join page: "Sam invited you to the apartment 🏠" → name + email → 6-digit code (six big boxes, `autocomplete="one-time-code"`) → **"Which room is yours?"** (pick from bedrooms, which sets your element color) → Add to Home Screen guide.
- Empty states are text + an icon in a soft neutral circle + one button. For example, Chores all done: "Nothing to do. Enjoy the quiet." Nothing on the calendar: "Nothing coming up. Quiet week." Needs empty: "Nothing to buy. Nice."

---

## 6. Delight (kept small)

- **Finishing something** (Got it, Done, Did it): a burst of 10 small dots, in plum and the four element inks, flies out in an upward half-ring just above the toast and fades in about 650ms. It's decorative and hidden from screen readers.
- Everything respects `prefers-reduced-motion`: transitions and animations become instant, and the burst doesn't show at all.
- **[DECIDED] (owner)** No unlockable decorations or reward loop.

---

## 7. Voice & copy

**The voice:** a warm, slightly funny housemate who's good at remembering things. Casual, kind, short, with at most one emoji per string.

| Situation | ✅ Write | ❌ Not |
|---|---|---|
| Overdue chore or task | "This one's been waiting a couple days" | "OVERDUE" · "You missed this" |
| Due today | "Today's the day" | "DUE" |
| Planning a visit | "Who's coming?" | "Create external request" |
| Someone shares 😰 | "Maya felt 😰 about Radiator clanking" | "Maya's feeling anxious about Radiator clanking" · "Maya flagged Radiator" |
| Push: assigned | "You're on trash this week 🗑️" | "New assignment" |
| Poll tie | "It's a tie (1–1). Talk it out?" | "Vote failed" |
| Network error | "Couldn't reach the house. Check your connection and try again." | "Error 500" |
| Invite expired | "This invite has expired. Ask a roommate for a fresh link." | "Invalid token" |
| Delete confirm | "Delete this? You can undo it right after." | "Are you sure?" · "Archive this? You can bring it back for 30 days." |

Rules:
- Use people's names in copy, never their room name. The element shows up in the avatar color, not the words.
- Describe the *item's* state, never a person's failure.
- Sentence case. Plain numbers ("$62.40 · due Oct 3").
- **[DECIDED] (owner)** Feelings always show as their emoji, never as a word in a sentence ("felt 😰", not "feeling anxious"). The emoji is the feeling everywhere: chips, the feeling picker, the activity log.

---

## 8. Motion

| Token | Value | Use |
|---|---|---|
| `--ease-spring` | `cubic-bezier(.34,1.56,.64,1)` | Press release, checkbox fill |
| `--ease-out` | `cubic-bezier(.22,1,.36,1)` | Sheets, transitions |
| `--dur-fast` | 120ms | Press states |
| `--dur-base` | 240ms | Sheets, toggles |
| `--dur-slow` | 480ms | Longer transitions (the completion burst runs its own 650ms) |

Press: `scale(.96)` and the sticker edge collapses. Sheets are drag-to-dismiss. Reduced motion makes transitions and animations instant.

---

## 9. Implementation guidance

| Concern | Decision |
|---|---|
| Tokens | CSS variables in `app/globals.css` for `:root`, `[data-theme=dark]`, and `@media (prefers-color-scheme: dark)`, exposed to Tailwind v4 via `@theme`. Element colors are tokens (`--air-fill`, `--air-ink`, ...), and components take an `element` prop instead of raw hex. No raw hex values in components. |
| Components | The kit in `components/ui/`: `Card`, `Button`, `Chip` (plus `RoomChip` and `TierChip`), `Avatar` (initials + element), `Sheet` (with an `actions` slot beside Close), `OverflowMenu` (the **…** menu), `Disclosure` + `DisclosureGroup` (tap-to-open sections), `TabBar`, `ListRow`, `SegmentedControl`, `Toast` (and the completion burst), `EmptyState`; see it at `/dev/kit` in light and dark. Feature components live in their own folders (`components/items`, `polls`, `runs`, `costs`, `calendar`, `home`, `needs`, `chores`, `tasks`, `house`, `activity`, …). Sheets use Vaul (which brings its own Radix Dialog for the focus trap and labels); the app doesn't use Radix directly. |
| Data | `rooms` table (see Architecture §6), `items.room_id` (optional), `house_members.room_id` for the member's bedroom, which drives their color. No per-user avatar config. |
| Animation | CSS transitions and keyframes only (Vaul animates the sheets). No Framer Motion. |
| Safe areas | `env(safe-area-inset-*)` on the tab bar, "+" button, and sheets. `viewport-fit=cover`. |
| Performance | Home interactive in < 2s on a mid-range iPhone over 4G. No web font on iOS. |
| Accessibility | WCAG AA (verified above), emoji have text labels, avatars have labels ("Maya, Fire room"), no color-only meaning (element icons + tier words), a VoiceOver pass per milestone |
| Visual QA | axe on every screen in light and dark on the iPhone 15 profile (`e2e/m4-a11y.spec.ts`), plus the by-eye check at 375pt in light and dark from each task's definition of done. No screenshot comparisons. |

---

## 10. Open questions

| # | Question | Recommendation |
|---|---|---|
| F1 | Bedrooms and room names | **Decided (owner):** Air/Fire/Water/Earth = bedrooms. Craft room shared. Bathrooms 1–3. Fitness space. |
| F2 | Feeling badge on avatars? | **Decided (owner):** No. Feelings live only on items. |
| F3 | Tappable colored-block floor plan instead of a room list? | Phase 2 |

Decided in this revision **(owner)**: no custom art or characters, no reward loop, a color-led design.
