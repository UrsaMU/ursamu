/**
 * @module commands/world-admin
 *
 * Admin-level world commands: @tel, @sweep, @force
 * Registered via the default export; exec functions live in world.ts.
 */

import { addCmd } from "../services/commands/cmdParser.ts";
import { execTel, execSweep, execForce } from "./world.ts";

addCmd({
  name: "@tel",
  pattern: /^@?tel\s+(.*)/i,
  lock: "connected admin+",
  category: "Administration",
  help: `@tel <target>=<destination>  — Force-teleport any object (admin+).

Examples:
  @tel Alice=Lobby
  @tel #5=#1`,
  exec: execTel,
});

addCmd({
  name: "@sweep",
  pattern: /^@?sweep$/i,
  lock: "connected admin+",
  category: "Administration",
  help: `@sweep  — List reactive objects in your current room (admin+).

Reactive attributes: LISTEN, AHEAR, ACONNECT, ADISCONNECT, STARTUP

Examples:
  @sweep`,
  exec: execSweep,
});

addCmd({
  name: "@force",
  pattern: /^@?force\s+(.*)/i,
  lock: "connected admin+",
  category: "Administration",
  help: `@force <target>=<command>  — Execute a command as another object (admin+).

Examples:
  @force NPC=say Hello, traveler!
  @force Alice=look`,
  exec: execForce,
});
