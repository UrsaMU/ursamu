import { addCmd } from "../services/commands/cmdParser.ts";
import type { IUrsamuSDK } from "../@types/UrsamuSDK.ts";

const MAX_LISTEN_MSG_LEN = 2_000;
const MAX_LISTEN_PATTERN_LEN = 500;

/** Return connected players in the given room. */
async function connectedInRoom(u: IUrsamuSDK, roomId: string) {
  return (await u.db.search({ location: roomId })).filter(p => p.flags.has("connected"));
}

function _matchListen(pattern: string, text: string): boolean {
  const p = pattern.trim().toLowerCase();
  const t = text.toLowerCase();
  if (p === "*") return true;
  const hasLeading = p.startsWith("*");
  const hasTrailing = p.endsWith("*");
  if (hasLeading && hasTrailing) {
    const inner = p.slice(1, -1);
    return inner === "" ? true : t.includes(inner);
  }
  if (hasLeading) return t.endsWith(p.slice(1));
  if (hasTrailing) return t.startsWith(p.slice(0, -1));
  return t.includes(p);
}

export async function execSay(u: IUrsamuSDK): Promise<void> {
  const actor = u.me;
  const raw = (u.cmd.args[0] || "").trim();
  if (!raw) { u.send("What do you want to say?"); return; }

  const message = await u.evalString(raw);
  const name = (actor.state.moniker as string) || (actor.state.name as string) || actor.name;
  u.here.broadcast(`%ch${name}%cn says, "${message}"`);

  // Fire @listen / @ahear hooks
  try {
    const roomContents = await u.db.search({ location: u.here.id });
    const ahearMsg = message.length > MAX_LISTEN_MSG_LEN
      ? message.slice(0, MAX_LISTEN_MSG_LEN)
      : message;
    for (const obj of roomContents) {
      if (obj.id === actor.id) continue;
      const listenAttr = (obj.state.attributes as Array<{ name: string; value: string }> | undefined)
        ?.find((a) => a.name.toUpperCase() === "LISTEN");
      if (!listenAttr) continue;
      if (listenAttr.value.length > MAX_LISTEN_PATTERN_LEN) continue;
      if (!_matchListen(listenAttr.value, message)) continue;
      await u.trigger(obj.id, "AHEAR", [ahearMsg, actor.id]);
    }
  } catch (_e) {
    console.warn("[say:listen]", _e);
  }
}

export async function execPose(u: IUrsamuSDK): Promise<void> {
  const actor = u.me;
  const raw = (u.cmd.args[0] || "").trim();
  if (!raw) { u.send("Pose what?"); return; }

  const input = await u.evalString(raw);
  const name = (actor.state.moniker as string) || (actor.state.name as string) || actor.name;
  const isSemipose = u.cmd.original?.trimStart().startsWith(";") ?? false;
  const content = isSemipose ? `${name}${input}` : `${name} ${input}`;
  u.here.broadcast(`%ch${content}%cn`);
}

export async function execEmit(u: IUrsamuSDK): Promise<void> {
  const actor = u.me;
  const arg = u.cmd.args[0] || "";
  const eqIdx = arg.indexOf("=");

  if (eqIdx === -1) {
    const message = await u.evalString(arg.trim());
    if (!message) { u.send("Usage: @emit [<room>=]<message>"); return; }
    for (const occ of await connectedInRoom(u, u.here.id)) u.send(message, occ.id);
    await u.events.emit("room:text", { roomId: u.here.id, text: message, speakerId: actor.id });
    return;
  }

  const isAdmin = actor.flags.has("admin") || actor.flags.has("wizard") || actor.flags.has("superuser");
  if (!isAdmin) {
    u.send(
      `Permission denied. (@emit <room>=<message> requires admin+. If your message contains '=', use @oemit instead.)`
    );
    return;
  }

  const roomRef = arg.slice(0, eqIdx).trim();
  const message = await u.evalString(arg.slice(eqIdx + 1));
  if (!roomRef || !message) { u.send("Usage: @emit [<room>=]<message>"); return; }

  const roomResults = await u.db.search(roomRef);
  const room = roomResults.find((r) => r.flags.has("room"));
  if (!room) { u.send(`I can't find a room called '${roomRef}'.`); return; }

  const connected = await connectedInRoom(u, room.id);
  if (connected.length === 0) { u.send(`No connected players in ${room.name || room.id}.`); return; }
  for (const p of connected) u.send(message, p.id);
  u.send(`Emitted to ${connected.length} player(s) in ${room.name || room.id}.`);
}

