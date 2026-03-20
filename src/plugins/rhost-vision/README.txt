Rhost Vision Plugin for UrsaMU
==============================

A plugin that replaces default UrsaMU display commands with Rhost-style
formatting, making UrsaMU look and feel like RhostMUSH.

What it changes:

  look (room display):
  - Room headers use centered text with === borders (bright white)
  - Room descriptions are word-wrapped within the border width
  - Players section shows all connected players with idle time and short-desc
  - Idle time is color-coded: green (0-5m), gray (6-10m), dark gray (11m+)
  - Player names are bright white
  - Exits are split into "Locations" and "Directions" (auto-detected by name)
  - Exit names are bright white, aliases are cyan
  - Exits display in two-column format with alias shortcuts
  - Room dbrefs (#1, #2, etc.) are hidden from the room name
  - Footer uses === border (bright white)

  who (player list):
  - Columns: Player Name, On For, Idle, Doing
  - "On For" shows total connection time (HH:MM or Xd HH:MM)
  - Idle time is color-coded: green (0-5m), gray (6-10m), dark gray (11m+)
  - Player names are bright white
  - Sorted by most recent login first

  page (private messaging):
  - "Jupiter(J) pages: Hello!" instead of "pages you:"
  - "You paged Jupiter with 'Hello'." instead of "with: Hello"
  - Pose format: "From afar, Jupiter(J) waves"
  - Sender sees: "Long distance to Jupiter: Jupiter waves"

Files:
- index.ts             Plugin loader. On startup, backs up originals and
                       installs Rhost versions. On removal, restores originals.
- look.ts              Rhost-style room display.
- who.ts               Rhost-style WHO list.
- page.ts              Rhost-style page formatting.
- ursamu.plugin.json   Plugin metadata.
- README.txt           This file.

Installation:
1. Copy the rhost-vision folder into src/plugins/
2. Restart the game
3. The plugin auto-installs — no other steps needed

Removal:
1. Delete the rhost-vision folder from src/plugins/
2. Restart the game
3. Original scripts are restored from *.original.ts backups

Player commands:
- &short-desc me=<text>   Set your short description (shown in room)
- @doing <text>           Set your Doing message (shown in WHO)

Dependencies:
- None. Works with any UrsaMU v1.3+ installation.
