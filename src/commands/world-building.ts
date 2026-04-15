/**
 * @module commands/world-building
 *
 * Builder-level world commands: @find, @flags, @teleport, @stats, @time, @entrances
 * Registered via the default export; exec functions live in world.ts.
 */

import { addCmd } from "../services/commands/cmdParser.ts";
import {
  execFind,
  execFlags,
  execTeleport,
  execStats,
  execTime,
  execEntrances,
} from "./world.ts";

addCmd({
  name: "@find",
  pattern: /^@?find(?:\/(flag|type))?\s*(.*)/i,
  lock: "connected",
  category: "Building",
  help: `@find <name>        — Search objects by name (partial match).
@find/flag <flag>   — Search by flag.
@find/type <type>   — Search by type (room, player, exit, thing).

Examples:
  @find Sword
  @find/flag admin
  @find/type room`,
  exec: execFind,
});

addCmd({
  name: "@flags",
  pattern: /^@?flags\s+(.*)/i,
  lock: "connected",
  category: "Building",
  help: `@flags <target>=<flags>  — Set or remove flags on an object.

Use ! to remove a flag.

Examples:
  @flags me=dark
  @flags #5=!builder`,
  exec: execFlags,
});

// @set is the classic MUSH alias for @flags.
addCmd({
  name: "@set",
  pattern: /^@set\s+(.*)/i,
  lock: "connected",
  category: "Building",
  help: `@set <target>=<flag>  — Set or clear a flag on an object (alias for @flags).

Use ! to clear a flag.

Examples:
  @set me=quiet
  @set me=!quiet
  @set #5=dark`,
  exec: execFlags,
});

addCmd({
  name: "@teleport",
  pattern: /^@?teleport\s+(.*)/i,
  lock: "connected builder+",
  category: "Building",
  help: `@teleport <target>=<destination>  — Teleport an object to a destination.

Requires edit permission on target and enter_ok (or edit) on destination.

Examples:
  @teleport me=Lobby
  @teleport sword=#5`,
  exec: execTeleport,
});

addCmd({
  name: "@stats",
  pattern: /^@?stats(?:\/(full))?\s*$/i,
  lock: "connected",
  category: "Information",
  help: `@stats       — Show server summary.
@stats/full  — Show detailed object breakdown.

Examples:
  @stats
  @stats/full`,
  exec: execStats,
});

addCmd({
  name: "@time",
  pattern: /^@?time(?:\/(set))?\s*(.*)?$/i,
  lock: "connected",
  category: "Information",
  help: `@time                      — Display current game and server time.
@time/set key=val ...      — Set game clock fields (admin+).

Valid keys: year (1-9999), month (1-12), day (1-28), hour (0-23), minute (0-59)

Examples:
  @time
  @time/set year=5 month=3 day=1 hour=12 minute=0`,
  exec: execTime,
});

addCmd({
  name: "@entrances",
  pattern: /^@?entrances(?:\s+(.*))?$/i,
  lock: "connected admin+",
  category: "Building",
  help: `@entrances [<object>]  — List all exits that lead to the given location (admin+).

Without an argument, uses your current room.

Examples:
  @entrances
  @entrances Lobby`,
  exec: execEntrances,
});
