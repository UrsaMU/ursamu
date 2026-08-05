---
layout: layout.vto
title: Attribute Scripts
description: Store TypeScript/JavaScript on object attributes and run them with @trigger, u.trigger, and u.eval.
---

# Attribute Scripts

**Attribute scripts** are TypeScript/JavaScript stored on
in-game objects as attributes, then fired with `@trigger`,
hooks, or `u.trigger` / `u.eval`. Same sandbox SDK as
`system/scripts/` — no server restart to change behavior.

This is **not** TinyMUX softcode. For MUX expressions
(`[add(1,2)]`, `%N`, `$greet *`), see the
[Softcode Guide](/guides/softcoding/).

For file-based commands, see the
[Scripting Guide](/guides/scripting/).

---

## What is an attribute script?

Every object has a `data.attributes` array. Each entry:

```typescript
interface IAttribute {
  name: string;    // e.g. "ONENTER"
  value: string;   // TS/JS script or plain text
  setter: string;  // dbref of whoever set it
  type?: string;
  hidden?: boolean;
}
```

When something fires the attribute (`@trigger`, a hook, or
`u.trigger()`), UrsaMU runs the value in a Web Worker with
a fresh `u` object — unless the attribute is flagged or
detected as **softcode**, in which case the MUX evaluator
runs instead.

**Why use attribute scripts instead of a system file?**

- Changes apply immediately — no restart, no redeploy.
- Builders with edit permission can customize objects they
  own.
- Behavior stays on the object (copy/move keeps it).
- Inheritance: missing attrs walk `data.parent`.

---

## Setting attributes in-game

```
&<ATTR-NAME> <object>=<value>
```

`<object>`: `me`, `here`, name, or `#dbref`. Names are
case-insensitive on lookup.

```
> &ONENTER here=u.send("The door creaks as you enter.");
Game> Lobby's attribute ONENTER set.

> &SHORT-DESC me=A tall woman in a grey cloak.
Game> Alice's attribute SHORT-DESC set.
```

Clear by omitting the value:

```
> &ONENTER here=
Game> Lobby's attribute ONENTER removed.
```

You must be able to **edit** the target (owner, or
`admin` / `wizard` / `superuser`).

### `@set` attribute form

```
@set <object>/<ATTR>=<value>
@set <object>/<ATTR>=
```

Equivalent to `&ATTR obj=value` for data storage.
`@set obj=<FLAG>` (no `/`) sets a **flag**, not an
attribute.

---

## Setting attributes from scripts

Spread existing data so you do not wipe sibling fields:

```typescript
export default async (u) => {
  const me = u.me;
  const existing = (me.state.attributes || []) as Array<{
    name: string; value: string; setter: string;
  }>;
  const filtered = existing.filter(
    (a) => a.name.toLowerCase() !== "onenter",
  );

  await u.db.modify(me.id, "$set", {
    data: {
      ...me.state,
      attributes: [
        ...filtered,
        {
          name: "ONENTER",
          value: `u.send("Welcome back!");`,
          setter: "#" + me.id,
        },
      ],
    },
  });
  u.send("ONENTER set on yourself.");
};
```

Prefer `u.attr.get()` for reads (inheritance + case fold).

```typescript
const bio = await u.attr.get(u.me.id, "FINGER-INFO");
```

---

## Running attributes

### `u.trigger(id, attr, args?)`

Runs the attribute as a script. The **object** is `u.me`
in the child run (not the caller). Args → `u.cmd.args`.

```typescript
await u.trigger(chestId, "USE", [u.me.id]);
```

### `u.eval(id, attr, args?)`

Like trigger, but returns captured `u.send` output as a
string. Missing attr → `""`.

```typescript
const formula = await u.eval(u.me.id, "SCORE-FORMULA", ["str"]);
u.send(`Your STR score: ${formula}`);
```

### `@trigger <object>/<attr>[=<args>]`

```
> @trigger chest/USE
> @trigger here/ONENTER=Alice
```

