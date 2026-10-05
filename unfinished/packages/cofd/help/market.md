+MARKET  -- Goblin Markets: fruit, tokens, credit.

SYNTAX
  +market                    Browse stalls in this room.
  +market/catalog [filter]   Full goods catalog.
  +market/buy <slug>         Pay Glamour.
  +market/buy <slug> debt    Same as /credit.
  +market/credit <slug>      Buy on credit (Debt).

BUILDER
  +market/create <name>      Open market here.
  +market/stock <slug> <n>   Stock (−1 unlimited).
  +market/open | /close
  +market/destroy [id]
  +market/list

NOTES
  Prices: `NG` Glamour, optional `debtN`. Credit
  writes Goblin Debt on your sheet.

SEE ALSO: help debt, help hedge, help fruit, help market/examples