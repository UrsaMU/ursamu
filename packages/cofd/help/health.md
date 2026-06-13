+health  -- View or modify a Health track. Damage fills left to right;
            full track upgrades lighter damage to heavier, one box at
            a time.

SYNTAX
  +health [<player>]                  View track.
  +health/bash[<n>] [<player>]        Apply N bashing (default 1).
  +health/lethal[<n>] [<player>]      Apply N lethal.
  +health/agg[<n>] [<player>]         Apply N aggravated.
  +health/heal[<n>] [<player>]        Heal N, heaviest first.
  +health/heal-bash[<n>] [<player>]   Heal N bashing only.
  +health/heal-lethal[<n>] [<player>] Heal N lethal only.
  +health/heal-agg[<n>] [<player>]    Heal N aggravated only.

Append digits (no space) for amount: /bash3 = 3 bashing.
Damage/heal others requires canEdit (builder+).

EXAMPLES
  +health/bash    +health/lethal3    +health/agg2 Marcus

SEE ALSO: help health/wounds, help roll, help sheet
