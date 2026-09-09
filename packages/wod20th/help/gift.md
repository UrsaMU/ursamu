GIFT -- Werewolf gifts

  Garou supernatural powers. Each gift has a level (1-5). Most gifts now
  carry action data: a roll, a cost (Gnosis/Willpower/Rage), a duration,
  and a mechanical effect. Gifts without action data fall back to
  spending Gnosis equal to their level. Cannot be used while frenzied.

SYNTAX
  +gift                       List gifts your character knows.
  +gift/list [<level>]        List the catalog; optional level filter.
  +gift/info <slug>           Details for a single gift.
  +gift/use <slug>            Activate a known gift.

SWITCHES
  /list      Filter to a single level 1..5.
  /info      Show name, level, and source pools (breed/auspice/tribe).
  /use       Pay cost, roll declared pool, fire hook, pose the room.

EXAMPLES
  +gift/use mothers-touch     Rolls Int+Empathy diff 6, spends 1 Gnosis,
                              heals one level of bashing/lethal per success.
  +gift/use razor-claws       Rolls Dex+Primal-Urge, spends 1 Rage,
                              claws gain +1 damage for the scene.

SEE ALSO: +help rage, +help gnosis, +help frenzy, +help xp
