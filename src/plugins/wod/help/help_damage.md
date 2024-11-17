# +damage

## Syntax

`+damage <target>/<type>=<amount><damage-type>`
`+damage <type>=<amount><damage-type>`

## Description

Inflicts damage on a character's health track. If no target is specified,
applies damage to yourself.

## Parameters

- `target`: (Optional) The name or dbref of the target character
- `type`: The type of damage track to affect
  - physical: Physical damage track
  - mental: Mental damage track
- `amount`: Number of damage points to inflict
- `damage-type`: Type of damage to apply
  - s/superficial: Superficial damage
  - a/aggravated: Aggravated damage

## Permission

- Players can only damage themselves
- Storytellers can damage any character

## Examples

```
+damage physical=1s      (Apply 1 superficial physical damage to yourself)
+damage mental=2a       (Apply 2 aggravated mental damage to yourself)
+damage Bob/physical=1s (Apply 1 superficial physical damage to Bob - ST only)
+damage Jane/mental=2a  (Apply 2 aggravated mental damage to Jane - ST only)
```

## Notes

- Damage accumulates and can lead to different status effects
- Superficial damage is less severe than aggravated damage
- The system will automatically calculate and apply appropriate status effects
  based on total damage
