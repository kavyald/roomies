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
| **Urgent** tier chip | `#EBD3E6` | `#6A2F5E` | 6.9:1 |
| **Soon** tier chip | `--card` with a 1.5px plum outline | `#6A3460` | 9.1:1 |
| Normal, Low | no chip (T108) | | |
| Tab dot (something Urgent on that tab) | `--accent` with a `--paper` ring | | |

Tier chips always carry the word ("Urgent", "Soon"). Color is never the only signal: the tab dot's link also says ", something urgent" to VoiceOver. The Urgent chip uses a **●● double dot** marker instead of the 🔥 emoji used in earlier drafts, so it can't be confused with the Fire room. (Before T108 the tiers read Top / High / Normal / Low, each with a chip.)

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
| Chore | `sparkles` | Chore (the Chores tab; its kind, "Deep clean" or "Upkeep", is plain text under the detail's title) |
| Task | `check-circle` | Task |
| Task handled by a contact | `phone` | "Handled by: Super" |
| Poll | `bar-chart-3` | "Poll · 2/4 voted" |
| Run | `shopping-cart` (grocery/order) · `calendar` (visit/event) | "Kavya's run" / "Super visit" |
| On a run (badge) | same as the run | "On Kavya's run · Sat" |
| Cost | `receipt` | "$189 · Wren paid" |
| Date | `calendar` | "Thu 10:00" / "Needed by Fri" |

Element icons (for room chips and the small element icon on avatars): Air `wind`, Fire `flame`, Water `droplet`, Earth `sprout`.

**Chore and routine icons (T96, T101).** Lucide outlines from a curated list of about 100 (`lib/domain/icons.ts`), each with a group and the words a chore name might use for it, shown with `ChoreIcon` and picked with `ChoreIconPicker`. The picker shows **Suggested** icons from the name ("Swiffer" → mop), a search by word, and **All icons** under group headings (open when the name suggests nothing). Until someone picks one, the top suggestion is chosen and saved. Sweeping is a broom, never wind (Air's icon); feelings stay emoji.

**Icon buttons (T68).** Where an icon is obvious, the button is the icon (`IconButton`, a 44pt target): edit and rename are always `pencil`, beside the thing it edits (a run's one editor, its name and who's on it, and an item's Edit sit in the sheet header; who's doing a task, a visit's date and a poll's deadline sit on their line); delete or remove is `trash-2` (it still asks first; an item's Delete and a routine's Remove are a quiet trash link at the bottom of their sheet, apart from Edit and Save, T111); copy a number is `copy`; Select all is one `list-checks` toggle (`aria-pressed`, accent while everything's checked; tapping it then clears them). A row that is itself the edit button (a room, a contact) ends with the same pencil as a mark, not a second control. A cost's **Splitwise icon** (T89, `components/costs/SplitwiseButton`) is the Splitwise mark in the same 44pt target, named "Add $42.50 to Splitwise"; once anyone has sent that cost it sits in a green circle with a check and is named "Added to Splitwise. Add $42.50 again" (still tappable). The mark itself (`SplitwiseMark`) is a stand-in, a split glyph on Splitwise green, until Splitwise's own icon can be used. Edit and Delete are never only behind a **…** menu; the kit has no such menu now. Words stay for primary actions (**Done** / **Got it** / **Did it**, **Finish**, **Send request**), for anything an icon would leave ambiguous (**I'll do it**, **Set a date**, **Add a deadline**, **Move some, or put them back**, **Share link** / **Copy link**, **Copy message**), and for the small **Save** / **Cancel** of inline editors.

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

- Rooms can be renamed and reordered in House → Rooms (one row that opens a sheet), where they're listed as plain names grouped by type, not floor: **Bedrooms** (bedroom), **Bathrooms** (bath), **Spaces** (common, entry, utility, outdoor). The item room picker uses the same three groups. Rooms aren't added or archived from the app; the seeded 17 are the house.

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

Tabs: **House · Needs · Tasks · Chores** (T107, PRD D43; before it, M7's Home · Needs · Tasks · Chores · Admin, T67). House is `/h/[houseId]` and is where the app opens; the old `/house` and `/admin` links redirect there. Every tab's header (House, Needs, Tasks, Chores) has **your avatar** at the top right, the same spot each time, opening **You** (T109). Calendar, Activity and You have a **‹ House** link back; so do House's own pages (Roommates and invites, Contacts, Routines). The **+** shows only on Needs, Tasks and Chores. Needs, Tasks and Chores carry a **dot** when something open on them is Urgent (T108; on Chores, in Upkeep), and the tab's name then says ", something urgent".

### 5.1 House

```
┌───────────────────────────────┐
│ House                   (KD)  │  ← your avatar → You (on every tab, T109)
│ Polls             [+ New poll]│  ← open first: "Which vacuum? · 2/4 voted",
│                               │     then the last 5 closed: "Closed · Dyson wins"
│ [Feeling weights changed]     │  ← only after a change
│ 📅 Calendar · 3 this week   › │
│ 🕘 Activity                 › │
│ PEOPLE                        │
│ Roommates and invites       › │  ← "Roommates" for members
│ Contacts                    › │
│ CHORES                        │
│ Routines                    › │
│ Rooms                         │  ← a sheet
│ MONEY                         │
│ Splitwise                     │  ← a sheet
│ PRIORITY                      │
│ How feelings raise priority   │  ← today's weights; the Feeling weights sheet
│ [House][Needs][Tasks][Chores] │
└───────────────────────────────┘
```

- **What it is** (T107, PRD D43): the house's own page, replacing Home and Admin. No ranked feed: each tab ranks its own kind (T108), and an item's detail says why (**Why it's near the top**, §5.4). No + here. **How feelings raise priority** also opens from that section's link (`/h/[houseId]?priority`), and its sheet starts with the scale: "Items start at 25 out of 100; each feeling adds this much."
- **Top:** **Polls** (open ones first, then the 5 most recent closed ones with their result; a row opens the poll sheet; **New poll** in the heading; "No polls yet. Ask the house when you can't decide." with none), the "feeling weights changed" card ("Maya set 😰 Anxious to +30", dismissable), then **Calendar** (its subtitle counts the next 7 days: "3 this week" / "Nothing this week") and **Activity**, which open their pages.
- **Setup**, each a labelled group of rows (§5.11): **People** (Roommates and invites, Contacts), **Chores** (Routines, Rooms), **Money** (Splitwise), **Priority** ("How feelings raise priority", with today's weights as its subtitle). Rows that open a page end with a chevron; Rooms, Splitwise and Priority open sheets.
- **Nothing personal:** your room, notifications, theme, feedback, sign out and delete my account are on **You** (your avatar, T109).

**Cards** (Needs rows, Tasks, Chores and anywhere items show as cards):

- **Card:** one line with the tier chip (Urgent or Soon only, T108) (and, where kinds mix, the category chip) and the feelings ("😤1 🙏2") → title → chips: "For Kavya" on a personal need (T45), the room (or all of a chore's rooms), then "On X's run" or, when it isn't on a run, "Handled by: Landlord" → one meta line (the assignee's avatar + the date, or "Last done 9 days ago · Wren"). The card's button is named by the title; the rest is its description.
- **Beside the card:** the check circle on the left (**Done** / **Got it** / **Did it** / **Took care of it**, whose toast offers **Undo**; on the left as on Needs since T108) and **🙂+** on the right, which opens the emoji tray under the card (§5.2). Neither sits inside the card's button.
- **Swipe** (cards on Chores and Tasks, and Needs rows): right = finish it (the same as the check circle, with **Undo** in the toast), left = open the emoji tray. Only sideways drags count, so the list still scrolls, and a drag is never a tap. While dragging, the card slides over a strip that says what letting go does ("✓ Done" on the left, "🙂 Feeling" on the right); short of 88px it springs back and nothing happens. The buttons are the non-swipe way for VoiceOver and keyboards, and reduced motion makes the spring back instant.
- **Home's one list (T81) is gone** (T107): each tab ranks itself instead (T108), open batches sit on Needs (§5.5) and visits this week on Tasks (§5.7), dated items reach people through Tasks, Needs and House's Calendar row, and the weights card moved to House.

### 5.2 Sharing a feeling (the most important interaction)

Two taps from any card: **🙂+** (or a swipe left), then an emoji.
- The emoji tray, "How do you feel about this?": six buttons, Anxious 😰 · Frustrated 😤 · Confused 😕 · Fine 🙂 · Not a big deal 😌 · Thanks 🙏 (named by their word for VoiceOver; the detail sheet shows the words too, two rows of three so they fit at 375pt, under "Only if it matters to you. The house will see it, and a strong feeling moves this up the list." (T111)). Escape closes it.
- **Tapping an emoji shares it straight away**; there's no separate Share step. A toast: "Shared. The house can see how you feel. 💛" with **Add a note**, which opens the item on a note box for your feeling (**Save note**). The detail sheet also has **Add a note** / **Edit my note** once you've shared one.
- Your current one shows pressed; **tapping it again removes it** ("Removed your feeling."). Tapping another changes it, and the old one moves to **Earlier**. Adding or editing the note keeps it the same feeling, so that doesn't add to Earlier; the activity line reads "Kavya added a note to 😰 about Lemons".

### 5.3 Add sheet (+)

1. The + (on **Needs, Chores and Tasks** only, T107) opens that kind's form directly. Its **A poll or a run instead?** goes to six tiles: **A need** (something to buy) · **A chore** (ongoing upkeep) · **A task** (one-off) · **A poll** (a question) · **A run** (a shopping trip, T111) · **A request** (or a visit; it opens **New request or visit**, §5.7, T108). Opened from a tab, the form has a *Need · Chore · Task* switch at the top (the title stays); a kind picked on the tiles isn't asked again (T111). A need's **House / Me** toggle is labelled **For**, as on the detail sheet. Polls also start from House's **New poll**, runs from Needs' **Start a run**.
2. Title (autofocused) + the header check (**Add**), the main action, or the quieter **+ Add another** link under the form, which adds it and keeps the sheet open with the title (and note) cleared and the other fields kept, so three needs in a row take one sheet. The toast says where it went, "Added to Needs." (Chores, Tasks), with **Open** (T111). Optional fields by type, behind **More options**:
   - **Need:** needed by, room
   - **Chore:** kind (Deep clean / Upkeep), room (one, T101), icon (nobody is assigned: who's on a chore follows from its room's routine, PRD §6.2). A room's Deep clean chores are quicker from House → Rooms (§5.11), Upkeep from the Chores tab's **+ Add** (§5.6)
   - **Task:** date, room, **Who's doing it** (one select, T111: Any of us, a roommate, or a contact under *Outside help*)
   - **Poll:** a question, 2+ options (each with an optional note), an optional deadline. It can be started from an item ("+ Poll about this") or on its own.
   - **Run:** the item picker (below)

### 5.4 Item detail

A sheet, simplest first, so the title, the primary action and the meta rows fit on a 375pt screen without scrolling:
- **Header:** the title, with the category under it ("Task", "Chore · Upkeep", "· Deleted"), and the **Edit** pencil. **Delete** sits apart, as a quiet trash link at the bottom of the sheet (T111). The **Edit** sheet is the item's form, then the same **Costs** section as below (T104), so costs can be added, edited and removed while editing. Delete asks first, in place of that link: "Delete this? You can undo it right after." · **Keep it** / **Delete**. Deleting closes the sheet with a "Deleted." toast and **Undo** (PRD D30); a deleted item opened from Activity shows neither.
- **The primary action** at the top: **Done** (task) · **Got it** (need) · **Did it** (Deep clean chore) · **Took care of it** (Upkeep chore); **Not done after all** once it's done; **Bring it back** when deleted (opened from Activity).
- **Costs** (T104, owner), always open, right under the primary action once the item has a cost: "Costs" and the total ("$42.00"), each cost with the Splitwise icon, a pencil to **Edit** (amount, who paid, note) and a trash icon to **Remove** ("Remove this cost?"), then **Add cost** (amount, who paid). A named region, so it reads as one block in VoiceOver. With no costs it's just an **Add cost** link near the bottom, above Delete (T111).
- **Meta rows:** Room (Rooms, for a chore that covers several) · Last done (chores) · When / Needed by · Who's doing it (tasks) · Ask them · On a run · Done/Got it. Then the note.
- **Tasks: "Who's doing it"** (T111; "Who's on it" and "Handled by" before) is always shown, one field for what the data keeps as `assignee` and `contactId`. It reads *Any of us* with **I'll do it** (the task is yours in one tap: "It's yours. Thanks! 💛" with **Undo**), a roommate (avatar and name, "You" for you), or *Super · (555) 010-2231* with a copy icon (and "Kavya's arranging it" if a roommate is set too). The pencil ("Change who's doing it") opens **Who's doing it?**: Any of us, each roommate (Me first), the contacts (*Outside help*), or **+ Someone new** (name + optional phone). Picking a roommate clears the contact and picking a contact clears the roommate. On a request or visit it reads *It's on the Landlord request. Move it to change who's doing it.* with **Open the Landlord request** instead, because the contact follows the run (PRD §6.3).
- **How the house feels** stays open (current feelings + notes, **Earlier**, **🙂+ Share a feeling**): it's the core interaction.
- **Tap-to-open sections**, closed by default, each a row with a short summary: **Why it's near the top** (T108; "Why is this here?" before: the Urgent or Soon chip, if any; open, what moved it in words, never points, "Normal priority" · "Kavya is 😤" · "Due Friday", and a **How feelings raise priority** link to House's sheet) · **Polls** (how many; open, the polls and **+ Poll about this**) · **History** (how many steps; open, the item's path through runs). Each section is a named region, and its row says whether it's open, so they work with VoiceOver.

### 5.5 Needs tab

- **Runs in progress** at the top, where runs start (T107; on Home before): every open batch ("Wren's grocery run · 1/3 · Sat"); a row opens the run. Visits moved to Tasks' Coming up (T108).
- The shared list, ranked by priority (PRD §8.1, T108): highest score first, so a feeling moves a need up; equal scores by needed-by date, then newest. Every open need shows. Each row has a check circle (**Got it**, with **Undo** in the toast), the title, an optional note, its feeling emoji, badges (an **Urgent** or **Soon** chip, "On Wren's run", "Poll", "$189"), and **🙂+** at the end, which opens the emoji tray under the row. Rows swipe like cards (§5.1): right = Got it, left = the tray. There's no Soon toggle: a 😰 or 😤 feeling is how someone says "we need this soon."
- An add field at the top: "We need…", with a **House / Me** toggle beside it (remembered on this device; the need form has the same toggle). Adding something already on the list (same title, same owner) points to the existing one.
- A personal need carries a **"For Kavya"** chip here and on run rows. The detail sheet has a **For** row (House / Me, plus the owner's name if it's someone else's) to change it: "Just for you now." / "For the house now."
- **Start a run**: a sheet with a checklist of open needs that aren't on a run yet, **all checked to start** (uncheck what you won't get; one *Select all* icon toggle; in the Needs order, with each one's feeling emoji). An optional title ("Amazon order") and date sit behind **More options** → the header check (**Start run · 3 things**). A usual grocery run (start, get 3 things, finish with $40) is about 6 taps.

### 5.6 Chores tab

Built to fit one iPhone screen in a four-routine house. No numbers and no "due" anywhere on it, and the word "routine" never appears, VoiceOver names included (it's House's word).

- **Top line:** "This week you have the kitchen and dining · through Sunday" (monthly: "This month … · through Nov 30"; on different schedules: "You have the kitchen and garden for now"). Nothing if you hold no routine.
- **On no routine** (T112, someone every routine leaves out, like a newcomer when each routine is always one person; worked out by `onNoRoutine`): a soft box, "You're not looking after any rooms yet." / "An organizer can add you, or take some on yourself. Upkeep below is everyone's meanwhile." with **Who has which rooms**, a link to House → Routines (`/house/routines`). Otherwise the same **Who has which rooms** link sits under the last routine, above Upkeep.
- **Routines, then a box per room (T101, T105):** each routine is a small heading (its outline icon and name), with whose it is under it in words beside the holder's avatar: "Yours this week", "Alex's this month", just "Alex's" for always one person. Yours come first. Every room box is full width, one to a row, so no name breaks and no half box is left over. **Your rooms** are highlighted: the room's name (✨ when all its chores are done, a feeling's emoji), which opens its sheet, then each Deep clean chore as a one-tap tick, **Did it: Vacuum** (an empty circle and the name, so it reads as a tick and not a tag; done in accent with a check, T112). **Housemates' rooms** are outlined: the room's name (and a feeling's emoji) on its own line with a chevron, then its chores in words ("Clean mirror, mop floor, scrub toilet and trash", two lines at most), no ticks and nothing about what's done (PRD §6.2); the whole box opens the room's sheet. VoiceOver: "Kitchen, Alex", with the chores (or "Sink and stove done" on your own) as its description. Rooms with no chores aren't shown; a routine with none says "No chores here yet." **+ Add** sits on your own headings and on any with no chores yet (a housemate's rooms take chores from their sheet, so + Add there doesn't read as yours to fill). It ("Add chores: Kitchen" to VoiceOver) opens **Add chores**: a **Room** select of that routine's rooms, then the same picker as House → Rooms (§5.11); adding closes it. The routine heading is a group, not a landmark, since a routine can share its name with a room.
- **Room sheet:** under the title, holder → next as avatars with the same in words: "Alex has it this week, then you", or "Alex looks after it" for a fixed person (T105). Then the room's Deep clean chores, then **Edit chores** (T112), a toggle (`aria-expanded`) that opens **Add chores**, the same picker as House → Rooms (§5.11), with the header check; the sheet opens on just the checklist, and adding goes back to it. Each row is its icon and name, which opens the detail; **🙂+**; and a tick, **Did it: Vacuum**, a toggle that keeps its name and says its state with `aria-pressed`. Anyone may tick. Ticking toasts with **Undo**, and tapping a ticked chore undoes it; a housemate's tick stays theirs ("A housemate got this one. Only they can undo it."). Undo puts the chore back to its last done before; if someone has done it again since, it says "It's been done again since. Nothing to undo." Tapping the toast doesn't close a sheet.
- **Upkeep**, below the routines and never inside one, so it doesn't read as the holder's job. It also holds chores nobody's on, ranked by priority (T108). Chores with a feeling or an Urgent or Soon score are rows, highest first (icon, name, the Urgent or Soon chip, rooms, each emoji with the avatar of who shared it, and **Took care of it**, with **Undo**; the row opens the detail), or **All calm** if there are none. The rest are small icon chips, highest first; tapping one opens the emoji tray, with **See details** beside it. Its own **+ Add** asks for a name, an optional room and an icon (suggested by the name).
- With no routines and no Upkeep, the empty state: "Nothing to do yet. Give each room its chores in House → Rooms." with **Set up rooms**.

### 5.7 Tasks tab

- **Coming up** at the top (T108): visits dated today or in the six days after ("Landlord visit · Thu 10:00 · 2 to look at"); a row opens the visit. Not shown when there are none.
- Filters: *Mine / All / Outside help*, then the tasks, ranked by priority (PRD §8.1): highest score first, equal scores by date, then newest; an **Urgent** or **Soon** chip where it applies. The done circle sits on the left, as on Needs.
- **Requests & visits** under the tasks, only when there are some: unsent lists first ("Landlord request · not sent yet · 2 tasks"), then sent requests ("Sent 2 days ago by text · waiting on 3"), then later or undated visits.
- **One add button**, the + (T108; "+ New" and the empty state's "Add a task" are gone). Its **A request** tile (§5.3) opens **New request or visit**, which starts with who it's for: "For someone outside the house, like the landlord, a plumber or the super." (T111). The line under the switch explains the choice:
  - **Ask someone (request):** "you haven't asked yet. Gather what to ask, then send it as one message. It can start empty." A contact (or + Someone new) → a checklist of open tasks, with that contact's pre-checked (optional, since it can start empty; changing the contact keeps every tick and adds the new contact's tasks, T87) → the header check (**Start list**). It opens the request, ready for *Add more* or *Send request*.
  - **They've agreed (visit):** "they're coming to do these. Plan the visit; the date can wait." A contact → tasks → an optional date → the header check (**Plan visit**).
- With nothing open neither section shows, and there's no empty state for them (T82); a request also starts from "Add to {Contact} list" on a task.
- A task with a contact but no run shows **"Add to {Contact} list"** on its detail.

### 5.8 Poll sheet

- The question, and what it's about (a link to the item) if anything.
- Options as big rows with vote counts and voter avatars. Tap to vote, tap another to change, tap yours again to take your vote back. A hint under them says "Tap an option to vote." before your first vote (T111), and how to take it back once you've voted.
- **Add an option** (label + optional note) is at the bottom while the poll is open. Each option shows who added it, and people who already voted can switch.
- "2 of 4 voted · closes Fri." While it's open, a deadline row ("Closes Fri" · the pencil, or "No deadline" · **Add a deadline**) opens a date field with **Save**, **No deadline** and **Cancel**.
- **End voting** (T111; "Close poll" before) shows the result: "Dyson V8 wins (3–1)," or **"It's a tie. Talk it out?"** A closed poll has **Reopen poll** instead.

### 5.9 Run sheet (batch, request, visit)

- **Header:** point person or runner, the contact (for requests and visits), and the date (a visit shows the pencil, or *Set a date*). While the run is going, the header's one pencil (**Edit this run**, T111; two identical pencils before) opens an editor with its **Name** (empty, or *Use "Kavya's run"*, goes back to the usual name) and **Who's on it?** (a visit's or request's **Point person**), then **Save** / **Cancel**.
- **Request stage line:** "Gathering: not sent yet" or "Sent 2 days ago by text · no reply recorded yet."
- **Rows:** every item that's been on the run, and resolved ones show where they went ("Moved → Landlord visit", "Back in the pool · that one's on us", "✓ Fixed").
  - **Batches:** tapping a row marks it done right away (no select-then-Done). A done row stays checked and struck through ("✓ Done · tap to put it back"); tapping it again reopens the item and puts it back on the run, so a mis-tap is one more tap. **Move some, or put them back** (T111) switches the rows to selection checkboxes for the actions below (*Cancel* switches back).
  - **Requests and visits:** pending rows have a **selection checkbox**, since their actions are moves.
- **Selection actions** (a row of buttons that apply to the selected items; the *Select all* icon toggle first):
  - **Move to a visit…** (primary on requests) / **Move to…** (other kinds): pick an open run or a **new visit** with the same contact (optional date), plus an optional note. Requests and visits only accept tasks, so a selection that includes needs or chores only offers batches.
  - **Back to the pool…**: a note, and "Any of us does it from now on" (clears the contact; checked by default for requests and visits)
  - **Hand to…**: another contact or **+ Someone new**, plus an optional note. The items join that contact's unsent list.
  - **Done** / **Fixed**
- **Request buttons:** *Add more* and **Send request** while gathering. Send opens the composed message with **Copy message**, a "Sent by" picker, and **Mark as sent**.
- **Batch and visit button:** **Finish** (anything left goes back to the pool). A batch has an optional **Spent** amount beside it: empty finishes with no cost; an amount records one cost on the run, paid by you (*Who paid* appears once there's an amount, to change it). The toast says "Finished. $40.00 noted." with the Splitwise icon (a toast action can be an icon, named by its label).
- **Spent · $42.50:** the run's costs, once it has any, each with the Splitwise icon and the same Edit / Remove icons as an item's Costs.
- A footnote on requests: "Recording their reply is just moving tasks." 

### 5.10 Calendar

- From House's **Calendar** row (with **‹ House** back). A month grid with dots on days that have something, and the selected day's list below: dated tasks, needs with a needed-by date, and runs. Tap one to open it.
- It opens on today's month with today selected and ringed, in the house's time zone (T106); until you pick a day or another month, both follow today.

### 5.11 House's setup

- **Order** (T107, owner; T67's Admin order is superseded): under House's top (§5.1), four labelled groups: **People** (**Roommates and invites**, a page with the roommates and, for organizers, **Invite a roommate**; **Contacts**, a page), **Chores** (**Routines**, a page; **Rooms**, a sheet), **Money** (**Splitwise**, a sheet) and **Priority** (**How feelings raise priority**, the Feeling weights sheet). No Notifications row: notifications live only on You (`/me`, from your avatar), as do your room, feedback, **Sign out** and **Delete my account** (T109). The header's right side holds only your avatar.
- **Feedback** (T91, PRD §6.8): the row **Send a bug, idea or praise** on You (T109; an unlabelled icon on House before) opens the **Feedback** sheet: **Bug 🐞 · Idea 💡 · Praise 💛** as one segmented control (Idea to start), a **Message** box whose placeholder follows the kind ("What went wrong?" / "What would make this better?" / "What's working for you?"), and the header check **Send**, which stays off until there's a message. Sent, it closes with "Thanks for telling us!"; if it fails, the text stays.
- **Routines** (T98, PRD §6.2; the only screen that says "routine"): open to every member. Each row is the routine's icon, its name, how often it resets, and the avatars of who has it now → who's next (just the one avatar for always one person, or when nobody else is next); no names in text. **Add a routine** sits under the list. With none yet: "No routines yet. Group rooms someone looks after, and it rotates." The sheet has **Name**, **Icon** (the shared picker, sparkles to start), **Resets** (Weekly · Every 2 weeks · Monthly, Weekly to start), **Who** (Takes turns · Always one person), then the person: "Who has it this week" (these two weeks / this month), you to start, or "Who looks after it"; last, the rooms to tick by group. A room in another routine says "In Downstairs", and "Moves here from Downstairs" once ticked. **Someone left out** (T112, organizers only): above the list, a line with their avatars, "Sam isn't on a routine yet. Give them one, or make one take turns." It's worked out from members and routines (`onNoRoutine`: only when every routine is always one person and none is theirs), so it shows from the moment they join until they're on one; no notification (owner). The header check adds or saves, sending only what changed. **Remove this routine**, a quiet trash link at the bottom of the sheet, apart from the check (T111), asks first: "Remove this routine? Its rooms' chores move to the Upkeep section, with no owner. Nothing is deleted." (**Keep it** / **Remove**). Activity calls each by its name, one line per save ("Kavya changed Upstairs").
- **Splitwise** (T89): a row with the Splitwise mark, "Costs open your group" or "Add your group's link", and the pencil. Its sheet, **Splitwise group** ("Each cost's Splitwise icon opens this group. Anyone can change it."), has **Group link** (a link pasted from the address bar or the app, with or without https://), a hint on where to find it, the header check, and **Remove the link** once one is set. A link that isn't a group says "That isn't a Splitwise group link. Open the group in Splitwise and copy the link." under the field. Saved: "Saved. Costs open your Splitwise group."
- **Feeling weights** (the Priority row, "How feelings raise priority", whose subtitle shows today's weights): six rows (emoji, name, a −/+ stepper from −20 to +40 in steps of 5), **Reset to defaults**, and the header check saves for the house ("Saved. Priorities change for everyone."). "One setting for the whole house. Anyone can change it."
- **Rooms**: one row in the Chores group (T66) that opens a sheet listing the rooms as plain names, no icons, under three headings: **Bedrooms**, **Bathrooms** and **Spaces**. VoiceOver reads each name and kind ("Fire, bedroom"). A room without chores says "No chores yet". Tap one for **its own sheet** (T101): **Rename or move** opens **Name** with **Save** / **Cancel**, and **Move earlier** / **Move later** within its group (the order is `sort_order`); **Deep clean** lists its chores, each with **Remove** (deleted, with Undo), and says whose routine looks after them (or that the room isn't in one, so they show in Upkeep); **Add chores** offers every chore name in the house, most-used first, then starters (Vacuum, Swiffer, Dust…), as toggle chips, plus **New chore** (a name and the icon picker). **Search chores** above them narrows the chips by any part of a name, whatever the case (picked ones stay in view); with no match it says "No chore by that name yet. Tap New chore to add it." and New chore starts with the search as its name. Pick several, then the header check **Add**: the room gets its own copy of each, as Deep clean, in one action. Names it already has aren't offered.
- **Contacts**, each row ending with the pencil (tap to edit) and a copy icon for the number. **Roommates**: each row is the person and their room, with no role label (owner, 2026-11-10); your own row opens a sheet titled **You** with **I moved out** (and the organizer toggle for organizers); your room is picked on **You** (`/me`, T109), not here. Only you change your room. **Invite link** (organizers), on the Roommates page. **Activity** opens the house log (`/activity`, below).
- **You** (`/me`, from your avatar on any tab, with **‹ House** back; T109: everything that's yours, House holds only shared things): your avatar and name; **Your room**, the bedroom picker (T93), where a tap picks, changes or clears your bedroom on the spot ("Your room is Fire now." / "No bedroom for now."); two separate rows, **Notifications** and **Appearance** (showing the current theme), each opening its own page with a "‹ You" link back (T65); **Send a bug, idea or praise**, a labelled row opening the Feedback sheet (above); **Sign out** and **Delete my account** at the bottom (T107). No notification or theme setting sits on `/me` itself, so the theme never reads as a notification setting.
- **Notifications** (`/me/notifications`): one section that fits on a 375pt screen, as a single card. First this device's status line with its one button ("Turn on notifications" when it's off; otherwise a line saying it's on, blocked in the browser, or that Roomies needs adding to the Home Screen first). It says on only when the server has this device for you too, so after someone else used the phone it offers the button again (T84). **Sign out** also turns notifications off on this device, so the next person doesn't get yours. Then the six categories as compact switch rows, each a short name (Handed to me, Coming due, Feelings on my things, Polls, Runs, People) with a one-line "you get this when…" under it; VoiceOver reads the name and the line as its description. Last, quiet hours as one row, "Quiet 10pm–8am": tap it to edit From / Until inline, with an on/off switch beside it (never inside it).
- **Appearance** (`/me/appearance`): the theme as one segmented control, **Auto · Light · Dark**, saved to your profile settings and applied at once; a line under it says Auto follows your phone.
- **Activity**: everything that happened in the house, newest first, one line per action (a bulk move is one line), under day headings ("Today", "Yesterday", "Mon, Sep 28"). Each line has the person's avatar, the sentence ("Kavya felt 😰 about Lemons"), and a topic icon and word with the time. A filter row (All · Items · Polls & runs · Money · House) narrows it, and **Show earlier** loads older history. A line about an item, run or poll opens its sheet in place.

### 5.12 Join, sign-in, empty states

- Sign-in: "Sign in to Roomies 🏠" (T111; "Welcome back" before, which read wrong on a first visit), the same line as the join page ("Needs, chores, and tasks for the house, all in one place."), then "We'll email you a code. No password needed." → email → code, with **Use a different email** and **Send a new code** under it.
- Join page: "Sam invited you to the apartment 🏠" → name + email → 6-digit code (six big boxes, `autocomplete="one-time-code"`; **Use a different email** and **Send a new code**, as on sign-in, T111) → **"Which room is yours?"** (pick from bedrooms, which sets your element color; nothing is picked to start and **Join the house** stays off until a room or **None of these** is, T111) → onboarding.
- **Onboarding** (`/h/[houseId]/welcome`, `components/onboarding/Onboarding`, T110, PRD D41): where joining and setup land, with no tab bar, +, or sheets. Two full-screen steps, each a big title (focused when it appears) and a line under it:
  1. **"Welcome to <house> 👋"**, "Everything the house shares, in four tabs.", and a row each (tab icon, name, one line) for Needs, Tasks, Chores and House (polls, the calendar, activity). **Next**.
  2. Notifications, by device (`onboardingPushStep` in `lib/client/install.ts`): "Turn on notifications?" with the sheet's line, **Not now** · **Turn on**; Not now toasts "No problem. You can turn them on later from You → Notifications." On iPhone Safari not installed, the Add to Home Screen guide's title, line and steps, "Opened from there, Roomies asks about notifications." and **Continue** (it snoozes the guide on House, and leaves the question for the first open from the Home Screen). Blocked: "Notifications are blocked" with `NotificationSteps` inline and **Skip for now**. A browser that can't: "No notifications on this browser", one line, **Continue**. Already on: Next goes straight to House.
  Any answer except the iPhone guide is remembered as the sheet's (`roomies.pushPromptDone`), then House.
- **Notifications sheet** (`NotificationsPrompt`, T95, PRD D41): for members who never answered on this device, the first open where push is off. "Turn on notifications?" with "A ping when something is yours, a poll needs your vote, or someone joins. You pick which ones in your settings.", then **Not now** · **Turn on** (primary, right). Only the question: a blocked or unsupported device gets no sheet on open (T110), so nobody's first screen is a problem. Blocked, Me → Notifications shows numbered steps for this device (`NotificationSteps`: the iPhone Settings app, Android, Chrome/Edge, Safari on a Mac, Firefox, or a general fallback; `allowSteps` in `lib/client/install.ts`); a browser that can't, what to do instead (Safari and the Home Screen on iPhone, another browser elsewhere). The steps end with "Come back to Roomies. Notifications turn on by themselves.": a device that allows Roomies but isn't connected connects itself when the app opens (`settlePush`, PRD D42) and toasts "Notifications are on. 🔔"; **Turn on** is only for the browser's first permission question. Shown once per device (`roomies.pushPromptDone`, in `lib/client/device-memory.ts`); never over the Add to Home Screen guide.
- **Invite link** (organizers, Roommates): "Share this in the group chat. It works for 7 days, for up to 4 people: one for each free bedroom, so a forwarded link can't fill the house." with **Share link** (the phone's share sheet, `navigator.share`) where there is one, **Copy link** elsewhere (T111).
- Setup page (`/setup/<token>`, the owner, once): your name + email → code → the house (name, address, unit) with **"Which room is yours?"** under it: the four bedrooms and **Not yet** (T93) → onboarding.
- **"Which room is yours?"** is one picker everywhere (`BedroomPicker`, T93): each bedroom in its element color, a taken one showing whose it is (and not pickable), and a last choice, **None of these** when joining, **Not yet** at setup and on You. The picked choice, that last one included, shows a check and the accent ring (T111).
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
| Someone saved or moved it first | "Someone just changed this. Here's the latest." | "Conflict: version mismatch" |
| Invite expired | "This invite has expired. Ask a roommate for a fresh link." | "Invalid token" |
| Whose turn it is (Chores tab) | "This week you have the kitchen and dining · through Sunday" | "Your routine" · "3 of 5 done" · "Due Sunday" |
| Upkeep with nothing piling up | "All calm" | "No overdue chores" |
| Someone clears a pile | "Took care of it" · "Taken care of. Thanks! 💛" | "Completed" |
| Delete confirm | "Delete this? You can undo it right after." | "Are you sure?" · "Archive this? You can bring it back for 30 days." |
| After adding something (T111) | "Added to Needs." · **Open** | "Added." |
| Who does a task (T111) | "Who's doing it: Any of us" · **I'll do it** | "Who's on it: Anyone" beside "Handled by: One of us" |
| Ending a poll (T111) | **End voting** | "Close poll" |
| Signing in (T111) | "Sign in to Roomies 🏠" | "Welcome back" (to someone who's never been) |
| A run, on the + tiles (T111) | "A shopping trip" | "A batch" |
| The role that manages invites (PRD D40) | "Maya is an organizer now." · "Only organizers can do that." | "Maya is an admin now." · "Admins only" |

Rules:
- Use people's names in copy, never their room name. The element shows up in the avatar color, not the words.
- Describe the *item's* state, never a person's failure.
- Sentence case. Plain numbers ("$62.40 · due Oct 3").
- An icon-only button is named by what it does ("Save", "Add", "Edit", "Rename this run", "Copy Super's number"; a toggle keeps one name, "Select all", and says its state with `aria-pressed`); a sheet's check takes the words its bottom button used to show (T80).
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

Press: `scale(.96)` and the sticker edge collapses. Sheets are drag-to-dismiss (or tap the backdrop, or Escape); there's no X. Reduced motion makes transitions and animations instant.

---

## 9. Implementation guidance

| Concern | Decision |
|---|---|
| Tokens | CSS variables in `app/globals.css` for `:root`, `[data-theme=dark]`, and `@media (prefers-color-scheme: dark)`, exposed to Tailwind v4 via `@theme`. Element colors are tokens (`--air-fill`, `--air-ink`, ...), and components take an `element` prop instead of raw hex. No raw hex values in components. |
| Components | The kit in `components/ui/`: `Card`, `Button`, `Chip` (plus `RoomChip` and `TierChip`), `ChoreIcon` + `ChoreIconPicker`, `Avatar` (initials + element), `Sheet` (T80: no X; swipe down, the backdrop or Escape dismiss it, and the drag handle is a button named "Close" for VoiceOver and keyboards. A form sheet saves with `SheetSave`, a check `IconButton` in the header named by what it does, "Save" / "Add" / "Start poll", rendered anywhere inside the form so the form owns its disabled and busy state; there's no bottom Save. A sheet with nothing to save shows no header button, only its `actions` slot, e.g. the Edit and Delete icons. Inline editors inside a detail or list sheet (a room's name, a cost, a run's title, a poll's deadline, a feeling note) keep their own small **Save** / **Cancel**, since the sheet as a whole has nothing to save), `IconButton` (the icon-only round button: a 44pt target with px floors around a 32px circle, accent for a commit or a pressed toggle and neutral otherwise, a spinner while busy, the app-wide focus ring; new icon-only buttons use it; `IconMark` is the same circle as a non-interactive mark inside a row button, §3.4), `Disclosure` + `DisclosureGroup` (tap-to-open sections), `TabBar`, `ListRow`, `SegmentedControl`, `Swipeable` (swipe right / left on a card or row), `DateField` + `TimeField` (T69: every date and time input; a labelled native field, so iPhone keeps its own wheel picker on a tap. With a mouse (`pointer: fine`) a calendar or clock `IconButton` ("Open calendar" / "Open clock", described by the field's label) sits at its right end and opens the browser's picker with `showPicker()`, focusing the field to type in where a browser has no picker; Chrome's own indicator is hidden so there's one icon), `Toast` (and the completion burst; one message at a time, above the **+** button, or at the top over the dimmed page while a sheet is open, so it never covers a sheet's buttons), `EmptyState`; see it at `/dev/kit` in light and dark. Feature components live in their own folders (`components/items`, `polls`, `runs`, `costs`, `calendar`, `home`, `needs`, `chores`, `tasks`, `house`, `activity`, …). Sheets use Vaul (which brings its own Radix Dialog for the focus trap and labels); the app doesn't use Radix directly. |
| Data | `rooms` table (see Architecture §6), `items.room_id` (optional), `house_members.room_id` for the member's bedroom, which drives their color. No per-user avatar config. |
| Animation | CSS transitions and keyframes only (Vaul animates the sheets). No Framer Motion. |
| Safe areas | `env(safe-area-inset-*)` on the tab bar, "+" button, and sheets. `viewport-fit=cover`. |
| Performance | House interactive in < 2s on a mid-range iPhone over 4G. No web font on iOS. |
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
