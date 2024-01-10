# `@dig`

### Syntax

- `@dig <room name>`
- `@dig <room name>=<to exit>`
- `@dig <room name>=<to exit>, <from exit>`
- `@dig/teleport <room name>`

### Description

The `@dig` command is used for creating new rooms within the game. It allows
players with the appropriate privileges (connected builders and above) to add
new rooms and optionally create exits to and from the new room. Using the
command with the `teleport` switch (`@dig/teleport`) will also teleport the
player to the newly created room.

### Parameters

1. **room name**: The name of the new room to create.
2. **to exit**: Optional. The name of the exit from the current room to the new
   room.
3. **from exit**: Optional. The name of the exit from the new room back to the
   current room.
4. **teleport**: Optional switch. Teleports the player to the new room upon
   creation.

### Examples

- Create a new room: `@dig Forest`
- Create a room with an exit to it: `@dig Forest=Path`
- Create a room with exits to and from it: `@dig Forest=Path, Back`
- Create a room and teleport to it: `@dig/teleport Forest`

### Additional Information

- When creating exits, you can separate multiple exit names with a semicolon
  (`;`).
