combat specified  -- Targeting a specific body part: penalties and Tilt
                    thresholds.

Syntax (via +attack):
  +attack/specified <target>=<bodypart>

Body part penalties and thresholds:

  Target    Pool Penalty   Tilt Triggered         Threshold
  --------  ------------   ---------------------  --------------------
  Torso     -1             none                   --
  Arm       -2             Arm Wrack              damage > Stamina
  Leg       -2             Leg Wrack              damage > Stamina
  Head      -3             Stunned                damage >= target Size
  Heart     -3             (special)              5+ damage points
  Hand      -4             Arm Wrack              any damaging hit
  Eye       -5             Blinded                any damaging hit

Heart shots:
  Dealing 5 or more points of damage to the heart has special effects
  for certain monstrous targets. Consult the relevant template rules.

Persistent Conditions after combat:
  Tilts are in-combat only. When combat ends, some Tilts upgrade to
  lasting Conditions:
    Blinded Tilt -> Blind Condition (awards 1 Beat when resolved).
  Other Tilts end with the scene unless the Storyteller rules otherwise.

More:
  help combat tilt-effects     Summary of body-part Tilt effects.

See also: combat modifiers, attack, health, condition
