NPC -- Wyrm bestiary + spawning + AI

  Browse the Wyrm bestiary (banes, fomori, BSDs, creatures), spawn
  hostile NPCs into the current room, and run their AI turns. When
  initiative is rolled in a room with spawned NPCs, +init/next will
  auto-execute their turns before stopping on the next PC slot.

SYNTAX
  +npc                       List the whole bestiary.
  +npc/list [<kind>]         Filter by kind: bane, fomor, bsd, creature.
  +npc/info <slug>           Show one template's full sheet.
  +npc/here                  List NPCs currently in this room.
  +npc/spawn <slug> [name]   (Staff) Spawn an NPC in this room.
  +npc/despawn <npc>         (Staff) Remove a spawned NPC.
  +npc/act <npc>             (Staff) Force one AI turn for an NPC.
  +init/addnpc <npc>         (Staff) Add a spawned NPC to initiative.

EXAMPLES
  +npc/list bane             List corrupted spirits.
  +npc/info bsd-ahroun       Black Spiral Ahroun stats.
  +npc/spawn bane-shade Sliver of the Pit  Spawn with custom name.
  +init/addnpc Sliver of the Pit  Roll its init.

SEE ALSO: +help spirit, +help attack, +help init, +help renown
