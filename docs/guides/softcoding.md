---
layout: layout.vto
title: Soft-Coding Guide
description: How to store scripts and data in object attributes and trigger them with @trigger, u.trigger, and u.eval.
nav:
  - text: What is Soft-Coding?
    url: "#what-is-soft-coding"
  - text: Setting Attributes In-Game
    url: "#setting-attributes-in-game"
  - text: Setting Attributes via Scripts
    url: "#setting-attributes-via-scripts"
  - text: Reading Attributes
    url: "#reading-attributes"
  - text: Running Attributes
    url: "#running-attributes"
  - text: Common Attribute Names
    url: "#common-attribute-names"
  - text: Scripting Inside Attributes
    url: "#scripting-inside-attributes"
  - text: Practical Examples
    url: "#practical-examples"
---

# Soft-Coding Guide

Soft-coding is the practice of storing scripts and data directly on in-game
objects as **attributes**, rather than writing static files. It lets builders
and players customize room behavior, object interaction, and NPC responses
entirely from inside the game — no server restart required.

---

## What is Soft-Coding?

Every object in UrsaMU (rooms, players, things, exits) has a `data.attributes`
array. Each entry is an `IAttribute`:

```typescript
interface IAttribute {
  name: string;    // e.g. "ONENTER"
  value: string;   // the script (TypeScript/JS) or plain text
  setter: string;  // dbref of whoever set it
  type?: string;
  hidden?: boolean;
}
```

An attribute's `value` is a full sandboxed script — the same format as files in
`system/scripts/`. When something fires the attribute (a hook, `@trigger`, or
`u.trigger()`), UrsaMU runs the script in a Web Worker with a fresh `u` object.

**Why use soft-coding instead of a system script?**

- Changes take effect immediately — no restart, no redeploy.
- Any builder with edit permission can customize objects they own.
- Behavior stays attached to the object, so copying or moving the object brings
  its behavior with it.
- Inheritance: if an attribute is not found on the object, UrsaMU walks up the
  `data.parent` chain, allowing shared behavior from parent objects.

---

## Setting Attributes In-Game

Use the `&` command:

```
&<ATTR-NAME> <object>=<value>
```

`<object>` accepts anything the `target` utility understands: `me`, `here`, an
object name, or a dbref (`#42`). `<ATTR-NAME>` is case-insensitive and stored
as supplied (the lookup is case-insensitive).

```
> &ONENTER here=u.send("The door creaks as you enter.");
Game> Lobby's attribute ONENTER set.

> &SHORT-DESC me=A tall woman in a grey cloak.
Game> Alice's attribute SHORT-DESC set.
```

**Clear an attribute** by omitting the value:

```
> &ONENTER here=
Game> Lobby's attribute ONENTER removed.
```

Constraints:
- You must be able to **edit** the target (be its owner, or have the `admin`,
  `wizard`, or `superuser` flag).
