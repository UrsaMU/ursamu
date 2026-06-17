---
topic: "action-attrs"
section: building
aliases: ["action-attributes", "hooks"]
---

# Action Attrs

Objects trigger softcode automatically when players interact with them.

## Notes
- Plain (`SUCC`) — sent to the actor.
- `O`-prefix (`OSUCC`) — broadcast to the room, excluding actor.
- `A`-prefix (`ASUCC`) — sent to the object's owner.

| Event    | Attributes                              |
|----------|-----------------------------------------|
| Get/Give | `SUCC` `OSUCC` `ASUCC` `FAIL` `OFAIL` `AFAIL` |
| Drop     | `DROP` `ODROP` `ADROP`                  |
| Use      | `USE` `OUSE` `AUSE` `FAIL` `OFAIL` `AFAIL`     |
| Movement | `ENTER` `OENTER` `AENTER` `LEAVE` `OLEAVE` `ALEAVE` |
| Look     | `IDESC` `ODESC`                         |
| Connect  | `ACONNECT` `ADISCONNECT`                |

## See Also
  `use`, `@lock`, `@set`
