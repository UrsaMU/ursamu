+TURN  -- Per-actor turn helpers (AI walker).

SYNTAX
  +turn/done                    Alias +combat/next.
  +turn/auto [<max-rounds>]     Builder+: pump rounds.
  +turn/reaction <posture> ...  Set reaction posture.

SWITCHES
  /done       End turn; AI until next PC.
  /auto       Batch NPC turns (default 10, max 50).
  /reaction   Posture for next round.

PERMISSIONS
  /done /reaction: in encounter. /auto: builder+.

EXAMPLES
  +turn/done
  +turn/auto 3
  +turn/reaction ambush

SEE ALSO: help turn/reaction, help combat
