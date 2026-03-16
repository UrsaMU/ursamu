---
layout: layout.vto
title: Scripting Recipes
description: Common patterns and ready-to-use examples for UrsaMU scripts
---

# Scripting Recipes

Copy-paste patterns for the most common scripting tasks. Each recipe is a complete, working script.

---

## Room Description with Dynamic Content

A room object with an `&DESC` attribute that shows different text based on time of day:

```typescript
// &DESC on a room object — run via @trigger or u.execute("look")
const hour = new Date().getHours();
const timeOfDay = hour < 6 ? "night"
  : hour < 12 ? "morning"
  : hour < 18 ? "afternoon"
  : "evening";

const desc = u.here.state.desc as string || "A nondescript room.";
u.send(`[${u.here.name}]`);
u.send(desc);
u.send(`It is ${timeOfDay}.`);

// List obvious exits
const exits = u.here.contents.filter(o => o.flags.has("exit"));
if (exits.length) {
  const names = exits.map(e => e.name || e.id).join(", ");
  u.send(`Obvious exits: ${names}`);
}
```

---

## Simple Score Sheet

```typescript
// system/scripts/score.ts
import { IUrsamuSDK } from "../../src/@types/UrsamuSDK.ts";

export default (u: IUrsamuSDK) => {
  const s = u.me.state;
  const name  = u.util.displayName(u.me, u.me);
  const level = (s.level  as number) || 1;
  const xp    = (s.xp     as number) || 0;
  const hp    = (s.hp     as number) || 100;
  const maxHp = (s.maxHp  as number) || 100;
  const gold  = (s.gold   as number) || 0;

  const W = 40;
  const HR = "%ch%cy" + "=".repeat(W) + "%cn";
  const row = (label: string, value: string) =>
    u.util.ljust(label, 16) + u.util.rjust(value, W - 16);

  u.send(HR);
  u.send("%ch%cy" + u.util.center(name, W) + "%cn");
  u.send(HR);
  u.send(row("Level:",  String(level)));
  u.send(row("XP:",     String(xp)));
  u.send(row("HP:",     `${hp} / ${maxHp}`));
  u.send(row("Gold:",   String(gold)));
  u.send(HR);
};
```

---

## Simple Shop

An object with a `&SHOP` attribute listing items for sale. Players use `buy <item>`:

```typescript
// system/scripts/buy.ts
import { IUrsamuSDK } from "../../src/@types/UrsamuSDK.ts";

interface ShopItem { name: string; cost: number; flags: string[] }

export default async (u: IUrsamuSDK) => {
  const arg = (u.cmd.args[0] || "").trim().toLowerCase();

  // Find a shop object in the room
  const shopObj = u.here.contents.find(o => o.flags.has("shop"));
  if (!shopObj) {
    u.send("There is nothing for sale here.");
    return;
  }

  const catalog = (shopObj.state.catalog as ShopItem[]) || [];

  if (!arg) {
    // List items
    u.send("%ch%cyItems for sale:%cn");
    for (const item of catalog) {
      u.send(`  ${u.util.ljust(item.name, 24)} ${item.cost} gold`);
    }
    u.send('Type "buy <item name>" to purchase.');
    return;
  }

  const item = catalog.find(i => i.name.toLowerCase().includes(arg));
  if (!item) {
    u.send(`No item matching '${arg}' is for sale here.`);
    return;
  }

  const gold = (u.me.state.gold as number) || 0;
  if (gold < item.cost) {
    u.send(`You need ${item.cost} gold but only have ${gold}.`);
    return;
  }

  // Deduct gold and create item in inventory
  await u.db.modify(u.me.id, "$set", {
    data: { ...u.me.state, gold: gold - item.cost }
  });

  await u.db.create({
    flags: new Set(["thing", ...item.flags]),
    location: u.me.id,
    state: { name: item.name, owner: u.me.id }
  });

  u.send(`You buy ${item.name} for ${item.cost} gold.`);
  u.here.broadcast(`${u.util.displayName(u.me, u.me)} purchases something.`);
};
```

Set up a shop object:
```
@create Shop=0
@set shop=shop
@set shop.catalog=[{"name":"Iron Sword","cost":50,"flags":["weapon"]},{"name":"Leather Armor","cost":40,"flags":["armor"]}]
```

---

## Announcement Board (Post on Login)

Show a sticky announcement to players when they connect, stored as a text entry:

```typescript
// Add to system/scripts/connect.ts after auth.login()
const announcement = await u.text.read("announcement");
if (announcement) {
  u.send("%ch%cy[ANNOUNCEMENT]%cn " + announcement);
}
```

Admin sets it:
```
@motd/set Server maintenance tonight at midnight EST. Back up by 2am.
```

Or with a dedicated announce script:

```typescript
// system/scripts/announce.ts
import { IUrsamuSDK } from "../../src/@types/UrsamuSDK.ts";

export default async (u: IUrsamuSDK) => {
  const actor = u.me;
  if (!actor.flags.has("admin") && !actor.flags.has("wizard") && !actor.flags.has("superuser")) {
    u.send("Permission denied.");
    return;
  }
  const msg = (u.cmd.args[0] || "").trim();
  if (!msg) { u.send("Usage: @announce <message>"); return; }

  await u.text.set("announcement", msg);
  u.broadcast(`%ch%cy[ANNOUNCEMENT]%cn ${msg}`);
  u.send("Announcement set and broadcast.");
};
```

---

## Timed Event (Scheduled Message)

