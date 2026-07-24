+roll  -- Roll ability/skill checks, saves, initiative, and custom formulas.

SYNTAX
  +roll <expression>
  +roll/<switch> <expression>

SWITCHES
  /adv   -- Roll with Advantage (take the highest of 2 d20s).
  /dis   -- Roll with Disadvantage (take the lowest of 2 d20s).
  /init  -- Roll initiative (d20 + Dex modifier).

EXPRESSIONS
  Ability check:
    +roll strength
    +roll dex
  Skill check:
    +roll athletics
    +roll/adv stealth
  Saving throw:
    +roll save constitution
    +roll/dis save wis
  Custom formula:
    +roll 1d20+5
    +roll 2d6+3

SEE ALSO: help dnd, help sheet
