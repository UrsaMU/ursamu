+MARKET  -- Goblin Markets: buy fruit, tokens, credit.

SYNTAX
  +market                    Browse stalls in this room.
  +market/catalog [filter]   Full goods catalog.
  +market/buy <slug> [debt]  Pay Glamour (or take Debt).
  +market/credit <slug>      Buy on credit (Goblin Debt).

BUILDER
  +market/create <name>      Open market here.
  +market/stock <slug> <n>   Stock (−1 unlimited).
  +market/open|/close
  +market/destroy [id]
  +market/list

EXAMPLES
  +market
  +market/buy amaranthine
  +market/credit trifle-token

SEE ALSO: help debt, help hedge, help perception
