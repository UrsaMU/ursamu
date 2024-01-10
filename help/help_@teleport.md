# `@teleport`

### Syntax

- `@teleport <target> = <destination>`

### Description

The `@teleport` command is used to teleport an object or player to a specified
destination within the game. It is available to players with 'connected builder'
level access or higher. The command requires specifying both the target to be
teleported and the destination location.

### Parameters

1. **target**: The name or identifier of the object or player to be teleported.
2. **destination**: The name or identifier of the destination location.

### Examples

- Teleport a player named John to a room called Castle:
  `@teleport John = Castle`
- Teleport an object with identifier #123 to a room with identifier #456:
  `@teleport #123 = #456`

### Additional Information

- The command provides feedback messages confirming the teleportation action,
  both to the teleporting user and to the involved locations (both source and
  destination).
- Appropriate permissions and access rights are required to use this command
  successfully.
- The command automatically updates the location data of the teleported object
  or player in the game's database.
