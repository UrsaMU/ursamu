import type { IUrsamuSDK } from "../commands/types.ts";

async function connectedInRoom(u: IUrsamuSDK, roomId: string) {
  return (await u.db.search({ location: roomId })).filter((p) =>
    p.flags.has("connected")
  );
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
      "Permission denied. (@emit <room>=<message> requires admin+. If your message contains '=', use @oemit instead.)"
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

  const connected = await connectedInRoom(u, room.id);
  if (connected.length === 0) { u.send(`No connected players in ${room.name || room.id}.`); return; }
  const actorName = u.util.displayName(actor, actor);
  for (const p of connected) u.send(`${actorName}> ${message}`, p.id);
  u.send(`Remitted to ${connected.length} player(s) in ${room.name || room.id}.`);
}

export async function execWall(u: IUrsamuSDK): Promise<void> {
  const actor = u.me;
  const raw = (u.cmd.args[0] || "").trim();
  if (!raw) { u.send("Usage: @wall <message>"); return; }
  const message = await u.evalString(raw);
  const actorName =
    (actor.state.moniker as string) || (actor.state.name as string) || actor.name || "Staff";
  u.broadcast(`%ch%cy[WALL]%cn ${actorName}: ${message}`);
  u.send("Message broadcast to all connected players.");
}

export async function execCemit(u: IUrsamuSDK): Promise<void> {
  const arg = u.cmd.args[0] || "";
  const eqIdx = arg.indexOf("=");
  if (eqIdx === -1) { u.send("Usage: @cemit <channel>=<message>"); return; }

  const chanName = arg.slice(0, eqIdx).trim();
  const message = await u.evalString(arg.slice(eqIdx + 1));
  if (!chanName || !message) { u.send("Usage: @cemit <channel>=<message>"); return; }

  const chans = (await u.chan.list()) as Array<{ name: string; header?: string; alias?: string }>;
  const chan = chans.find(
    (c) =>
      c.name.toLowerCase() === chanName.toLowerCase() ||
      c.alias?.toLowerCase() === chanName.toLowerCase()
  );
  if (!chan) { u.send(`Channel '${chanName}' not found.`); return; }
  u.broadcast(`${chan.header || `[${chan.name}]`} ${message}`);
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
