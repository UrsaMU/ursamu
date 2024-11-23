---
category: Building
---

# CREATE Command

The CREATE command allows you to create new objects in the game world.

## Syntax

`create <object name>` - Create a basic object `create <object name>=<cost>` -
Create object with cost `create/type <object name>=<type>` - Create specific
type

## Object Types

- THING - Basic object
- EXIT - Room exit/connection
- ROOM - Game location
- CONTAINER - Object that can hold things

## Examples

```
create Wooden Sword
create Magic Ring=50
create/type Treasure Chest=CONTAINER
```

## Notes

- New objects are created in your inventory
- Objects can be further customized with @set and @describe
- Some object types may require special permissions
- Cost is deducted from your character's money

## Common Properties

- Objects can be picked up and dropped
- Objects can have descriptions
- Objects can be locked/unlocked
- Objects can have special behaviors

See also:

- help @describe (Setting descriptions)
- help @set (Setting attributes)
- help @lock (Setting security)
