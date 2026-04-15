/**
 * @module commands/world-building
 *
 * Builder-level world commands: @find, @flags, @teleport, @stats, @time, @entrances,
 * @desc, @parent, @link, @clone, @dest, @aconnect, @adisconnect, @startup, @daily, @log
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
  execDesc,
  execParent,
  execLink,
  execClone,
  execDest,
  execAconnect,
  execAdisconnect,
  execStartup,
  execDaily,
  execLog,
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

addCmd({
  name: "@desc",
  pattern: /^@?desc(?:ribe)?\s+(.*)/i,
  lock: "connected",
  category: "Building",
  help: `@desc <target>=<description>  — Set the description of an object.

Examples:
  @desc me=A tall figure in dark robes.
  @desc here=A cozy room lit by firelight.`,
  exec: execDesc,
});

addCmd({
  name: "@parent",
  pattern: /^@?parent\s+(.*)/i,
  lock: "connected",
  category: "Building",
  help: `@parent <target>=<parent>  — Set the parent object for attribute inheritance.

Use an empty value to clear the parent.

Examples:
  @parent #5=#10
  @parent widget=ParentObj
  @parent #5=`,
  exec: execParent,
});

addCmd({
  name: "@link",
  pattern: /^@?link\s+(.*)/i,
  lock: "connected",
  category: "Building",
  help: `@link <target>=<destination>  — Set the home/destination of an object or exit.

Examples:
  @link me=Lobby
  @link north exit=#5`,
  exec: execLink,
});

addCmd({
  name: "@clone",
  pattern: /^@?clone\s+(.*)/i,
  lock: "connected",
  category: "Building",
  help: `@clone <target>[=<new name>]  — Clone an object with all its attributes.

The clone is placed in your inventory. Owner is set to you.

Examples:
  @clone Sword
  @clone #5=Vorpal Sword`,
  exec: execClone,
});

addCmd({
  name: "@dest",
  pattern: /^@?dest(?:ruct)?(?:\/(\w+))?\s+(.*)/i,
  lock: "connected",
  category: "Building",
  help: `@dest <target>          — Destroy an object immediately (no confirmation).
@dest/instant <target>  — Same as @dest (instant flag accepted for compatibility).

Examples:
  @dest #15
  @dest/instant BadObject`,
  exec: execDest,
});

addCmd({
  name: "@aconnect",
  pattern: /^@?aconnect\s+(.*)/i,
  lock: "connected",
  category: "Building",
  help: `@aconnect <target>=<action>  — Set action executed when a player connects.

Examples:
  @aconnect me=@pemit me=Welcome back!`,
  exec: execAconnect,
});

addCmd({
  name: "@adisconnect",
  pattern: /^@?adisconnect\s+(.*)/i,
  lock: "connected",
  category: "Building",
  help: `@adisconnect <target>=<action>  — Set action executed when a player disconnects.

Examples:
  @adisconnect me=@pemit me=Goodbye!`,
  exec: execAdisconnect,
});

addCmd({
  name: "@startup",
  pattern: /^@?startup\s+(.*)/i,
  lock: "connected",
  category: "Building",
  help: `@startup <target>=<action>  — Set action executed when the server starts.

Examples:
  @startup #5=@pemit me=System ready.`,
  exec: execStartup,
});

addCmd({
  name: "@daily",
  pattern: /^@?daily\s+(.*)/i,
  lock: "connected",
  category: "Building",
  help: `@daily <target>=<action>  — Set action executed once per day.

Examples:
  @daily #5=@trigger me/RESET`,
  exec: execDaily,
});

addCmd({
  name: "@log",
  pattern: /^@?log(?:\/\S+)?\s+(.*)/i,
  lock: "connected",
  category: "Information",
  help: `@log [<object>=]<message>  — Write a message to the server log.

Examples:
  @log Something happened.
  @log reqlog=Player requested item.`,
  exec: execLog,
});
