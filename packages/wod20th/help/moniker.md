@MONIKER

  Set a player's displayed name (staff only).

SYNTAX
  @moniker <player>=<name>   Set a player's moniker.

  The plain text of the moniker must match the target's login name
  exactly (case-insensitive). Color codes are stripped for comparison.
  Use MUSH color codes for colored names. Always close with %cn.

EXAMPLES
  @moniker Alice=%ch%crAlice%cn    Bold red moniker for Alice.
  @moniker me=%chSelf%cn           Set your own moniker (staff only).

SEE ALSO: +help sheet, +help wod20th
