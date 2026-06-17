+npc  -- Spawn and manage non-player antagonists.

SYNTAX
  +npc                                  List NPCs in room.
  +npc/build <name>=<archetype>[/<tier>]   Spawn full stat block.
  +npc/show <name-or-id>                Display stat block.
  +npc/powers                           List Dread Powers / Numina.
  +npc/addpower <npc>=<key>             Attach a power.
  +npc/rmpower <npc>=<key>              Detach a power.
  +npc/ai <npc>=<ai-archetype>          Set AI archetype.
  +npc/aggro <npc>=<target>             Spike threat.
  +npc/destroy <name-or-id>             Remove an NPC.

Build/add/rm/ai/aggro require staff. Destroy = staff + canEdit.

EXAMPLES
  +npc/build Goon=thug
  +npc/addpower Karl=mortal-mask
  +combat/join for Goon

SEE ALSO: help npc/tiers, help npc/archetypes, help npc/derived
