---
dark: true
---
See also: help gear (overview)

+GEAR TOKENS  -- Hedgespun gear and mystical items.

SYNTAX
  +token <token_name_or_number>
  +token/catch <token_name_or_number>
  +token/create <name>=<rating>/<catch>/<drawback> [for <p>]

RULES
  Creating a token requires Staff/Builder permissions.
  Activating a token spends 1 Glamour. Using `/catch` bypasses this.
  Activation always triggers the token's Drawback.
  **Wyrd Glamour limit**: In active combat, token activation counts
  against your per-turn Glamour spend limit. `/catch` ignores the cap.

EXAMPLES
  +token/create Golden Apple=3/Eat a worm/Get paranoid
  +token Golden Apple
  +token/catch 1

SEE ALSO: help gear, help changeling
