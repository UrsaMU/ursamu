+DEBT  -- Goblin Debts from market credit (CtL).

SYNTAX
  +debt                      List open / called / paid.
  +debt/list                 Same.
  +debt/pay <id>             Mark paid after service.
  +debt/call <p> <id>=msg    Staff: call the debt in.
  +debt/clear <p> <id>       Staff: force clear.

NOTES
  Severity **1–5**. Open and called both count.
  Paying is RP-trust; staff enforce with /call.
  Also: +market/debt routes here.

EXAMPLES
  +debt
  +debt/pay 3a1b2c3d
  +debt/call Pix abc12345=Three silver teeth by dawn

SEE ALSO: help market, help hedge
