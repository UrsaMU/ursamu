---
layout: layout.vto
title: Lock Expressions
description: Reference guide for UrsaMU's lock expression syntax — built-in lockfuncs, boolean operators, indirect locks, and custom lockfunc registration.
---

# Lock Expressions

Lock expressions control access to commands, exits, and objects. They appear in
three places:

- The `lock` field of a command definition: `lock: "connected && perm(builder)"`
- The in-game `@lock` command: `@lock north=flag(admin)`
- The SDK `u.checkLock()` method in scripts

An empty or absent lock always passes. Locks are **fail-closed**: an unknown
lockfunc or a runtime error in a lockfunc evaluates to `false`. Maximum lock
string length is 4096 characters / 256 tokens.
---

## Quick Examples

```
"connected"                           -- any logged-in actor
"flag(admin)"                         -- has the admin flag
"connected && perm(builder)"          -- logged in AND builder level or higher
"flag(admin) || flag(wizard)"         -- admin OR wizard
"!flag(dark)"                         -- does NOT have the dark flag
"connected && (flag(admin) || flag(builder))"
"attr(tribe, glasswalker)"            -- state.tribe === "glasswalker"
"is(#5)"                              -- actor is object #5
"holds(#12)"                          -- actor's inventory includes #12
```
---

## Built-in Lockfuncs

Lockfuncs are functions called against the enactor. They take zero or more
arguments and return a boolean.

| Lockfunc | Example | Passes when |
|----------|---------|-------------|
| `flag(name)` | `flag(wizard)` | enactor has the named flag |
| `attr(name)` | `attr(tribe)` | enactor.state has own-property `name` |
| `attr(name, value)` | `attr(class, warrior)` | `state[name] === value` (case-insensitive key) |
| `type(name)` | `type(player)` | enactor has the type flag (player/room/thing/exit) |
| `is(#id)` | `is(#5)` | enactor's dbref is `#5` |
| `holds(#id)` | `holds(#12)` | enactor's inventory includes `#12` |
| `perm(level)` | `perm(admin)` | enactor passes the privilege check for `level` |

The legacy plain-flag form is still supported: `"admin"` is equivalent to
`flag(admin)`, and a trailing `+` (`builder+`) is equivalent to
`perm(builder)`.

### `perm()` levels

`perm()` is the recommended way to check minimum permission level because it
walks the flag ladder. Higher levels satisfy lower-level checks.

| Level | Passes for |
|-------|-----------|
| `perm(player)` | player, builder, storyteller, admin, wizard, superuser |
| `perm(builder)` | builder, storyteller, admin, wizard, superuser |
| `perm(admin)` | admin, wizard, superuser |
| `perm(wizard)` | wizard, superuser |
| `perm(superuser)` | superuser only |

### Special tokens

| Token | Meaning |
|-------|---------|
| `connected` | enactor is logged in (has the `connected` flag) |
---

## Boolean Operators

Lock expressions support full boolean algebra. Precedence (highest first):

1. `!` — NOT (prefix)
2. `&&` — AND
3. `||` — OR
4. `( )` — Grouping (overrides precedence)

```
"!flag(superuser)"
"connected && perm(admin)"
"flag(admin) || flag(wizard)"
"connected && (flag(admin) || flag(builder))"
```

### Legacy `&` / `|`

The single-character operators `&` (AND) and `|` (OR) from earlier UrsaMU
releases still work as aliases for `&&` / `||`. New code should prefer the
two-character forms — they are unambiguous around lockfunc names that contain
underscores or dashes.
---

## Indirect Locks

Prefix `@` to delegate the lock check to the lock stored on another object.

```
"@#10"     -- evaluate the lock stored on object #10
"@vault"   -- evaluate the lock on the object named "vault"
```

Indirect locks are recursion-protected (maximum depth 10).
---

## Registering a Custom Lockfunc

Plugins can register their own lockfuncs via `registerLockFunc`. Built-in
names (`flag`, `attr`, `type`, `is`, `holds`, `perm`) are protected and cannot
be overwritten.

```typescript
import { registerLockFunc } from "jsr:@ursamu/ursamu";

registerLockFunc("tribe", (enactor, _target, args) =>
  String(enactor.state.tribe ?? "").toLowerCase() === args[0]?.toLowerCase()
);
```

Once registered, the function is available everywhere locks are evaluated:

```
lock: "tribe(glasswalker)"
lock: "perm(admin) || tribe(glasswalker)"
lock: "connected && !tribe(banished)"
```

**Signature:**

```typescript
registerLockFunc(
  name: string,
  fn: (enactor: IDBObj, target: IDBObj | null, args: string[]) => boolean
): void;
```

Locks fail closed — return `false` on missing data or invalid input, and the
engine itself catches thrown errors.
---

## Using Locks in Scripts

The SDK exposes `u.checkLock()` to evaluate a lock expression from a script:

```typescript
const canEnter = await u.checkLock(targetRoom, "connected && perm(builder)");
if (!canEnter) {
  u.send("You don't have permission to enter.");
  return;
}
```

**Signature:**

```typescript
u.checkLock(target: string | IDBObj, lock: string): Promise<boolean>;
```

- `target` — the object whose perspective resolves `@indirect` locks
- `lock` — any valid lock expression string
---

## Quick Reference

| Expression | Meaning |
|------------|---------|
| `""` | Always passes (open) |
| `"connected"` | Actor is logged in |
| `"flag(admin)"` | Actor has the admin flag |
| `"perm(builder)"` | Builder level or higher |
| `"perm(admin)"` | Admin level or higher |
| `"!flag(dark)"` | Actor does NOT have the dark flag |
| `"flag(admin) \|\| flag(wizard)"` | Admin or wizard |
| `"connected && perm(admin)"` | Logged in AND admin or higher |
| `"connected && (flag(admin) \|\| flag(builder))"` | Logged in AND (admin or builder) |
| `"is(#5)"` | Actor is object #5 |
| `"holds(#12)"` | Actor's inventory includes #12 |
| `"attr(class, warrior)"` | Actor's `class` attribute is `warrior` |
| `"@#10"` | Delegates to the lock on object #10 |
