import { addCmd } from "../commands/addCmd.ts";
import {
  execCreate,
  execConnect,
  execMotd,
  execPassword,
  execQuit,
  execUpdate,
} from "./auth.ts";

addCmd({
  name: "create",
  pattern: /^create\s+(.*)/i,
  lock: "",
  category: "Authentication",
  help: `create <name> <password>  — Create a new character and log in.

Examples:
  create Alice mypassword`,
  exec: execCreate,
});

addCmd({
  name: "connect",
  pattern: /^connect\s+(.*)/i,
  lock: "",
  category: "Authentication",
  help: `connect <name> <password>  — Log in to the game.

Examples:
  connect Alice mypassword`,
  exec: execConnect,
});

addCmd({
  name: "quit",
  pattern: /^quit$/i,
  lock: "connected",
  category: "Authentication",
  help: `quit  — Disconnect from the game.

Examples:
  quit`,
  exec: execQuit,
});

addCmd({
  name: "@motd",
  pattern: /^@?motd(?:\/(set|clear))?\s*(.*)?/i,
  lock: "connected",
  category: "Authentication",
  help: `@motd             — Display the message of the day.
@motd/set <text>  — Set the MOTD (admin/wizard only).
@motd/clear       — Clear the MOTD (admin/wizard only).

Examples:
  @motd
  @motd/set Welcome to the game! Enjoy your stay.
  @motd/clear`,
  exec: execMotd,
});

addCmd({
  name: "@password",
  pattern: /^@?password\s+(.*)/i,
  lock: "connected",
  category: "Authentication",
  help: `@password <oldpass>=<newpass>   — Change your own password.
@password <player>=<newpass>   — Set a player's password (admin/wizard only).

Examples:
  @password oldpass=newpass
  @password Alice=resetpass`,
  exec: execPassword,
});

addCmd({
  name: "@update",
  pattern: /^@?(?:update|upgrade)(?:\s+(.*))?$/i,
  lock: "connected admin+",
  category: "System",
  help: `@update [<branch>]  — Same as @restart.

Prepares packages while the game stays online (git pull,
bump jsr:@ursamu/* pins, dual-package overrides, deno
cache). Soft-reboots only if cache succeeds. Failures
leave the game running. Telnet sessions stay up.

Aliases: @upgrade
See also: @restart/check (read-only outdated pins)

Examples:
  @update
  @update main
  @restart/check`,
  exec: execUpdate,
});
