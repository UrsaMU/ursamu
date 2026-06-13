attack damage  -- Damage formula and lethal vs bashing.

Damage:
  Damage = successes rolled + weapon modifier.

Default damage type:
  All weapons deal lethal damage by default. Unarmed brawl attacks
  deal bashing damage.

Pulling a blow:
  /pull <n> caps damage at n points. With weapons, the engine forces
  bashing damage for a pulled blow and requires a Willpower spend.
  The target gains +1 Defense for the pulled blow because the attacker
  is restraining the swing.

Specified targets:
  Body-part attacks (+attack/specified) may apply Tilts when the
  damage exceeds the part's threshold. See help combat specified for
  the per-part penalty and threshold table.

Damage resolution:
  Bashing fills the leftmost empty Health box, then upgrades existing
  bashing to lethal. Lethal fills from the right. The Health track is
  written automatically; see help health for the wound penalty table.

See also: attack, attack defense, health, combat specified
