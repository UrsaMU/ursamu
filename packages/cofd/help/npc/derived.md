npc derived  -- Computed stats on an NPC stat block.

Derived stats are recomputed from the NPC's sheet at render time.
Do not write them directly; edit the underlying attributes and
skills and let the engine fold them in.

  Health max     Stamina + Size
  Willpower max  Resolve + Composure
  Defense        min(Dex, Wits) + Athletics
  Initiative     Dex + Composure
  Speed          Strength + Dexterity + Size

Notes:
  Size defaults to 5 for human-scale NPCs. Beasts, spirits, and
  certain ghost archetypes may legitimately sit outside that
  default; +npc/build sets Size automatically from the archetype.

Equipped gear modifies the derived stats the same way it does for
PCs. Armor lowers Speed and contributes its rating; weapons feed
attack pools through +attack.

See also: npc, npc archetypes, sheet, attack
