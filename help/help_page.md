# `page` (Alias: `p`)

### Syntax

- `page <target>=<message>`
- `page <message>`
- `p <target>=<message>`
- `p <message>`

### Description

The `page` command is used for sending private messages to other players in the
game. It allows you to communicate with one or more players by specifying their
names. The command interprets messages differently based on the use of `;` or
`:`. Using `;` directly attached to the message (no space) sends a message in
the form "Targetmessage" (e.g., "Johnwaves"). Starting a message with `:`
followed by a space results in an action-style message (e.g., "Jane is reading a
book"). If no target is given, the command defaults to replying to the last
received page.

### Examples

- Standard message to a single player: `page John=Hello, are you there?`
- Page another player with a specific message: `p Jane=Join me for a quest?`
- Send a unique format message: `page John ;waves` results in "Johnwaves".
- Action-style message: `p Jane :is reading a book` leads to "Jane is reading a
  book".
- Reply to the last page: `page I'll be there soon!`
