+NOTES

Write character story notes (background, hooks, etc.).

SYNTAX
  +notes                     List your notes.
  +notes <name>              Read a named note.
  +notes/set <name>=<text>   Create or replace.
  +notes/del <name>          Delete a note.
  +notes/public <name>       Show on +sheet.
  +notes/private <name>      Hide from +sheet.

  Notes are private by default. Staff can always read them.

EXAMPLES
  +notes/set bg=Born in the bayou.
  +notes bg
  +notes/public bg
  +notes/del goals

SEE ALSO: +help chargen, +help sheet
