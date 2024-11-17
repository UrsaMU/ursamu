# Sheet Command

**Usage:** `+sheet [target]`

**Description:**\
The `sheet` command displays the complete character sheet for the specified
target. If no target is provided, it shows the user's own character sheet. The
character sheet includes detailed information such as bio, attributes, skills,
advantages, disciplines, health, and other pertinent details.

**Sections Included:**

- **Bio:** Provides a brief biography of the character.
- **Attributes:** Lists the character's physical, social, and mental attributes.
- **Skills:** Details the character's skills categorized into physical, social,
  and mental.
- **Advantages:** Showcases backgrounds, merits, and flaws associated with the
  character.
- **Disciplines:** Enumerates the disciplines the character possesses.
- **Health:** Displays the character's physical and mental health tracks.
- **Other:** Includes any additional stats or information relevant to the
  character.

**Examples:**

- `+sheet`\
  Displays your own character sheet.

- `+sheet player`\
  Displays the character sheet of the specified player (`player`).

- `+sheet playerName`\
  Displays the character sheet of the character named `playerName`.

**Permissions:**

- Users can view their own character sheets.
- Users with appropriate permissions (e.g., Storytellers) can view other
  players' character sheets.

**Notes:**

- Ensure that the target specified exists and has a splat set; otherwise, the
  command will prompt accordingly.
- The character's splat must be set to generate a comprehensive sheet. Refer to
  the `+splat` command if you need to set or update your splat.

For further assistance, use the `+help` command followed by the command name,
e.g., `+help sheet`.
