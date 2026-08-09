+MONEY

Multi-coin purse (cp, sp, ep, gp, pp). `gold` stays in sync
as gp-equivalent for vendor hooks.

SYNTAX
  +money [<player>]
  +money/add <n>[cp|sp|ep|gp|pp] [=player]
  +money/spend <n>[coin] [=player]

NOTES
  Default coin is gp. Spending converts higher denominations
  when needed.

EXAMPLES
  +money
  +money/add 50gp
  +money/spend 12sp
  +money/add 1pp=Alice

SEE ALSO: +help sheet, +help inventory
