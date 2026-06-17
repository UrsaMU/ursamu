extended pool  -- Pool expressions, targets, and attempt caps.

Configuring an Extended Action with /start:

  Pool       Same expression syntax as +roll (e.g. intelligence+occult).
  Target     1..50 successes you must accumulate.
  Max rolls  1..50 attempts. Default = Resolve + Composure.
  Interval   turn / hour / day / scene (default scene). Narrative only --
             the engine does not enforce real time.

Auto-resolution after every /roll:
  accumulated >= target   -> succeeded.
  attempts >= maxRolls    -> failed.

Dramatic failure:
  A dramatic failure injects a one-time -2 on the next attempt. The
  penalty clears after that next /roll regardless of the result.

Modifiers per attempt:
  +extended/roll [<extra-mod>]   Optional signed dice modifier.
  +extended/roll/wp              Spend 1 Willpower for +3 dice.
  +extended/roll/rote            Reroll initial failures once.
  +extended/roll/9again          Lower again-threshold to 9.
  +extended/roll/8again          Lower again-threshold to 8.
  +extended/roll/job=N           Post the roll results directly to Job #N.

See also: extended, extended cumulative, roll
