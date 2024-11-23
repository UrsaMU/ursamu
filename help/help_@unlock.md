---
category: Building
---
# @UNLOCK Command

The @UNLOCK command removes security locks from objects, rooms, and other game entities.

## Syntax
`@unlock <target>` - Remove all locks from target
`@unlock/type <target>=<lock type>` - Remove specific lock type

## Examples
```
@unlock box
@unlock door
@unlock/type room=enter
```

## Lock Types
* basic - Basic security lock
* use - Usage lock
* enter - Entry lock (for rooms)
* page - Messaging lock
* parent - Inheritance lock

## Notes
* You must have appropriate permissions to unlock objects
* Some system locks cannot be removed
* Use @lock/list to view current locks before unlocking

See also:
- help @lock (Setting security locks)
- help @flags (Setting object flags)
