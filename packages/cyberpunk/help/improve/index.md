+IMPROVE

Spend Improvement Points (IP) to advance an edgerunner's skills or role rank.

SYNTAX
  +improve[/<switch>] [<argument>]

SWITCHES
  /balance             IP balance and all affordable advances.
                       Default when no switch is given.
  /skill <skillname>   Raise a skill by 1 rank.
                       Cost: `currentRank x 2` IP.
  /role                Raise role rank by 1.
                       Cost: `currentRank x 10` IP.

EXAMPLES
  +improve                   Show IP and spending options.
  +improve/skill athletics   Raise Athletics (rank 3→4 costs 6 IP).
  +improve/skill stealth     Raise Stealth by 1 rank.
  +improve/role              Raise role rank (rank 4→5 costs 40 IP).

SEE ALSO: +help improve/ip, +help sheet
