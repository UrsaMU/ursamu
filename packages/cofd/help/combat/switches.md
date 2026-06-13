combat/switches  -- Per-switch behavior for +combat. See help combat.

LIFECYCLE
  /start  Open encounter. One per room.
  /join   Add yourself before /begin.
  /leave  Remove yourself. Not on your own turn.
  /begin  Roll init and order. Re-rolling re-orders.
  /order  Show table (name, init, HP, turn marker).
  /next   End current turn; round loops; Defense resets.
  /end    Close encounter. Admin or opener.

PRE-COMBAT
  /ambush  Dex+Stealth vs Wits+Composure. Loser: no act/Defense T1.

ACTION HOLDING
  /delay   Mark Delayed; advance past slot. Reclaim with /act.
  /act     Reclaim held action. Order resumes after.

MOVEMENT
  /move  Up to Speed yards. Free.  /run  2x Speed, instant, -1 Def.

SEE ALSO: help combat, help combat/action-economy, help combat/delaying
