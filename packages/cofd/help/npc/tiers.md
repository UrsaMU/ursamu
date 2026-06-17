npc tiers  -- Tier capacities for dread powers and merits.

Each NPC carries a tier that caps the number of dread powers and
merits the engine will accept. Tier is set at /build time as
'/<tier>' after the archetype key.

  minor          Mooks and extras. 1 dread power, no merits.
  major          Named antagonist. Up to 3 dread powers, 4 merits.
  storyteller    PC-equivalent. Up to 6 dread powers, 7 merits.

Default tier:
  Each archetype declares a default tier. /build without a /<tier>
  suffix uses the archetype's default. See help npc archetypes for
  the per-archetype default.

Promotion:
  There is no in-place tier promotion. Destroy the NPC and rebuild
  at the higher tier if you need more power/merit slots.

See also: npc, npc archetypes, npc derived
