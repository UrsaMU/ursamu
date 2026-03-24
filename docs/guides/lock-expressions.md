---
layout: layout.vto
title: Lock Expressions
description: Reference guide for UrsaMU's lock expression syntax — controlling access to commands, objects, and exits.
---

# Lock Expressions

Lock expressions control access to commands, exits, and objects. They appear in
three places:

- The `lock` field of a command definition: `lock: "connected & builder+"`
- The in-game `@lock` command: `@lock north=admin`
- The SDK `u.checkLock()` method in scripts

An empty or absent lock always passes — the object or command is accessible to
everyone, including unauthenticated connections.
---

## Flag Checks

The simplest lock is a single flag name. It passes if the actor has that flag
set on their object.

```
"connected"        -- actor must be logged in
"player"           -- actor must be a player
"builder"          -- actor must have the builder flag
"admin"            -- actor must have the admin flag
"wizard"           -- actor must have the wizard flag
"superuser"        -- actor must have the superuser flag
```

### Level-based checks (`flag+`)

Append `+` to a flag name to mean *that level or any higher level*. Because
flags have numeric levels, `builder+` passes for builders, storytellers, admins,
wizards, and superusers alike.

| Expression | Passes for |
|------------|-----------|
| `player` | `player` only |
| `player+` | `player`, `builder`, `storyteller`, `admin`, `wizard`, `superuser` |
| `builder` | `builder` only |
| `builder+` | `builder`, `storyteller`, `admin`, `wizard`, `superuser` |
| `admin+` | `admin`, `wizard`, `superuser` |

> **Note:** `connected` has no numeric level — use it without `+`.
---

## Boolean Operators

Lock expressions support full boolean algebra. Operators evaluate with the
following precedence (highest first):

1. `!` — NOT (prefix)
2. `&` — AND
3. `|` — OR
4. `( )` — Grouping (overrides precedence)

```
"!superuser"                     -- actor does NOT have superuser
"connected & admin+"             -- connected AND admin or higher
"admin | wizard"                 -- admin OR wizard
"connected & (admin | builder)"  -- connected AND (admin or builder)
"!player"                        -- actor is not a player (e.g. a guest or object)
```

### Combining connected with a flag

A common pattern: require login *and* a minimum permission level.

```
"connected & admin+"   -- most staff commands
"connected & builder+" -- building commands
"connected"            -- any logged-in player
```
---

## DB Reference Checks

Use `#id` to restrict access to a specific database object.

```
"#1"              -- passes only if the actor IS object #1
"connected & #5"  -- connected AND the actor is object #5
```

This is useful for owner-only exits or objects that only a specific character
should be able to use.
---

## Attribute Checks

Check a value stored in an actor's `state` (attributes). The syntax is
`attribute:value`.

```
"sex:Male"          -- actor's 'sex' attribute equals "Male" (case-insensitive key)
"class:Warrior"     -- actor's 'class' attribute equals "Warrior"
```

Numeric attributes support comparison operators:

```
"level:>5"     -- actor's 'level' is greater than 5
"level:>=10"   -- actor's 'level' is 10 or more
"gold:<100"    -- actor's 'gold' is less than 100
"gold:<=50"    -- actor's 'gold' is 50 or less
```

Attribute names are case-insensitive. Values are compared as strings unless a
comparison operator is present, in which case they're parsed as numbers.
---

## Indirect Locks

Prefix `@` to delegate the lock check to the lock stored on another object.
This lets you centralise a lock definition and point many commands at it.

```
"@#10"     -- evaluate the lock on object #10
"@vault"   -- evaluate the lock on the object named "vault"
```

Indirect locks are recursion-protected (maximum depth 10) to prevent cycles.
---

## Script Checks

Embed inline script code between `[` and `]`. The lock passes if the code
returns a truthy value.

```
"[u.me.state.karma > 50]"
"[await u.db.get(u.me.id) !== undefined]"
```

Script locks have access to the `u` SDK object in scope. Use sparingly — they
run synchronously inside the lock check and should be fast.
---

## Using Locks in Scripts

The SDK exposes `u.checkLock()` to evaluate a lock expression from inside a
script:

```typescript
// Check if an actor passes a lock
const canEnter = await u.checkLock(targetRoom, "connected & builder+");

if (!canEnter) {
  u.send("You don't have permission to enter.");
  return;
}
```

**Signature:**

```typescript
u.checkLock(target: string | IDBObj, lock: string): Promise<boolean>
```

- `target` — the object whose perspective is used to resolve `@indirect` locks
- `lock` — any valid lock expression string
---

## Quick Reference

| Expression | Meaning |
|------------|---------|
| `""` | Always passes (open) |
| `"connected"` | Actor is logged in |
| `"player"` | Actor has the player flag |
| `"builder+"` | Builder level or higher |
| `"admin+"` | Admin level or higher |
| `"superuser"` | Superuser only |
| `"!admin"` | Actor is NOT an admin |
| `"admin \| wizard"` | Admin or wizard |
| `"connected & admin+"` | Logged in AND admin+ |
| `"connected & (admin \| builder)"` | Logged in AND (admin or builder) |
| `"#5"` | Actor is object #5 |
| `"sex:Female"` | Actor's sex attribute is "Female" |
| `"level:>=10"` | Actor's level attribute is ≥ 10 |
| `"@#10"` | Delegates to the lock on object #10 |
| `"[u.me.state.vip]"` | Passes if actor's vip state is truthy |
