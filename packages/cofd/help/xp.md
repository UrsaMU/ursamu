+xp  -- View Experience pools, spend XP to raise traits, or list the
        cost table. Standard and Arcane Experience are separate ledgers.

Syntax:
  +xp                                      View your own pools.
  +xp <player>                             View another player's pools.
  +xp/spend <trait>=<targetDots>           Spend XP to raise a trait.
  +xp/spend <trait>=<dots> for <player>    Spend XP on another sheet.
  +xp/list                                 Show the XP cost table.

Switches:
  /spend     Raise the named trait to the target dot count. Charges the
             cumulative per-dot cost from current rating up to the
             target, drawn from Standard or Arcane XP.
  /list      Print the cost table.

Permissions:
  View                connected.
  Spend on self       connected.
  Spend on other      connected + canEdit (builder+).

Examples:
  +xp                              View your pools.
  +xp/spend strength=3             Raise Strength to 3 (8 XP).
  +xp/spend athletics=2            Raise Athletics to 2 (4 XP).
  +xp/spend vigor=2 for Marcus     Raise Marcus's Vigor (builder+).
  +xp/list                         Show the cost table.

More:
  help xp costs                    Full cost table and spending rules.

See also: beat, sheet, cofd
