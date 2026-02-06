import { IUrsamuSDK } from "../../src/@types/UrsamuSDK.ts";

/**
 * System Script: dig.ts
 * Migrated from legacy @dig command.
 */
export default async (u: IUrsamuSDK) => {
  const actor = u.me;
  const fullArgs = u.cmd.args.join(" ").trim();
  
  // Pattern: @dig[/sw] <room>[=<to exit>[,<from exit>]]
  const match = fullArgs.match(/^(\/.*)?\s+([^=,]+)(?:\s*=\s*([^,]+))?(?:,\s*(.*))?/i);

  if (!match) {
    u.send("Usage: @dig[/teleport] <room>[=<to exit>[,<from exit>]]");
    return;
  }

  const swtch = (match[1] || "").toLowerCase();
  const roomName = match[2].trim();
  const toExit = match[3] ? match[3].trim() : "";
  const fromExit = match[4] ? match[4].trim() : "";

  // Quota & Permission Check (Simplified for script)
  const isStaff = actor.flags.has("wizard") || actor.flags.has("admin");
  const quota = (actor.state.quota as number) || 0;
  
  let cost = 1; // Room
  if (toExit) cost++;
  if (fromExit) cost++;

  if (!isStaff && quota < cost) {
    u.send(`You don't have enough quota. Cost: ${cost}, You have: ${quota}.`);
    return;
  }

  // Dig the room
  const room = await u.db.create({
    flags: new Set(["room"]),
    state: {
      name: roomName,
      owner: actor.id
    }
  });

  u.send(`Room ${roomName} created with dbref %ch#${room.id}%cn.`);

  // Dig to exit
  if (toExit) {
    const to = await u.db.create({
      flags: new Set(["exit"]),
      location: u.here.id,
      state: {
        name: toExit,
        destination: room.id,
        owner: actor.id
      }
    });
    u.send(`Exit ${toExit.split(";")[0]} created with dbref %ch#${to.id}%cn.`);
  }

  // Dig from exit
  if (fromExit) {
    const from = await u.db.create({
      flags: new Set(["exit"]),
      location: room.id,
      state: {
        name: fromExit,
        destination: u.here.id,
        owner: actor.id
      }
    });
    u.send(`Exit ${fromExit.split(";")[0]} created with dbref %ch#${from.id}%cn.`);
  }

  // Decrease quota
  if (!isStaff) {
    actor.state.quota = quota - cost;
  }

  // Handle teleport switch
  if (swtch === "/teleport" || swtch === "/tel") {
    u.teleport("me", room.id);
  }
};
