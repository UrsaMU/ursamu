import type { IUrsamuSDK } from "jsr:@ursamu/ursamu";

/**
 * @dig[/teleport] <room>[=<to exit>[,<from exit>]]
 *
 * Creates a room and optionally one or two connecting exits.
 *
 * TinyMUX cost model:
 *   Room creation:    10 coins
 *   Exit open:         1 coin
 *   Exit link:         1 coin  (each linked exit costs 2 total)
 *
 *   @dig Hall                  → 10
 *   @dig Hall=North;N          → 12 (10 + 2)
 *   @dig Hall=North;N,South;S  → 14 (10 + 2 + 2)
 *
 * Switches:
 *   /teleport  Teleport to the newly created room.
 *   /tel       Alias for /teleport.
 *
 * Examples:
 *   @dig Library
 *   @dig Library=North;N,South;S
 *   @dig/teleport Storage Room=To Storage,Back to Lobby
 */
export default async (u: IUrsamuSDK) => {
  const actor    = u.me;
  const fullArgs = (u.cmd.args[0] || "").trim();
  const swtch    = (u.cmd.switches?.[0] || "").toLowerCase();

  const match = fullArgs.match(/^([^=,]+)(?:\s*=\s*([^,]+))?(?:,\s*(.*))?/i);
  if (!match || !match[1].trim()) {
    u.send("Usage: @dig[/teleport] <room>[=<to exit>[,<from exit>]]");
    return;
  }

  const roomName = match[1].trim();
  const toExit   = match[2] ? match[2].trim() : "";
  const fromExit = match[3] ? match[3].trim() : "";

  const isStaff = actor.flags.has("wizard") || actor.flags.has("admin") || actor.flags.has("superuser");

  // TinyMUX cost: 10 for room, 2 per linked exit (1 open + 1 link)
  const cost = 10 + (toExit ? 2 : 0) + (fromExit ? 2 : 0);
  const quota = (actor.state.quota as number) ?? 0;

  if (!isStaff && quota < cost) {
    u.send(`You don't have enough quota. Cost: ${cost}, You have: ${quota}.`);
    return;
  }

  const room = await u.db.create({
    flags: new Set(["room"]),
    state: { name: roomName, owner: actor.id },
  });
  u.send(`Room %ch${roomName}%cn created with dbref %ch#${room.id}%cn.`);

  if (toExit) {
    const to = await u.db.create({
      flags: new Set(["exit"]),
      location: u.here.id,
      state: { name: toExit, destination: room.id, owner: actor.id },
    });
    u.send(`Exit %ch${toExit.split(";")[0]}%cn created with dbref %ch#${to.id}%cn.`);
  }

  if (fromExit) {
    const from = await u.db.create({
      flags: new Set(["exit"]),
      location: room.id,
      state: { name: fromExit, destination: u.here.id, owner: actor.id },
    });
    u.send(`Exit %ch${fromExit.split(";")[0]}%cn created with dbref %ch#${from.id}%cn.`);
  }

  if (!isStaff) {
    await u.db.modify(actor.id, "$inc", { "data.quota": -cost });
  }

  if (swtch === "teleport" || swtch === "tel") {
    u.teleport("me", room.id);
  }
};
