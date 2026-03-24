---
layout: layout.vto
title: Game Clock
description: UrsaMU's persistent in-game time system — calendar, configuration, and scripting patterns.
---

# Game Clock

UrsaMU includes a persistent in-game time system called GameClock. It runs
independently from the real-world clock and can advance faster or slower than
real time. This lets you run a fantasy calendar, track seasons, and write
time-aware scripts.
---

## Overview

The GameClock stores time as a single integer — **game-minutes** elapsed since
the fictional epoch (Year 1, Month 1, Day 1, 00:00). Each real-world minute,
the clock advances by `game.timeMultiplier` game-minutes. At the default
multiplier of `1.0`, game time and real time pass at the same rate.

The clock persists across server reboots. Its state is stored in the database
under the key `server.gameclock`.
---

## Calendar System

| Unit | Range | Details |
|------|-------|---------|
| Year | 1 + | No upper limit |
| Month | 1–12 | 12 months per year |
| Day | 1–28 | 28 days per month |
| Hour | 0–23 | 24-hour clock |
| Minute | 0–59 | 60 minutes per hour |

**Constants:**
- 60 minutes per hour
- 1,440 minutes per day
- 40,320 minutes per month
- 483,840 minutes per year

Month and day names are not built in — you define them in your game's scripts.
---

## Configuration

Set the time multiplier in `config/game.json` (or your config file):

```json
{
  "game": {
    "timeMultiplier": 2.0
  }
}
```

| Multiplier | Effect |
|-----------|--------|
| `0.5` | 1 game-minute per 2 real minutes (half speed) |
| `1.0` | 1 game-minute per 1 real minute (real time) |
| `2.0` | 2 game-minutes per real minute (double speed) |
| `24.0` | 1 game-day per real hour |
| `336.0` | 1 game-year per real day |

The multiplier can also be changed at runtime from an admin script:

```typescript
await u.sys.setConfig("game.timeMultiplier", 2.0);
```
---

## Reading Game Time

Use `u.sys.gameTime()` in any script or command handler.

```typescript
const t = await u.sys.gameTime();
// t.year:   number (1, 2, 3, …)
// t.month:  1–12
// t.day:    1–28
// t.hour:   0–23
// t.minute: 0–59

// Simple formatted string
const hh = String(t.hour).padStart(2, "0");
const mm = String(t.minute).padStart(2, "0");
u.send(`It is Year ${t.year}, Month ${t.month}, Day ${t.day}, ${hh}:${mm}.`);
```

### Custom calendar names

```typescript
const MONTHS = [
  "", "Frostmonth", "Snowmelt", "Seedsown", "Bloomtide",
  "Highsun", "Harvestmoon", "Goldleaf", "Ashfall",
  "Dimming", "Winterset", "Coldwatch", "Longnight"
];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const t = await u.sys.gameTime();
const dayOfWeek = ((t.day - 1) % 7);  // 0-based, repeating
const hh = String(t.hour).padStart(2, "0");
const mm = String(t.minute).padStart(2, "0");

u.send(`${DAYS[dayOfWeek]}, ${MONTHS[t.month]} ${t.day}, Year ${t.year} — ${hh}:${mm}`);
// → "Tue, Bloomtide 15, Year 340 — 08:00"
```

### In native plugin commands

```typescript
import { gameClock } from "../../services/GameClock/index.ts";

const t = gameClock.now();
const formatted = gameClock.format();   // "Year 340, Month 4, Day 15, 08:00"
```
---

## Setting Game Time

Requires wizard or admin. **The SDK does not enforce this** — check flags in
your script.

```typescript
// Guard
if (!u.me.flags.has("wizard") && !u.me.flags.has("admin") && !u.me.flags.has("superuser")) {
  u.send("Permission denied.");
  return;
}

// Set the full date/time
await u.sys.setGameTime({
  year:   340,
  month:  6,
  day:    1,
  hour:   8,
  minute: 0,
});

u.broadcast("The calendar has been reset to Midsummer, Year 340.");
```

You can set partial fields by reading the current time first:

```typescript
const t = await u.sys.gameTime();

// Jump to the next day, same time
await u.sys.setGameTime({
  ...t,
  day: t.day + 1 > 28 ? 1 : t.day + 1,
  month: t.day + 1 > 28 ? t.month + 1 : t.month,
});
```
---

## Scripting Patterns

### Display time in a score sheet

```typescript
const t = await u.sys.gameTime();
const hh = String(t.hour).padStart(2, "0");
const mm = String(t.minute).padStart(2, "0");
const dateLine = u.util.sprintf(
  "%-20s %s",
  "In-Game Date:",
  `Month ${t.month}, Day ${t.day}, Year ${t.year} — ${hh}:${mm}`
);
u.send(dateLine);
```

### Seasonal check

```typescript
const t = await u.sys.gameTime();

// Months 12, 1, 2 = Winter; 3-5 = Spring; 6-8 = Summer; 9-11 = Autumn
function getSeason(month: number): string {
  if (month === 12 || month <= 2) return "Winter";
  if (month <= 5) return "Spring";
  if (month <= 8) return "Summer";
  return "Autumn";
}

const season = getSeason(t.month);
u.send(`It is currently ${season}.`);
```

### Night vs. day

```typescript
const t = await u.sys.gameTime();
const isNight = t.hour < 6 || t.hour >= 20;

if (isNight) {
  u.send("The room is lit only by moonlight.");
} else {
  u.send("Sunlight streams through the windows.");
}
```

### Store a timestamp on an object

```typescript
const t = await u.sys.gameTime();
// Store as a simple object in state
await u.db.modify(u.me.id, "$set", {
  "data.lastSeen": { year: t.year, month: t.month, day: t.day }
});
```

### Read a stored timestamp

```typescript
const ts = u.me.state.lastSeen as { year: number; month: number; day: number } | undefined;
if (ts) {
  u.send(`You were last seen on Month ${ts.month}, Day ${ts.day}, Year ${ts.year}.`);
}
```
---

## The +time Command

Players can check the current game time with:

```
+time
```

Output example:
```
The current in-game time is:
  Year 340, Month 4, Day 15, 08:32
```

The system script is at `system/scripts/time.ts`. To customize the output
format or add a custom calendar, copy the script and modify it.
---

## Notes

- The clock only advances while the server is running. It does not catch up
  after downtime.
- Setting `game.timeMultiplier` to `0` freezes time.
- The epoch is stored as a single floating-point number, so fractional minutes
  are tracked internally but the `IGameTime` fields are always integers.
- There is no built-in alarm or cron system — use `u.events.emit` to trigger
  events at specific game times if you need that behavior.