- Attribute names are arbitrary — there is no enforced schema. Conventions are
  listed in [Common Attribute Names](#common-attribute-names).

### Alternative: `@set` attribute syntax

`@set` also sets soft attributes using the `target/ATTR=value` form:

```
@set <object>/<ATTR>=<value>    -- set attribute
@set <object>/<ATTR>=           -- clear attribute
```

This is equivalent to `&ATTR obj=value` for plain data storage (both write
to `data.ATTR`). Use whichever feels natural; `&` is the traditional MUSH
syntax, while `@set obj/ATTR=value` is more explicit.

> **Note:** `@set obj=<FLAG>` (without the `/`) sets or removes a *flag*, not
> an attribute — see the [Admin Guide](/guides/admin-guide#user-roles-and-permissions).

---

## Setting Attributes via Scripts

From inside any script you can read and write the raw `data.attributes` array
directly using `u.db.modify`. Always spread the existing array to avoid
clobbering other attributes.

### Add or replace a single attribute

```typescript
export default async (u) => {
  const me = u.me;
  const existing = (me.state.attributes || []) as Array<{ name: string; value: string; setter: string }>;

  // Remove any existing entry with the same name (case-insensitive)
  const filtered = existing.filter(a => a.name.toLowerCase() !== "onenter");

  await u.db.modify(me.id, "$set", {
    data: {
      ...me.state,
      attributes: [
        ...filtered,
        { name: "ONENTER", value: `u.send("Welcome back!");`, setter: "#" + me.id },
      ],
    },
  });
  u.send("ONENTER set on yourself.");
};
```

> **Important:** `u.db.modify` with `"$set"` and a `data:` key replaces the
> whole data block. Always spread `me.state` (or the target's state) so you
> don't wipe other fields. See the [Scripting Guide](/guides/scripting) for
> the full `u.db.modify` pattern.

### Read the raw array

```typescript
const attrs = (u.me.state.attributes || []) as Array<{ name: string; value: string }>;
const found = attrs.find(a => a.name.toLowerCase() === "short-desc");
if (found) u.send(`Your short-desc: ${found.value}`);
```

For most use cases, prefer `u.attr.get()` (see below) — it handles
case-insensitivity and parent inheritance automatically.

---

## Reading Attributes

### `u.attr.get(id, name): Promise<string | null>`

Reads the value of a named attribute from an object. Returns `null` if not set.
The name is **case-insensitive**. If the attribute is not on the object itself,
UrsaMU walks up the `data.parent` chain.

```typescript
export default async (u) => {
  const bio = await u.attr.get(u.me.id, "FINGER-INFO");
  if (bio) {
    u.send(bio);
  } else {
    u.send("No bio set. Use: &finger-info me=<text>");
  }
};
```

```typescript
// Read from any object by id
const sd = await u.attr.get(someObjectId, "SHORT-DESC");
```

---

## Running Attributes

### `u.trigger(id, attr, args?): Promise<void>`

Runs the attribute as a script. The script executes in its own sandbox with the
targeted object as context. The actor who called `u.trigger` does **not** become
the script's `u.me` — the object itself does. Returns when the script completes.

```typescript
// Fire the USE attribute on a chest the actor is looking at
await u.trigger(chestId, "USE", [u.me.id]);
```

Args are available in the triggered script as `u.cmd.args`.

### `u.eval(id, attr, args?): Promise<string>`

Like `u.trigger`, but captures and returns whatever the script sends as a
string. Useful for computed values.

```typescript
const formula = await u.eval(u.me.id, "SCORE-FORMULA", ["str"]);
u.send(`Your STR score: ${formula}`);
```

If the attribute is not found, `u.eval` returns `""`.

### `@trigger <object>/<attr>[=<args>]`

The in-game command version of `u.trigger`. Fires an attribute on any object the
actor can see or edit.

```
> @trigger chest/USE
Triggered script on chest/USE.

> @trigger here/ONENTER=Alice
Triggered script on here/ONENTER.
```

Arguments after `=` are split on whitespace and available as `u.cmd.args` in
the triggered script.

### Automatic hooks

Some attributes are fired automatically by the engine — no `@trigger` needed:

| Attribute | Fired on | Fired by |
|-----------|----------|---------|
| `ACONNECT` | player or master room | Player connects |
| `ADISCONNECT` | player or master room | Player disconnects |

`ACONNECT` and `ADISCONNECT` fire on the connecting player's own object first,
then on the master room (configured as `game.masterRoom`). The script runs with
the connected player as `u.me`.

---

## Common Attribute Names

These are conventions — UrsaMU does not enforce them (except `ACONNECT` and
`ADISCONNECT`, which are fired by the hooks system). Use them consistently so
other builders know what to expect.

| Attribute | Set on | Purpose |
|-----------|--------|---------|
| `ACONNECT` | player, master room | Script to run when the player connects |
| `ADISCONNECT` | player, master room | Script to run when the player disconnects |
| `ONENTER` | room | Fire when any player enters the room |
| `ONEXIT` | room | Fire when any player leaves the room |
| `USE` | thing | Fire when a player uses/activates the object |
| `OPEN` | container/exit | Fire when the object is opened |
| `CLOSE` | container/exit | Fire when the object is closed |
| `DROP` | thing | Fire when the object is dropped |
| `GET` | thing | Fire when the object is picked up |
| `SHORT-DESC` | player, thing | One-line description for room display and +finger |
| `FINGER-INFO` | player | Free-form bio shown in +finger |
| `SCORE-EXTRA` | player | Extra stat block appended to score output |
| `ODESC` | thing | Message broadcast to others when the thing is examined |
| `SCRIPT` | any | Generic script slot — fired by the command parser when an object handles a command |

> `ONENTER`, `ONEXIT`, `USE`, `OPEN`, `CLOSE`, `DROP`, and `GET` are
> **not** fired automatically by the core engine. They require either
> `@trigger` from a system script, or your own plugin/script to call
> `u.trigger()` at the right moment.

---

## Scripting Inside Attributes

Attribute values are full JavaScript/TypeScript scripts. They run inside the
same Web Worker sandbox as any other UrsaMU script with the full `u` API
available.

### Module format (recommended)

Export a default async function. This is the same format used in `system/scripts/`.

```typescript
export default async (u) => {
  u.send("Hello from an attribute!");
};
```

### Legacy block format

If the value does not contain an `export` statement, UrsaMU runs it as a block
(the code is executed directly, with `u` in scope).

```typescript
u.send("Hello from a legacy block!");
```

Both formats have access to the full `u` API.

### The `u` object in triggered attributes

When an attribute is fired via `u.trigger(id, attr)`:

- `u.me` — the object the attribute is set on (not the actor who called
  `u.trigger`)
- `u.here` — the room that object is in
- `u.cmd.name` — the attribute name in lowercase
- `u.cmd.args` — the args array passed to `u.trigger` / `@trigger`

When an attribute is fired via `u.eval(id, attr, args)`, the same rules apply
and the script's output (via `u.send`) is captured as the return value.

---

## Practical Examples

### Room that greets players on entry

Set this on a room. Call `u.trigger(room.id, "ONENTER", [actorId])` from a
movement hook or a custom `look` script:

```typescript
// &ONENTER The Tavern=#...
export default async (u) => {
  const actorId = u.cmd.args[0];
  const actor = actorId ? (await u.db.search(actorId))[0] : null;
  const name = actor ? String(actor.state.moniker || actor.state.name || "Someone") : "Someone";
  u.here.broadcast(`${name} pushes open the door and steps inside.`);
  u.send("The warmth of the fire and the smell of roasting meat greet you.");
};
```

### Object that does something when used

```typescript
// &USE Ancient Lever=#...
export default async (u) => {
  const actorId = u.cmd.args[0];
  u.here.broadcast("The lever grinds against stone with a horrible screech.");
  await u.teleport("secret-door-id", "open-room-id");
  u.send("You hear a door grinding open somewhere nearby.");
};
```

### Greeting script on player connect

```typescript
// &ACONNECT me=#...  (on a player)
export default async (u) => {
  const unread = (await u.mail.read({ to: { $in: [`#${u.me.id}`] } }))
    .filter(m => !m.data?.read).length;
  if (unread > 0) u.send(`You have ${unread} unread message${unread === 1 ? "" : "s"}.`);
};
```

### NPC that responds to being examined

```typescript
// &ODESC Town Guard=#...  (plain text — broadcast when examined)
// "snaps to attention and eyes you warily."
// The look script broadcasts: "<actor> snaps to attention and eyes you warily."
```

### Computed score field

```typescript
// &SCORE-FORMULA me=#...
export default (u) => {
  const str = Number(u.me.state.str) || 0;
  const bonus = Math.floor((str - 10) / 2);
  u.send(`${str} (${bonus >= 0 ? "+" : ""}${bonus})`);
};
```

Then from your score script or a `+sheet` command:

```typescript
const strDisplay = await u.eval(u.me.id, "SCORE-FORMULA");
u.send(`STR: ${strDisplay}`);
```

### Per-object data storage

Attributes don't have to hold scripts — they can hold plain data strings that
other scripts read with `u.attr.get`:

```typescript
// &PRICE Healing Potion=#...  (value: "50")
// &USES Healing Potion=#...   (value: "3")

export default async (u) => {
  const price = await u.attr.get(u.target!.id, "PRICE") || "0";
  const uses  = await u.attr.get(u.target!.id, "USES")  || "1";
  u.send(`Price: ${price} credits  (${uses} use${uses === "1" ? "" : "s"} remaining)`);
};
```
