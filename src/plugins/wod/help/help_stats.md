# Stats Command

**Usage:** `+stats [target/]<stat> = <value> [temp]`

**Description:**\
The `stats` command allows users to set or modify a character's statistics. You
can update a stat for your own character or for a specified target.
Additionally, by using the `temp` keyword, you can apply temporary changes that
do not persist permanently.

**Parameters:**

- **target/** (optional): Specify a target character by prefixing the stat with
  the target's identifier (e.g., `player`).
- **<stat>** (required): The name of the stat you wish to set or modify.
- **<value>** (required): The value to assign to the specified stat.
- **temp** (optional): Prefix the command with `temp` to apply a temporary
  change.

**Examples:**

- `+stats strength = 5`\
  Sets your own character's strength to 5.

- `+stats dexterity = 3`\
  Sets your own character's dexterity to 3.

- `+stats player/intelligence = 4`\
  Sets the specified player's intelligence to 4.

- `+stats temp stamina = 2`\
  Temporarily increases your own character's stamina by 2.

**Permissions:**

- **Users:** Can set or modify their own stats.
- **Admins/Storytellers:** Can set or modify stats for other players'
  characters.

**Notes:**

- **Target Specification:** To modify another character's stats, prepend the
  target's identifier followed by a slash. For example, `player/strength = 5`.
- **Temporary Changes:** Use the `temp` keyword to apply temporary
  modifications. Temporary stats do not persist and will reset under certain
  conditions as defined by the game mechanics.
- **Splat Requirement:** Ensure that the target character has a splat set before
  modifying stats. If the splat is not set, the command will prompt you to set
  it using the `+splat` command.
- **Error Handling:** The command will notify you if:
  - The target is invalid or does not exist.
  - The specified stat is invalid or does not exist.
  - You lack the necessary permissions to modify the target's stats.
  - Attempting to set a stat without the target having a splat.

**Related Commands:**

- `+splat`: Set or update your character's splat.
- `+stats/reset`: Reset a character's stats to their default values.

For further assistance, use the `+help` command followed by the command name,
e.g., `+help stats`.