export async function execLemit(u: IUrsamuSDK): Promise<void> {
  const message = await u.evalString((u.cmd.args[0] ?? "").trim());
  if (!message) { u.send("Usage: @lemit <message>"); return; }
  for (const occ of await connectedInRoom(u, u.here.id)) u.send(message, occ.id);
  await u.events.emit("room:text", { roomId: u.here.id, text: message, speakerId: u.me.id });
}

export async function execPemit(u: IUrsamuSDK): Promise<void> {
  const actor = u.me;
  const arg = u.cmd.args[0] || "";
  const eqIdx = arg.indexOf("=");
  if (eqIdx === -1) { u.send("Usage: @pemit <player>=<message>"); return; }

  const playerRef = arg.slice(0, eqIdx).trim();
  const message = await u.evalString(arg.slice(eqIdx + 1));
  if (!playerRef || !message) { u.send("Usage: @pemit <player>=<message>"); return; }

  const results = await u.db.search(playerRef);
  const target = results.find((r) => r.flags.has("player"));
  if (!target) { u.send(`I can't find a player called '${playerRef}'.`); return; }
  if (!target.flags.has("connected")) {
    u.send(`${u.util.displayName(target, actor)} is not connected.`);
    return;
  }

  u.send(message, target.id);
  u.send(`Message sent to ${u.util.displayName(target, actor)}.`);
}

export async function execRemit(u: IUrsamuSDK): Promise<void> {
  const actor = u.me;
  const arg = u.cmd.args[0] || "";
  const eqIdx = arg.indexOf("=");
  if (eqIdx === -1) { u.send("Usage: @remit <room>=<message>"); return; }

  const roomRef = arg.slice(0, eqIdx).trim();
  const message = await u.evalString(arg.slice(eqIdx + 1));
  if (!roomRef || !message) { u.send("Usage: @remit <room>=<message>"); return; }

  const roomResults = await u.db.search(roomRef);
  const room = roomResults.find((r) => r.flags.has("room"));
  if (!room) { u.send(`I can't find a room called '${roomRef}'.`); return; }

  const actorName = u.util.displayName(actor, actor);
  const attributed = `${actorName}> ${message}`;
  const connected = await connectedInRoom(u, room.id);
  if (connected.length === 0) { u.send(`No connected players in ${room.name || room.id}.`); return; }
  for (const p of connected) u.send(attributed, p.id);
  u.send(`Remitted to ${connected.length} player(s) in ${room.name || room.id}.`);
}

export async function execWall(u: IUrsamuSDK): Promise<void> {
  const actor = u.me;
  const raw = (u.cmd.args[0] || "").trim();
  if (!raw) { u.send("Usage: @wall <message>"); return; }
  const message = await u.evalString(raw);
  const actorName = (actor.state.moniker as string) || (actor.state.name as string) || actor.name || "Staff";
  u.broadcast(`%ch%cy[WALL]%cn ${actorName}: ${message}`);
  u.send("Message broadcast to all connected players.");
}

export async function execThink(u: IUrsamuSDK): Promise<void> {
  const raw = (u.cmd.args[0] || "").trim();
  if (!raw) { u.send("What do you want to think?"); return; }
  const message = await u.evalString(raw);
  u.send(message);
}

