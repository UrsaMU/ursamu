---
layout: layout.vto
title: Rhost Vision Plugin
description: A plugin that replaces UrsaMU's default display commands with Rhost-style formatting for room display, WHO list, pages, score, examine, and inventory.
nav:
  - text: Overview
    url: "#overview"
  - text: Overridden Commands
    url: "#overridden-commands"
  - text: Player Commands
    url: "#player-commands"
  - text: Player-Settable Attributes
    url: "#player-settable-attributes"
  - text: Connection Announcements
    url: "#connection-announcements"
  - text: Configuration
    url: "#configuration"
  - text: Layout Utilities
    url: "#layout-utilities"
  - text: Installation
    url: "#installation"
  - text: File Structure
    url: "#file-structure"
---

# Rhost Vision Plugin

The `rhost-vision` plugin replaces UrsaMU's default display commands with
Rhost-style formatting, giving the game the look and feel of RhostMUSH.
It overrides `look`, `who`, `page`, `score`, `examine`, and `inventory`, and
adds three new player commands: `+finger`, `+where`, and `+staff`.

**Version:** 1.2.0
**Author:** chogan1981
**Requires:** UrsaMU >= 1.0.0

---

## Overview

The plugin works by generating self-contained TypeScript scripts (with the
active theme baked in) and writing them to `system/scripts/` on startup.
Original scripts are backed up as `*.rhost-bak` files and restored automatically
when the plugin is removed. No manual configuration is required beyond editing
`theme.ts`.

---

## Overridden Commands

### `look`

Replaces the default room display with full Rhost-style layout:

- Room name is centered in a `===` header (bright white)
- Description is word-wrapped with configurable indent
- **Players** section lists connected players with idle time (color-coded) and
  their `&short-desc` value next to their name
- Idle color: green (0–4 min), normal (5–14 min), dark gray (15+ min)
- **Exits** are split into two sections — **Locations** (named places) and
  **Directions** (cardinal: north, south, east, west, ne, nw, se, sw, up, down,
  in, out). Splitting can be disabled in the theme.
- Exit names are bright white; aliases (the part after the semicolon) are cyan
- Exits render in a configurable number of columns (1, 2, or 3)
- Room dbrefs (`#1`, `#2`, etc.) are hidden from the displayed room name unless
  the viewer can edit the room

### `who`

Replaces the default player list:

- Columns: **Player Name**, **On For**, **Idle**, **Doing**
- **On For** shows total connection time formatted as `HH:MM` or `Xd HH:MM`
- Idle time is color-coded identically to the room display
- Players sorted by most recent login first
- Dark players are hidden

### `page`

Replaces the default page (private message) format:

| Situation | Old format | Rhost format |
|-----------|-----------|--------------|
| Receiving a page | `Jupiter pages you: Hello!` | `Jupiter(J) pages: Hello!` |
| Sending a page | `You paged Jupiter with: Hello` | `You paged Jupiter with 'Hello'.` |
| Pose page (`:`) — receiver | `Jupiter pages from afar: Jupiter waves` | `From afar, Jupiter(J) waves` |
| Pose page (`:`) — sender | `Long distance to Jupiter: waves` | `Long distance to Jupiter: Jupiter waves` |

The sender's alias (set via `@alias`) is shown in parentheses when present.

### `score`

Replaces the default score sheet with a formatted character card showing:

