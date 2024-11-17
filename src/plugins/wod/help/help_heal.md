# +heal

## Syntax

`+heal <amount> <damage-type> [track-type] [target]`

## Description

Heals damage from a character's damage track. If no target is specified, heals
yourself.

## Parameters

- `amount`: Number of damage points to heal (must be positive)
- `damage-type`: Type of damage to heal
  - superficial: Heal superficial damage
  - aggravated: Heal aggravated damage
- `track-type`: (Optional, defaults to physical) The type of damage track to
  heal
  - physical: Physical damage track
  - social: Social damage track
  - mental: Mental damage track
- `target`: (Optional) The name or dbref of the target to heal

## Examples

```
+heal 1 superficial         (Heal 1 superficial physical damage from yourself)
+heal 2 aggravated physical (Heal 2 aggravated physical damage from yourself)
+heal 1 superficial mental  (Heal 1 superficial mental damage from yourself)
+heal 2 aggravated mental Bob (Heal 2 aggravated mental damage from Bob)
```

## Notes

- You can only heal positive amounts of damage
- You cannot heal more damage than exists on the specified track
- Healing is broadcast to the room where the healing occurs
- The system will prevent invalid healing attempts (like healing non-existent
  damage)
