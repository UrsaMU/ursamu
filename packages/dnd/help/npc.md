+NPC

Browse and spawn combat NPCs (create is builder+).

SYNTAX
  +npc/list [<cr|filter>]
  +npc/create <name>=<template>
  +npc/create <name>=hp:ac:str:dex:con:int:wis:cha

NOTES
  150+ SRD templates (CR 0–5) in `resources/npcs.json`.
  Filter by CR (`1/4`) or name fragment (`dragon`).

EXAMPLES
  +npc/list
  +npc/list 2
  +npc/create Scout=goblin
  +npc/create Boss=ogre
  +combat/start

SEE ALSO: +help combat, +help kill, +help loot
