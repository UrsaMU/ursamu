# `@open`

### Syntax

- `@open <exit name> = <destination room>`

### Description

The `@open` command allows players with 'connected builder' level access or
higher to create exits in the game. This command is used to make a new exit from
the player's current location to a specified destination room.

### Parameters

1. **exit name**: The name for the new exit to be created.
2. **destination room**: The name or identifier of the room where the exit
   leads.

### Examples

- Open an exit named 'Door' leading to a room called 'Castle':
  `@open Door = Castle`
- Create an exit 'Gate' leading to room #123: `@open Gate = #123`

### Additional Information

- The command checks if the destination room exists before creating the exit. If
  the room cannot be found, a warning message is sent.
- The newly created exit is associated with the player's current location as its
  starting point.
- The command confirms the creation of the exit and its destination, providing
  feedback to the user.
