# `@destroy`

### Syntax

- `@destroy <object name>`
- `@destroy/override <object name>`

### Description

The `@destroy` command is utilized to remove objects from the game. It is
accessible to players with 'connected builder' level access or higher. The
command requires specifying the name of the object to be destroyed. An optional
`/override` switch can be used to force the destruction of objects marked as
'safe'.

### Parameters

1. **object name**: The name or identifier of the object to be destroyed.
2. **override (optional)**: A switch to bypass safety checks on objects marked
   as 'safe'. Use this with caution.

### Examples

- Destroy an object named 'Old Sword': `@destroy Old Sword`
- Forcefully destroy a 'safe' object: `@destroy/override Ancient Relic`

### Additional Information

- The command checks for permissions and edit rights before destroying an
  object. If the player lacks the necessary permissions or the object is
  protected, a warning message is issued.
- Special objects like 'the void' cannot be destroyed.
- If a player is in a location that's being destroyed, they are automatically
  sent back to their home location.
- Any exits associated with the destroyed object are also removed to avoid
  orphaned exits.
