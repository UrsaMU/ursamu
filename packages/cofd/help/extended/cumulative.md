extended cumulative  -- The /cum cumulative-penalty modifier.

Adding /cum to /start applies a cumulative penalty: each attempt
subtracts the count of attempts already made.

  Attempt #1     0 penalty
  Attempt #2     -1 dice
  Attempt #3     -2 dice
  Attempt #4     -3 dice
  ...            ...

Use /cum for tasks where each failed attempt actively makes the next
one harder (smashing a sturdy door, fighting infection, brute-forcing
a stuck lock). Tasks where progress is preserved between attempts
(researching a topic in a library) do not need /cum.

The /cum penalty stacks with any per-roll modifier passed to /roll,
and with the one-time dramatic-failure penalty. /wp and rote/again
all stack normally on top.

Example:
  +extended/start strength+stamina=15/6/hour/cum Force the cell door

See also: extended, extended pool
