---
layout: layout.vto
title: Build Your First Script
description: A step-by-step walkthrough for writing your first UrsaMU system script from scratch
---

# Build Your First Script

This guide walks you through writing a real script from scratch — starting with "hello world" and building up to something useful that reads player data and sends formatted output.

**Prerequisites:** UrsaMU running locally, a text editor, basic TypeScript familiarity.

---

## Step 1 — Hello World

Create a new file at `system/scripts/hello.ts`:

```typescript
import { IUrsamuSDK } from "../../src/@types/UrsamuSDK.ts";

export default (u: IUrsamuSDK) => {
  u.send("Hello, world!");
};
```

Start your server and connect. Type `hello` (or `@hello`). You should see:

```
Hello, world!
```

**How it works:**
- The file name `hello.ts` becomes the command `hello`
- `@` prefix is stripped automatically, so `@hello` works too
- `u.send()` with no second argument sends to you (the actor)
- The `import` line is for TypeScript IDE support — it's stripped before running

---

## Step 2 — Use the Actor

Scripts know who ran them via `u.me`:

```typescript
import { IUrsamuSDK } from "../../src/@types/UrsamuSDK.ts";

export default (u: IUrsamuSDK) => {
  const name = u.util.displayName(u.me, u.me);
  u.send(`Hello, ${name}! You are in room #${u.me.location}.`);
};
```

`u.util.displayName(obj, viewer)` returns the moniker if set, otherwise the name.

---

## Step 3 — Read Arguments

Players can pass text after the command name. It's available in `u.cmd.args[0]`:

```typescript
import { IUrsamuSDK } from "../../src/@types/UrsamuSDK.ts";

export default (u: IUrsamuSDK) => {
  const arg = (u.cmd.args[0] || "").trim();

  if (!arg) {
    u.send("Usage: hello <name>");
    return;
  }

  u.send(`Hello, ${arg}!`);
};
```

Type `hello Alice` → `Hello, Alice!`

---

## Step 4 — Find Another Player

Use `u.util.target()` to resolve a name, ID, alias, `me`, or `here`:

```typescript
import { IUrsamuSDK } from "../../src/@types/UrsamuSDK.ts";

export default async (u: IUrsamuSDK) => {
  const arg = (u.cmd.args[0] || "").trim();
  if (!arg) {
    u.send("Usage: wave <player>");
    return;
  }

  const target = await u.util.target(u.me, arg);
  if (!target) {
    u.send(`I can't find '${arg}'.`);
    return;
  }

  const myName   = u.util.displayName(u.me,    u.me);
  const theirName = u.util.displayName(target, u.me);

  u.send(`You wave to ${theirName}.`);
  u.send(`${myName} waves to you.`, target.id);   // private message to them
  u.here.broadcast(`${myName} waves to ${theirName}.`);  // everyone in room sees it
};
```

---

## Step 5 — Read and Write Player Data

Player data lives in `u.me.state`. To persist a change, use `u.db.modify`:

```typescript
import { IUrsamuSDK } from "../../src/@types/UrsamuSDK.ts";

export default async (u: IUrsamuSDK) => {
  const switches = u.cmd.switches || [];

  if (switches.includes("reset")) {
    // Admin-only: reset the counter
    if (!u.me.flags.has("admin") && !u.me.flags.has("wizard")) {
      u.send("Permission denied.");
      return;
    }
    await u.db.modify(u.me.id, "$set", {
      data: { ...u.me.state, waveCount: 0 }
    });
    u.send("Wave count reset.");
    return;
  }

  // Increment wave count
  const count = ((u.me.state.waveCount as number) || 0) + 1;
  await u.db.modify(u.me.id, "$set", {
    data: { ...u.me.state, waveCount: count }
  });

  u.send(`You have waved ${count} time${count === 1 ? "" : "s"}.`);
};
```

> **Always spread `u.me.state`** when writing back. If you omit the spread, you'll
> overwrite all other fields on the object.

Type `wave` → `You have waved 1 time.`
Type `wave` again → `You have waved 2 times.`
Type `@wave/reset` (as admin) → `Wave count reset.`

---

## Step 6 — Format a Table

Use `u.util.ljust()`, `u.util.rjust()`, and `u.util.center()` to align columns:

```typescript
import { IUrsamuSDK } from "../../src/@types/UrsamuSDK.ts";

export default (u: IUrsamuSDK) => {
  const name   = u.util.displayName(u.me, u.me);
  const gold   = (u.me.state.gold   as number) || 0;
  const silver = (u.me.state.silver as number) || 0;
  const level  = (u.me.state.level  as number) || 1;

  const HR = "%ch%cy" + "-".repeat(40) + "%cn";

  u.send("%ch%cy" + u.util.center("Character Sheet", 40, "=") + "%cn");
  u.send(HR);
  u.send(u.util.ljust("Name:", 12)  + u.util.ljust(name,          28));
  u.send(u.util.ljust("Level:", 12) + u.util.ljust(String(level), 28));
  u.send(HR);
  u.send(u.util.ljust("Gold:",   12) + u.util.rjust(String(gold),   28));
  u.send(u.util.ljust("Silver:", 12) + u.util.rjust(String(silver), 28));
  u.send(HR);
};
```

Output:
```
========= Character Sheet ==========
----------------------------------------
Name:       Alice
Level:      5
----------------------------------------
Gold:                              1200
Silver:                             340
----------------------------------------
```

---

## Step 7 — Add Aliases

Export a const `aliases` array to register extra command names:

```typescript
import { IUrsamuSDK } from "../../src/@types/UrsamuSDK.ts";

export const aliases = ["sheet", "sc"];

export default (u: IUrsamuSDK) => {
  // ... your script
};
```

Now `sheet`, `sc`, `@sheet`, and `@sc` all trigger this script.

---

## Next Steps

- Read the [SDK Reference](/guides/scripting/) for every available method
- Browse the [Recipes](/guides/recipes/) for common patterns (shops, timed events, etc.)
- Look at `system/scripts/who.ts`, `score.ts`, and `bblist.ts` for real examples
- Add a test in `tests/` using the wrapScript pattern from existing test files