- DBRef, alias, money, flags, short description, and doing message
- A customizable extra stat block via the `&SCORE-EXTRA` attribute (see
  [Player-Settable Attributes](#player-settable-attributes))

### `examine`

Replaces the default examine output. Shows flags, owner, lock, location, home,
and channel membership in a labeled two-column layout, followed by all
non-system attributes. Only works on objects the actor can edit, or objects with
the `visual` flag.

### `inventory`

Replaces the default inventory command. Shows carried items with their
`&short-desc` truncated to fit the terminal width. Reports item count in the
footer.

---

## Player Commands

These are native commands registered via `addCmd` and are always available while
the plugin is loaded, regardless of whether a script file is overridden.

### `+finger [<player>]`

View a player's public profile card.

```
> +finger Jupiter
========================== [Staff] Jupiter ==========================
  Alias:    J                           On For:  02:14
  Idle:     3m                          Money:   120 credits
  Doing:    Watching the horizon.
----------------------------------------------------------------------
A wandering knight from the northern reaches.
======================================================================
```

Shows alias, idle time, on-for time, money, doing message, and short
description. If the target has set `&finger-info`, that text appears as a
free-form bio below a divider.

Omitting `<player>` shows the actor's own profile.

### `+where`

Shows where all connected (non-dark) players are, grouped by room, sorted by
player count.

```
> +where
======================= Where Is Everyone? ==========================
  The Grand Hall          Jupiter(3m)  Aria(12m)
  Market Square           Zhen(1m)
----------------------------------------------------------------------
  3 players in 2 locations.
======================================================================
```

### `+staff`

Shows all currently connected staff members (players with the `admin`, `wizard`,
or `superuser` flag) in a WHO-style table.

```
> +staff
========================== Staff Online =============================
Player Name            On For    Idle  Doing
--------------------------------------------------------------------
Jupiter                01:22     1m    Watching.
--------------------------------------------------------------------
  1 staff member online.
=====================================================================
```

---

## Player-Settable Attributes

These attributes are read by the overridden scripts. Players set them with the
`&` command.

### `&short-desc me=<text>`

A brief description shown next to your name in room displays (`look`) and in
`+finger` output. Keep it short — it is truncated to fit the available width.

```
> &short-desc me=A tall woman in a grey cloak.
```

### `@doing <text>`

Sets your **Doing** message, shown in `who` and `+finger`. This is a built-in
UrsaMU command, not a soft-coded attribute.

```
> @doing Wandering the roads.
```

### `&finger-info me=<text>`

Free-form bio text shown at the bottom of your `+finger` profile, below a
divider. Accepts any length; it is word-wrapped to the terminal width.

```
> &finger-info me=Jupiter has roamed the northern reaches for decades, known as much for their sharp wit as their sharper blade.
```

### `&score-extra me=<text or script>`

Extra text appended to your `score` output under a **Stats** heading. Can be
plain text or a soft-coded script that calls `u.send()` — the output is
word-wrapped and displayed below your main score fields.

```
> &score-extra me=STR 8 | DEX 6 | INT 10 | WIS 7
```

---

## Connection Announcements

When any player logs in or out, the plugin broadcasts a centered announcement to
all connected players:

```
------------ Jupiter has connected. -------------
```
```
------------ Jupiter has disconnected. ----------
```

The announcement uses the `dividerChar` and accent color from the active theme.
These hooks are registered on `player:login` and `player:logout` via
`gameHooks` and are automatically removed when the plugin is unloaded.

---

## Configuration

Edit `theme.ts` inside the installed plugin directory and restart the game. The
generated scripts in `system/scripts/` are rewritten from the updated theme on
the next startup.

### `defaultTheme` values

| Property | Default | Notes |
|----------|---------|-------|
| `width` | `78` | Fallback width when NAWS is not negotiated |
| `borderChar` | `=` | Character used for header/footer lines |
| `dividerChar` | `-` | Character used for section dividers |
| `barFill` | `#` | Progress-bar filled segment character |
| `barEmpty` | `.` | Progress-bar empty segment character |

#### Color properties (`colors.*`)

| Key | Default | When used |
|-----|---------|-----------|
| `border` | `%ch%cw` (bright white) | Header, footer, and divider lines |
| `header` | `%ch%cw` (bright white) | Room name / title text |
| `label` | `%ch%cw` (bright white) | Section divider labels |
| `accent` | `%cy` (cyan) | Exit aliases, staff badge |
| `idleFresh` | `%cg` (green) | Idle 0–4 minutes |
| `idleAway` | `%cn` (normal) | Idle 5–14 minutes |
| `idleAFK` | `%cx` (dark gray) | Idle 15+ minutes |
| `barFilled` | `%cg` (green) | Progress-bar filled portion |
| `barEmpty` | `%cx` (dark gray) | Progress-bar empty portion |
| `reset` | `%cn` | ANSI reset / normal text |

#### `look.*` options

| Key | Default | Effect |
|-----|---------|--------|
| `showShortDesc` | `true` | Show `&short-desc` next to player names in room |
| `showIdle` | `true` | Show idle time next to player names in room |
| `categorizeExits` | `true` | Split exits into Locations and Directions |
| `showExitAliases` | `true` | Show exit aliases in cyan |
| `exitColumns` | `2` | Number of columns for exit display (1, 2, or 3) |
| `descIndent` | `2` | Number of leading spaces on description lines |

#### `who.*` column widths

| Key | Default | Notes |
|-----|---------|-------|
| `nameWidth` | `21` | Visible width of the player name column |
| `onForWidth` | `8` | Visible width of the On For column |
| `idleWidth` | `4` | Visible width of the Idle column |

### Applying a custom theme

Override any subset of the defaults by exporting `customTheme` from `theme.ts`:

```typescript
// theme.ts — example: blue color scheme, 80-char width
export const customTheme: Partial<RhostTheme> = {
  width: 80,
  borderChar: "~",
  colors: {
    ...defaultTheme.colors,
    border: "%ch%cb",
    header: "%ch%cb",
  },
};
```

Leave `customTheme` as `undefined` (the default) to use the defaults unchanged.

---

## Layout Utilities

`layout.ts` provides pure string-manipulation helpers for building fixed-width
MUSH output. There is no SDK dependency — any function can be copied into your
own scripts.

All functions understand MUSH color codes (`%cX`, `%ch`, `%cn`, etc.) and raw
ANSI escape sequences as zero-width when measuring string length.

### `visibleLength(s: string): number`

Returns the display width of `s` after stripping all color codes and ANSI
escapes.

```typescript
visibleLength("%ch%cwHello%cn");  // → 5
```

### `padLeft(s, n, char?): string`

Pads `s` on the right so its visible width equals `n`. Equivalent to
left-aligning in a column of width `n`.

```typescript
padLeft("Hello", 10);  // → "Hello     "
```

### `padRight(s, n, char?): string`

Pads `s` on the left so its visible width equals `n`. Equivalent to
right-aligning in a column of width `n`.

```typescript
padRight("42", 6);  // → "    42"
```

### `padCenter(s, n, char?): string`

Centers `s` within a field of visible width `n`.

```typescript
padCenter("Hi", 10);  // → "    Hi    "
```

### `header(title, theme): string`

Full-width header line with the title centered between `borderChar` characters.

```
header("The Grand Hall", t)
→ "============================= The Grand Hall =============================="
```

### `footer(theme): string`

Full-width footer — a solid `borderChar` line.

```
footer(t)  →  "=========================================================================="
```

### `divider(label | null, theme): string`

Full-width section divider with an optional centered label. Pass `null` for an
unlabeled rule.

```
divider("Players", t)  →  "------------- Players -------------"
divider(null, t)        →  "------------------------------------"
```

### `wrap(text, width, indent?): string[]`

Word-wraps `text` to `width` visible characters. Returns one string per line.
`indent` is prepended to every line (e.g. `"  "` for a two-space indent). Color
codes in the text are preserved.

```typescript
wrap("A long description here.", 20, "  ");
// → ["  A long description", "  here."]
```

### `columns(rows, leftWidth, totalWidth, gap?): string[]`

Renders pairs of `[left, right]` strings in two columns.

```typescript
columns([["Market (m)", "North (n)"], ["Inn (i)", "South (s)"]], 38, 78);
```

### `nColumns(items, n, totalWidth, gap?): string[]`

Renders a flat list of strings in `n` equal columns.

```typescript
nColumns(["Market", "Inn", "North", "South"], 2, 78, 2);
// → ["Market                                  Inn",
//    "North                                   South"]
```

### `bar(filled, total, barWidth, theme): string`

Renders a color-coded progress bar of `barWidth` visible characters (plus two
for brackets).

```typescript
bar(7, 10, 20, t);
// → "[%cg#######%cn%cx...........%cn]"
```

### `sheet(fields, labelWidth, theme): string[]`

Renders a character sheet — key/value rows with optional inline progress bars.

```typescript
sheet([
  { label: "STR", value: "8 / 10", bar: { filled: 8, total: 10, width: 20 } },
  { label: "DEX", value: "6 / 10", bar: { filled: 6, total: 10, width: 20 } },
], 6, t);
// → ["STR    [########............]  8 / 10",
//    "DEX    [######..............]  6 / 10"]
```

### `table(headers, rows, colWidths, totalWidth, theme): string[]`

Renders a bordered table with labeled header columns. The last column fills
whatever width remains after the fixed-width columns.

```typescript
table(
  ["Name", "Idle", "Doing"],
  [["Jupiter", "2m", "Playing"], ["Aria", "5m", "Watching"]],
  [21, 5],   // widths of first N-1 columns
  78,
  t,
);
```

### `inlineUtils(theme): string`

Returns all of the above layout functions as a minified, self-contained
JavaScript snippet with the theme values baked in as constants. Used internally
by `index.ts` to embed utilities into the generated system scripts.

---

## Installation

1. Copy the `rhost-vision` folder into `src/plugins/`.
2. Restart the game.
3. The plugin auto-installs on startup — no further steps are needed.

On startup the plugin:
- Backs up existing `system/scripts/look.ts`, `who.ts`, `page.ts`, `score.ts`,
  `examine.ts`, and `inventory.ts` as `*.rhost-bak` files (unless already
  written by this plugin).
- Writes fresh versions generated from the current theme.
- Copies help files from `help/` into the game's `help/` directory.
- Registers `+finger`, `+where`, and `+staff` via `addCmd`.
- Subscribes to `player:login` and `player:logout` for connection announcements.

## Removal

1. Delete the `rhost-vision` folder from `src/plugins/`.
2. Restart the game.

On removal the plugin:
- Restores each `system/scripts/*.rhost-bak` file to its original path.
- Removes installed help files.
- Unsubscribes `player:login` / `player:logout` hook handlers.

---

## File Structure

```
src/plugins/rhost-vision/
├── index.ts               Plugin loader — generates scripts, registers hooks
├── commands.ts            +finger, +where, +staff (registered via addCmd)
├── theme.ts               defaultTheme, customTheme, RhostTheme interface
├── layout.ts              Pure layout utilities (visibleLength, header, bar, …)
├── help/                  Help files copied to the game's help/ directory
│   └── general/
│       └── rhost-vision.md
├── ursamu.plugin.json     Plugin metadata
└── README.txt             Quick-start reference
```
