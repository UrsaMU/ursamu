+DEBT  -- Goblin Debts from market credit (CtL).

SYNTAX
  +debt                      List open / called / paid.
  +debt/pay <id>             Mark paid after service.
  +debt/call <p> <id>=msg    Staff: call the debt in.
  +debt/clear <p> <id>       Staff: force clear.

NOTES
  Severity is **1–5**. Open and called both count.
  Called debts show the demand text. Paying is
  RP-trust; staff enforce with **+debt/call**.

EXAMPLES
  +debt
  +debt/pay 3a1b2c3d
  +debt/call Pix abc12345=Three silver teeth by dawn

SEE ALSO: help market, help hedge
