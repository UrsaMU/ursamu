---
category: Administration
---
# @FLAGS Command

The @FLAGS command is used to view and manage system flags on objects and characters. Flags control various behaviors and permissions in the system.

## Syntax
`@flags <target>` - View flags on target
`@flags/add <target>=<flag>` - Add a flag
`@flags/remove <target>=<flag>` - Remove a flag
`@flags/list` - List all available flags

## Common Flags
* WIZARD - Full administrative access
* BUILDER - Can create and modify rooms
* DARK - Object/character is hidden from most searches
* STICKY - Object stays in room when dropped
* HAVEN - Room where no combat is allowed

## Examples
```
@flags me
@flags/add box=DARK
@flags/remove here=HAVEN
@flags/list
```

## Options
* /add - Add a flag to target
* /remove - Remove a flag from target
* /list - Show all available flags

Note: Many flags require administrative privileges to set.

See also:
- help @lock (Setting object locks)
- help permissions (Understanding permission system)