export async function execPage(u: IUrsamuSDK): Promise<void> {
  const actor = u.me;
  const input = (u.cmd.args[0] || "").trim();
  const match = input.match(/^(.+?)=(.*)$/);
  if (!match) { u.send("Usage: page <target>=<message>"); return; }

  const targetName = match[1].trim();
  const rawMessage = await u.evalString(match[2].trim());
  if (!rawMessage) { u.send("What do you want to say?"); return; }

  const target = (await u.db.search(targetName)).find((obj) => obj.flags.has("player"));
  if (!target || target.flags.has("dark") || !target.flags.has("connected")) {
    u.send(`I can't find player "${targetName}" online.`);
    return;
  }

  const actorAlias = actor.state?.alias as string;
  const actorBaseName = (actor.state?.moniker as string) || (actor.state?.name as string) || actor.name || "Someone";
  const actorDisplay = actorAlias ? `${actorBaseName}(${actorAlias})` : actorBaseName;

  const targetAlias = target.state?.alias as string;
  const targetBaseName = (target.state?.moniker as string) || (target.state?.name as string) || target.name || "Someone";
  const targetDisplay = targetAlias ? `${targetBaseName}(${targetAlias})` : targetBaseName;

  const pageLock = ((target.state?.locks ?? {}) as Record<string, string>).page;
  if (pageLock) {
    const allowed = await u.checkLock(target.id, pageLock);
    if (!allowed) { u.send(`${targetDisplay} is not accepting pages.`); return; }
  }

  const away = target.state?.away as string | undefined;
  if (away) u.send(`%ch%cy[Away]%cn ${targetDisplay}: ${away}`);

  if (rawMessage.startsWith(":")) {
    const pose = rawMessage.slice(1);
    u.send(`From afar, %ch${actorDisplay}%cn ${pose}`, target.id);
    u.send(`Long distance to ${targetDisplay}: %ch${actorDisplay}%cn ${pose}`);
  } else {
    u.send(`%ch${actorDisplay}%cn pages you: ${rawMessage}`, target.id);
    u.send(`You paged ${targetDisplay} with: ${rawMessage}`);
  }
}

export async function execWhisper(u: IUrsamuSDK): Promise<void> {
  const actor = u.me;
  const arg = (u.cmd.args[0] || "").trim();
  if (!arg) { u.send("Usage: whisper <target>=<message>"); return; }

  const isPose = !arg.includes("=") && arg.includes(":");
  let targetRef: string;
  let rawMsg: string;

  if (isPose) {
    const colon = arg.indexOf(":");
    targetRef = arg.slice(0, colon).trim();
    rawMsg = await u.evalString(arg.slice(colon + 1).trim());
  } else {
    const eq = arg.indexOf("=");
    if (eq === -1) { u.send("Usage: whisper <target>=<message>"); return; }
    targetRef = arg.slice(0, eq).trim();
    rawMsg = await u.evalString(arg.slice(eq + 1).trim());
  }

  if (!rawMsg) { u.send("What do you want to whisper?"); return; }

  const roomContents = await u.db.search({ location: u.here.id });
  const target = roomContents.find((o) =>
    o.flags.has("player") && o.flags.has("connected") &&
    ((o.state.name as string) || o.name || "").toLowerCase().startsWith(targetRef.toLowerCase()) &&
    o.id !== actor.id
  );
  if (!target) { u.send(`There is no connected player "${targetRef}" here.`); return; }

  const actorName = (actor.state.moniker as string) || (actor.state.name as string) || actor.name || "Someone";
  const targetName = (target.state.moniker as string) || (target.state.name as string) || target.name || "Someone";

  if (isPose) {
    u.send(`%chWhisper>%cn ${actorName} ${rawMsg}`, target.id);
    u.send(`%chWhisper>%cn ${actorName} ${rawMsg}`);
    u.here.broadcast(`%ch${actorName}%cn whispers something to %ch${targetName}%cn.`,
      { exclude: [actor.id, target.id] } as Record<string, unknown>);
  } else {
    u.send(`%ch${actorName}%cn whispers to you, "${rawMsg}"`, target.id);
    u.send(`You whisper to %ch${targetName}%cn, "${rawMsg}"`);
    u.here.broadcast(`%ch${actorName}%cn whispers something to %ch${targetName}%cn.`,
      { exclude: [actor.id, target.id] } as Record<string, unknown>);
  }
}

export async function execCemit(u: IUrsamuSDK): Promise<void> {
  const arg = u.cmd.args[0] || "";
  const eqIdx = arg.indexOf("=");
  if (eqIdx === -1) { u.send("Usage: @cemit <channel>=<message>"); return; }

  const chanName = arg.slice(0, eqIdx).trim();
  const message = await u.evalString(arg.slice(eqIdx + 1));
  if (!chanName || !message) { u.send("Usage: @cemit <channel>=<message>"); return; }

  const chans = await u.chan.list() as Array<{ name: string; header?: string; alias?: string }>;
  const chan = chans.find((c) =>
    c.name.toLowerCase() === chanName.toLowerCase() ||
    c.alias?.toLowerCase() === chanName.toLowerCase()
  );
  if (!chan) { u.send(`Channel '${chanName}' not found.`); return; }

  const header = chan.header || `[${chan.name}]`;
  u.broadcast(`${header} ${message}`);
  u.send(`Message sent to channel ${chan.name}.`);
}

