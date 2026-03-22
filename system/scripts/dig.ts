import { IUrsamuSDK } from "../../src/@types/UrsamuSDK.ts";

/**
 * System Script: dig.ts
 * Creates rooms and optional exits.
 *
 * Usage: @dig[/teleport] <room>[=<to exit>[,<from exit>]]
 */
export default async (u: IUrsamuSDK) => {
  const actor = u.me;
  const fullArgs = (u.cmd.args[0] || "").trim();

  // Switch comes from cmdParser — @dig/teleport → u.cmd.switches[0] = "teleport"
  const swtch = (u.cmd.switches?.[0] || "").toLowerCase();

  // Pattern: <room>[=<to exit>[,<from exit>]]
  const match = fullArgs.match(/^([^=,]+)(?:\s*=\s*([^,]+))?(?:,\s*(.*))?/i);
  if (!match) {
    u.send("Usage: @dig[/teleport] <room>[=<to exit>[,<from exit>]]");
    return;
  }

  const roomName = match[1].trim();
  const toExit   = match[2] ? match[2].trim() : "";
  const fromExit = match[3] ? match[3].trim() : "";

  if (!roomName) {
    u.send("Usage: @dig[/teleport] <room>[=<to exit>[,<from exit>]]");
    return;
  }

  const isStaff = actor.flags.has("wizard") || actor.flags.has("admin") || actor.flags.has("superuser");
  const quota   = (actor.state.quota as number) ?? 0;
  const cost    = 1 + (toExit ? 1 : 0) + (fromExit ? 1 : 0);

  if (!isStaff && quota < cost) {
    u.send(`You don't have enough quota. Cost: ${cost}, You have: ${quota}.`);
    return;
  }

  // Create the room
  const room = await u.db.create({
    flags: new Set(["room"]),
    state: { name: roomName, owner: actor.id },
  });
  u.send(`Room %ch${roomName}%cn created with dbref %ch#${room.id}%cn.`);

  // Create to-exit in current room
  if (toExit) {
    const to = await u.db.create({
      flags: new Set(["exit"]),
      location: u.here.id,
      state: { name: toExit, destination: room.id, owner: actor.id },
    });
    u.send(`Exit %ch${toExit.split(";")[0]}%cn created with dbref %ch#${to.id}%cn.`);
  }

  // Create from-exit in new room
  if (fromExit) {
    const from = await u.db.create({
      flags: new Set(["exit"]),
      location: room.id,
      state: { name: fromExit, destination: u.here.id, owner: actor.id },
    });
    u.send(`Exit %ch${fromExit.split(";")[0]}%cn created with dbref %ch#${from.id}%cn.`);
  }

  // Deduct quota atomically
  if (!isStaff) {
    await u.db.modify(actor.id, "$inc", { "data.quota": -cost });
  }

  // Teleport to new room if requested
  if (swtch === "teleport" || swtch === "tel") {
    u.teleport("me", room.id);
  }
};