### Automatic hooks

| Attribute | Fired on | When |
|-----------|----------|------|
| `ACONNECT` | player, then master room | connect |
| `ADISCONNECT` | player, then master room | disconnect |

Script runs with the connecting player as `u.me`.

---

## Common attribute names

Conventions only (except `ACONNECT` / `ADISCONNECT`):

| Attribute | Set on | Purpose |
|-----------|--------|---------|
| `ACONNECT` | player, master room | on connect |
| `ADISCONNECT` | player, master room | on disconnect |
| `ONENTER` / `ONEXIT` | room | enter/leave (manual trigger) |
| `USE` / `OPEN` / `CLOSE` | thing | activation (manual) |
| `DROP` / `GET` | thing | inventory events (manual) |
| `SHORT-DESC` | player, thing | one-line desc |
| `FINGER-INFO` | player | +finger bio |
| `ODESC` | thing | others see on examine |
| `SCRIPT` | any | generic command slot |

`ONENTER`, `USE`, etc. are **not** auto-fired by core
unless a plugin or script calls `u.trigger`.

---

## Script formats inside attributes

### Module (recommended)

```typescript
export default async (u) => {
  u.send("Hello from an attribute!");
};
```

### Legacy block

No `export` — executed with `u` in scope:

```typescript
u.send("Hello from a legacy block!");
```

### Context when triggered

- `u.me` — object holding the attribute
- `u.here` — that object’s room
- `u.cmd.name` — attribute name (lowercase)
- `u.cmd.args` — args from `@trigger` / `u.trigger`

---

## Practical examples

### Room greet (call from a move hook)

```typescript
// &ONENTER The Tavern=...
export default async (u) => {
  const actorId = u.cmd.args[0];
  const actor = actorId
    ? (await u.db.search(actorId))[0]
    : null;
  const name = actor
    ? String(actor.state.moniker || actor.state.name || "Someone")
    : "Someone";
  u.here.broadcast(
    `${name} pushes open the door and steps inside.`,
  );
  u.send(
    "The warmth of the fire and the smell of roasting meat greet you.",
  );
};
```

### Object USE

```typescript
export default async (u) => {
  u.here.broadcast(
    "The lever grinds against stone with a horrible screech.",
  );
  await u.teleport("secret-door-id", "open-room-id");
  u.send("You hear a door grinding open somewhere nearby.");
};
```

### ACONNECT mail ping

```typescript
export default async (u) => {
  const unread = (
    await u.mail.read({ to: { $in: [`#${u.me.id}`] } })
  ).filter((m) => !m.data?.read).length;
  if (unread > 0) {
    u.send(
      `You have ${unread} unread message${unread === 1 ? "" : "s"}.`,
    );
  }
};
```

### Computed field via `u.eval`

```typescript
// &SCORE-FORMULA me=...
export default (u) => {
  const str = Number(u.me.state.str) || 0;
  const bonus = Math.floor((str - 10) / 2);
  u.send(`${str} (${bonus >= 0 ? "+" : ""}${bonus})`);
};
```

```typescript
const strDisplay = await u.eval(u.me.id, "SCORE-FORMULA");
u.send(`STR: ${strDisplay}`);
```

### Plain data attributes

```typescript
const price = await u.attr.get(u.target!.id, "PRICE") || "0";
const uses = await u.attr.get(u.target!.id, "USES") || "1";
u.send(`Price: ${price} credits (${uses} uses left)`);
```

---

## Softcode on the same object

You can mix TS attributes and softcode attributes. Mark
MUX code explicitly:

```
&GREET/softcode me=[name(%#)] greets you!
```

Details: [Softcode Guide](/guides/softcoding/).

---

## See also

- [Softcode Guide](/guides/softcoding/) — pure TinyMUX
- [Scripting Guide](/guides/scripting/) — file sandbox
- [SDK Cookbook](/guides/sdk-cookbook/) — `u.*` reference
- [Recipes](/guides/recipes/) — copy-paste patterns
