import { addCmd } from "../commands/addCmd.ts";
import {
  execEmit,
  execLemit,
  execPemit,
  execRemit,
  execWall,
  execCemit,
  execFsay,
} from "./emit-exec.ts";

export { execEmit, execLemit, execPemit, execRemit, execWall, execCemit, execFsay };

addCmd({
  name: "@emit",
  pattern: /^@?emit\s+(.*)/is,
  lock: "connected builder+",
  category: "Communication",
  help: `@emit [<room>=]<message>  — Emit a raw message to a room.

Without a target: sends to your current room (builder+).
With <room>=: sends to any room by name or dbref (admin/wizard only).

Examples:
  @emit Thunder rolls across the sky.
  @emit #5=Someone has entered the building.`,
  exec: execEmit,
});

addCmd({
  name: "@lemit",
  pattern: /^@?lemit\s+(.*)/is,
  lock: "connected builder+",
  category: "Communication",
  help: `@lemit <message>  — Emit a raw message to your current room.

Unlike @emit, @lemit always targets the enactor's location.

Examples:
  @lemit Thunder rolls across the sky.
  @lemit The door creaks open.`,
  exec: execLemit,
});

addCmd({
  name: "@pemit",
  pattern: /^@?pemit\s+(.*)/is,
  lock: "connected admin+",
  category: "Communication",
  help: `@pemit <player>=<message>  — Privately emit to any connected player (admin+).

No attribution — message appears as raw text.

Examples:
  @pemit Alice=The game will restart in 5 minutes.
  @pemit Bob=You have been warned.`,
  exec: execPemit,
});

addCmd({
  name: "@remit",
  pattern: /^@?remit\s+(.*)/is,
  lock: "connected admin+",
  category: "Communication",
  help: `@remit <room>=<message>  — Attributed emit to all players in a room (admin+).

Message is prefixed with your display name: "Name> message"

Examples:
  @remit Lobby=Server is restarting in 2 minutes.
  @remit #5=Please make your way to the exit.`,
  exec: execRemit,
});

addCmd({
  name: "@wall",
  pattern: /^@?wall\s+(.*)/is,
  lock: "connected admin+",
  category: "Communication",
  help: `@wall <message>  — Broadcast a message to all connected players (admin+).

Examples:
  @wall The server will restart in 10 minutes.
  @wall Welcome to the game!`,
  exec: execWall,
});

addCmd({
  name: "@cemit",
  pattern: /^@?cemit\s+(.*)/is,
  lock: "connected admin+",
  category: "Communication",
  help: `@cemit <channel>=<message>  — Emit a raw message to a channel (admin+).

Bypasses the speaker header entirely.

Examples:
  @cemit Public=The game will restart soon.
  @cemit Staff=[name(me)] just connected.`,
  exec: execCemit,
});

addCmd({
  name: "fsay",
  pattern: /^(?:fsay|fpose|femit|npemit)\s+(.*)/i,
  lock: "connected admin+",
  category: "Communication",
  help: `fsay <target>=<message>   — Force a target to say something (admin+).
fpose <target>=<action>   — Force a target to pose (admin+).
femit <target>=<message>  — Force a target to emit (admin+).
npemit <target>=<message> — Force a private emit as target (admin+).

Examples:
  fsay NPC=Hello, traveler!
  fpose NPC=bows deeply.`,
  exec: execFsay,
});