Fire a message to all connected players at a specific server time. Trigger via `@trigger` from a cron or event handler:

```typescript
// &MIDNIGHT_ANNOUNCE on the master room
const now = new Date();
const timeStr = now.toLocaleTimeString();
u.broadcast(`%ch%cy[SERVER]%cn The time is now ${timeStr}. New day begins.`);

// Reset daily quest flags for all players
const players = await u.db.search({ flags: /player/i });
for (const p of players) {
  await u.db.modify(p.id, "$set", {
    data: { ...p.state, dailyQuestDone: false }
  });
}
```

---

## Object Lock (Only Owner Can Pick Up)

Set a lock on an object so only its owner can get it:

```typescript
// system/scripts/get.ts addition — check for "owneronly" flag
const target = await u.util.target(u.me, arg);
if (!target) { u.send("I don't see that here."); return; }

if (target.flags.has("owneronly") && target.state.owner !== u.me.id) {
  u.send("That doesn't belong to you.");
  return;
}
// ... proceed with get
```

---

## Permission Guard Pattern

The standard pattern for admin-only commands:

```typescript
const isAdmin = u.me.flags.has("admin")
             || u.me.flags.has("wizard")
             || u.me.flags.has("superuser");

if (!isAdmin) {
  u.send("Permission denied.");
  return;
}
```

---

## Parse `<target>=<value>` Arguments

The most common argument pattern in MUSH-style commands:

```typescript
const raw = (u.cmd.args[0] || "").trim();
const eqIdx = raw.indexOf("=");

if (eqIdx === -1) {
  u.send("Usage: @mycommand <target>=<value>");
  return;
}

const targetRef = raw.slice(0, eqIdx).trim();
const value     = raw.slice(eqIdx + 1).trim();

const target = await u.util.target(u.me, targetRef);
if (!target) { u.send("Target not found."); return; }
```

---

## Read and Display a Bulletin Board Post

Show the latest post from the announcements board on login:

```typescript
// In connect.ts, after auth.login():
const posts = await u.bb.listPosts("announcements");
if (posts.length) {
  const latest = posts[posts.length - 1] as { num: number; subject: string; authorName: string };
  u.send(`%ch%cy[BB]%cn Latest: ${latest.subject} (by ${latest.authorName}) — @bbread announcements/${latest.num}`);
}
```

---

## Currency Transfer (Give Gold)

```typescript
// system/scripts/givegold.ts
import { IUrsamuSDK } from "../../src/@types/UrsamuSDK.ts";

export default async (u: IUrsamuSDK) => {
  const raw = (u.cmd.args[0] || "").trim();
  const eqIdx = raw.indexOf("=");
  if (eqIdx === -1) { u.send("Usage: givegold <player>=<amount>"); return; }

  const targetRef = raw.slice(0, eqIdx).trim();
  const amount    = parseInt(raw.slice(eqIdx + 1).trim(), 10);

  if (isNaN(amount) || amount <= 0) { u.send("Amount must be a positive number."); return; }

  const target = await u.util.target(u.me, targetRef);
  if (!target) { u.send("Player not found."); return; }
  if (target.id === u.me.id) { u.send("You can't give gold to yourself."); return; }

  const myGold = (u.me.state.gold as number) || 0;
  if (myGold < amount) { u.send(`You only have ${myGold} gold.`); return; }

  // Transfer
  await u.db.modify(u.me.id, "$set", { data: { ...u.me.state, gold: myGold - amount } });
  await u.db.modify(target.id, "$set", {
    data: { ...target.state, gold: ((target.state.gold as number) || 0) + amount }
  });

  const myName = u.util.displayName(u.me, u.me);
  u.send(`You give ${amount} gold to ${u.util.displayName(target, u.me)}.`);
  u.send(`${myName} gives you ${amount} gold.`, target.id);
  u.here.broadcast(`${myName} gives some gold to ${u.util.displayName(target, u.me)}.`);
};
```

---

## Persistent Room Counter

Track how many times a room has been visited:

```typescript
// &ONENTER on a room object (fired via @trigger room/ONENTER in look.ts or movement.ts)
const visits = ((u.here.state.visitCount as number) || 0) + 1;
await u.db.modify(u.here.id, "$set", {
  data: { ...u.here.state, visitCount: visits }
});

if (visits % 100 === 0) {
  u.here.broadcast(`%ch%cy[INFO]%cn This room has been visited ${visits} times!`);
}
```

---

## Formatting a Who List

```typescript
// system/scripts/who.ts — abbreviated example
const online = await u.db.search({ flags: /connected/i });
const W = 60;

u.send("%ch%cy" + "=".repeat(W) + "%cn");
u.send("%ch%cy" + u.util.center("WHO", W) + "%cn");
u.send("%ch%cy" + "=".repeat(W) + "%cn");
u.send(
  u.util.ljust("%chName%cn", 24) +
  u.util.ljust("%chLocation%cn", 26) +
  u.util.rjust("%chIdle%cn", 10)
);
u.send("-".repeat(W));

for (const p of online) {
  const name     = u.util.displayName(p, u.me);
  const location = (p.state.roomName as string) || `#${p.location}`;
  const idle     = p.state.lastCommand
    ? `${Math.floor((Date.now() - (p.state.lastCommand as number)) / 60000)}m`
    : "0m";

  u.send(u.util.ljust(name, 24) + u.util.ljust(location, 26) + u.util.rjust(idle, 10));
}

u.send("-".repeat(W));
u.send(`${online.length} player${online.length === 1 ? "" : "s"} connected.`);
```
