+roll  -- Roll a CoFD 2e dice pool. d10s, 8/9/10 are successes, with
         optional n-again, rote, and Willpower spend.

SYNTAX
  +roll <expression>
  +roll/<switch>[/<switch>...] <expression>

  Switches may be comma-separated:
    +roll/wp,rote,9again Stamina+Athletics

SWITCHES
  /wp       Spend 1 Willpower for +3 dice.
  /rote     Reroll every failed die (1-7) once.
  /9again   Reroll any 9 or 10.
  /8again   Reroll any 8, 9, or 10.

EXAMPLES
  +roll Strength+Brawl
  +roll/wp Resolve+Composure
  +roll/rote Wits+Investigation

SEE ALSO: help roll/expressions, help roll/successes, help cg, help sheet
