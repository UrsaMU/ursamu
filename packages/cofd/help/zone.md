# +zone

Staff-defined regions of rooms populated with themed wandering NPCs. Build a
hunting ground, a city block, a haunted hallway -- then fill it with
adversaries that move on their own and pick fights when players walk in.
Wandering pauses automatically in any room with an active encounter, so the
turn-based core is never disrupted.

## Switches

  /list                                  Show all zones.
  /show <name>                           Inspect a zone.
  /create <name>                         Builder+: create a zone anchored to this room.
  /add <name>=<roomId> [<roomId>...]     Builder+: add explicit rooms.
  /from-exits <name>                     Builder+: auto-extend by walking exits (cap 200).
  /populate <name>=<archetype>x<N> [aggro=<mode>]
                                         Builder+: spawn N NPCs of an archetype.
  /populate <name>=theme=<theme> [size=small|medium|large] [aggro=<mode>]
                                         Builder+: spawn a weighted mix from a themed table.
  /theme <name>=<theme>|none             Builder+: set/clear the theme tag.
  /flavor <name>=on|off                  Builder+: ambient atmosphere broadcasts.
  /respawn <name>=<seconds>|off          Builder+: refill spawn-rule deficits on a cooldown.
  /migration <name>=on|off               Builder+: mobs may wander into other zones (transfers ownership on arrival).
  /wander <name>=on|off                  Builder+: start/stop the wander tick.
  /destroy <name>                        Builder+: delete the zone definition.

## Aggro modes

  passive       Mob will not initiate combat.
  territorial   Mob auto-initiates combat when a player enters its room.
  hunter        Same as territorial AND walks toward distant active fights
                in the zone (BFS, depth cap 6).

## Themes

Themes pick weighted archetype mixes for /populate and gate the ambient
flavor pool. Available themes:

  forest        Wild predators and spirits among the trees.
  city          Street muscle and organized opposition.
  urban-decay   Squatters, looters, anything desperate.
  sewer         Subterranean threats and waterborne flavor.
  ruins         Crumbling masonry and old ghosts.

## Workflow

  1. Stand in the room you want to anchor the zone to.
  2. +zone/create deepwood
  3. +zone/from-exits deepwood        Sweep adjacent rooms into the zone.
  4. +zone/theme deepwood=forest      (optional but enables themed flavor)
  5. +zone/populate deepwood=theme=forest size=large aggro=hunter
  6. +zone/respawn deepwood=120       (refill killed mobs every 2 minutes)
  7. +zone/wander deepwood=on         Mobs begin wandering every 30s.

When a player enters a zone room containing territorial/hunter mobs, an
encounter is opened automatically and initiative is rolled. The player's
next +attack / +throw / +grapple resolves in turn order; NPC actions run
themselves through the AI walker. Hunters in adjacent rooms will path
toward the fight on subsequent wander ticks and join when they arrive.

## Overlap precedence

If a room appears in multiple zones, the OLDEST zone (lowest createdAt)
owns it for aggro-on-entry and wander purposes. This is deterministic so
behavior is stable regardless of zone iteration order.

## Notes

  - /destroy removes the zone definition but does NOT delete the spawned
    NPCs. Use +npc/destroy to clean up the bestiary.
  - Wander intervals re-arm automatically on server start for any zone
    where /wander was last set to on.
  - Mob count per /populate is capped at 50 to prevent runaway spawns.
  - Respawn never exceeds the spawn rule's original count (no exponential
    growth). Killed mobs refill only up to the rule's quota.
  - BFS pathfinding is capped at depth 6 to bound compute per tick.
