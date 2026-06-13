+prove  -- Show your trait values to another player or the whole room.
          Players cannot see each others' sheets, so +prove is the
          tamper-evident way to surface specific traits in play. Output
          is a PROVE>> system line built from your live sheet and
          cannot be faked with @emit or pose.

Syntax:
  +prove <trait>                         Broadcast one trait to the room.
  +prove <trait>,<trait>,...             Broadcast a comma-separated list.
  +prove <trait>[,<trait>]=<player>      Whisper to one player.
  +prove/here <trait>[,<trait>]          Force a room broadcast.

Switches:
  /here     Always broadcast to the room (default when no =<player>).

Permissions:
  Use            connected.
  Cannot prove   another player's sheet -- +prove only reads your own.

Examples:
  +prove strength                          Broadcast Strength to the room.
  +prove strength,athletics,brawl/boxing   Broadcast three traits.
  +prove subterfuge=Marcus                 Whisper Subterfuge to Marcus.
  +prove vigor,blood potency=Lyra          Whisper two supernatural traits.
  +prove/here resolve,composure            Explicit room broadcast.
  +prove weapon                            Show your equipped weapon.
  +prove armor,gear=Marcus                 Whisper armor and inventory.

More:
  help prove traits      Accepted trait vocabulary and limits.

See also: sheet, roll, gear, cofd
