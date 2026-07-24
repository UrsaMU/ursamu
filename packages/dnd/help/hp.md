+hp  -- View or modify character hit points. (Alias: +health)

SYNTAX
  +hp [<player>]
  +hp/damage <n> [for <player>] (or +health/damage)
  +hp/heal <n> [for <player>]
  +hp/temp <n> [for <player>]

SWITCHES
  /damage    -- Reduce HP by N. Eats temporary HP first, then current HP.
  /heal      -- Recover N HP. Clamps to maximum HP.
  /temp      -- Grant N temporary HP (does not stack; takes the highest).

EXAMPLES
  +hp                           - View your current/max and temp HP.
  +hp/damage 10                 - Take 10 damage.
  +hp/heal 5                    - Heal 5 hit points.
  +hp/temp 8 for Marcus         - Grant Marcus 8 temporary HP (builder+).

SEE ALSO: help dnd, help sheet