export async function execFsay(u: IUrsamuSDK): Promise<void> {
  const cmdName = (u.cmd.original || "").trimStart().split(/\s/)[0].toLowerCase();
  const arg = u.cmd.args[0] || "";
  const eqIdx = arg.indexOf("=");
  if (eqIdx === -1) { u.send(`Usage: ${cmdName} <target>=<message>`); return; }

  const targetRef = arg.slice(0, eqIdx).trim();
  const message = await u.evalString(arg.slice(eqIdx + 1));
  if (!targetRef || !message) { u.send(`Usage: ${cmdName} <target>=<message>`); return; }

  const results = await u.db.search(targetRef);
  const target = results[0];
  if (!target) { u.send(`Can't find '${targetRef}'.`); return; }

  if (cmdName === "fsay") {
    await u.forceAs(target.id, `say ${message}`);
  } else if (cmdName === "fpose") {
    await u.forceAs(target.id, `pose ${message}`);
  } else if (cmdName === "femit") {
    await u.forceAs(target.id, `@emit ${message}`);
  } else {
    await u.forceAs(target.id, `@lemit ${message}`);
  }
}

addCmd({
  name: "say",
    pattern: /^(?:say\s+|["'])(.*)/is,
    lock: "connected",
    category: "Communication",
    help: `say <message>  — Say something to everyone in the room.

Aliases: " <message>, ' <message>

Examples:
  say Hello everyone!
  "Hello everyone!`,
    exec: execSay,
  });

  addCmd({
    name: "pose",
    pattern: /^(?:pose\s+|[:;])(.*)/is,
    lock: "connected",
    category: "Communication",
    help: `pose <action>  — Pose an action to the room.

Aliases: : <action>, ; <action> (semipose — no space between name and action)

Examples:
  pose waves to everyone.
  :waves to everyone.
  ;'s eyes gleam.`,
    exec: execPose,
  });

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

Unlike @emit, @lemit always targets the enactor's location. Useful inside
trigger chains where the code-running object may be in a different room.

Examples:
  @lemit Thunder rolls across the sky.`,
    exec: execLemit,
  });

  addCmd({
    name: "@pemit",
    pattern: /^@?pemit\s+(.*)/is,
    lock: "connected admin+",
    category: "Communication",
    help: `@pemit <player>=<message>  — Privately emit a message to any connected player (admin+).

No attribution — message appears as raw text.

Examples:
  @pemit Alice=The game will restart in 5 minutes.`,
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
  @remit Lobby=Server is restarting in 2 minutes.`,
    exec: execRemit,
  });

  addCmd({
    name: "@wall",
    pattern: /^@?wall\s+(.*)/is,
    lock: "connected admin+",
    category: "Communication",
    help: `@wall <message>  — Broadcast a message to all connected players (admin+).

Examples:
  @wall The server will restart in 10 minutes.`,
    exec: execWall,
  });

  addCmd({
    name: "think",
    pattern: /^think\s+(.*)/is,
    lock: "connected",
    category: "Communication",
    help: `think <expression>  — Evaluate an expression and show the result only to you.

Useful for testing softcode without broadcasting to the room.

Examples:
  think [add(2,3)]
  think [name(me)]`,
    exec: execThink,
  });

  addCmd({
    name: "page",
    pattern: /^(?:page|p)\s+(.*)/i,
    lock: "connected",
    category: "Communication",
    help: `page <target>=<message>  — Send a private message to any online player.
page <target>=:<pose>    — Send a pose-style private message.

Aliases: p <target>=<message>

Examples:
  page Alice=Are you busy?
  page Bob=:waves hello.`,
    exec: execPage,
  });

  addCmd({
    name: "whisper",
    pattern: /^(?:whisper|wh)\s+(.*)/i,
    lock: "connected",
    category: "Communication",
    help: `whisper <target>=<message>  — Whisper privately to a player in the same room.
whisper <target>:<pose>    — Whisper-pose to a player in the same room.

Aliases: wh

Examples:
  whisper Alice=Meet me later.
  whisper Bob:leans over and whispers.`,
    exec: execWhisper,
  });

  addCmd({
    name: "@cemit",
    pattern: /^@?cemit\s+(.*)/is,
    lock: "connected admin+",
    category: "Communication",
    help: `@cemit <channel>=<message>  — Emit a raw message to a channel (admin+).

Examples:
  @cemit Public=The game will restart soon.`,
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
