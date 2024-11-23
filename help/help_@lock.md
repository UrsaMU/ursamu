---
category: Building
---

# @LOCK Command

The @LOCK command allows you to set security locks on objects, rooms, and other
game entities. Locks control who can interact with objects or enter rooms.

## Syntax

`@lock <target>=<lock expression>` `@lock/list <target>` - View current locks
`@lock/delete <target>` - Remove all locks

## Lock Types

- Basic Lock: `@lock door=me` (Only you can use it)
- Flag Lock: `@lock door=WIZARD` (Only wizards can use it)
- Attribute Lock: `@lock door=level:5` (Must have level 5 or higher)
- Complex Lock: `@lock door=WIZARD|BUILDER` (Must be wizard OR builder)

## Examples

```
@lock box=me
@lock room=!GUEST
@lock/list here
@lock/delete door
```

## Lock Operators

- | (OR) - Either condition must be true
- & (AND) - Both conditions must be true
- ! (NOT) - Condition must be false

Note: Complex locks can be created by combining operators.

See also:

- help @flags (Setting object flags)
- help @unlock (Removing locks)
