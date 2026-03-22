import { IUrsamuSDK } from "../../src/@types/UrsamuSDK.ts";

/**
 * System Script: open.ts
 * Creates exits.
 *
 * Usage: @open[/inventory] <name>=<room>[,<back exit>]
 */
export default async (u: IUrsamuSDK) => {
  const actor    = u.me;
  const fullArgs = (u.cmd.args[0] || "").trim();

  // Switch comes from cmdParser — @open/inventory → u.cmd.switches[0] = "inventory"
  const swtch = (u.cmd.switches?.[0] || "").toLowerCase();

  // Pattern: <name>=<room>[,<back exit>]
  const match = fullArgs.match(/^([^=,]+)\s*=\s*([^,]+)(?:,\s*(.*))?/i);
  if (!match) {
    u.send("Usage: @open[/inventory] <name>=<room>[,<back exit>]");
    return;
  }

  const exitName     = match[1].trim();
  const destName     = match[2].trim();
  const backExitName = match[3] ? match[3].trim() : "";

  const searchResults = await u.db.search(destName);
  const destination   = searchResults[0];
  if (!destination) {
    u.send(`Could not find destination room: ${destName}`);
    return;
  }

  const isStaff = actor.flags.has("wizard") || actor.flags.has("admin") || actor.flags.has("superuser");
  const quota   = (actor.state.quota as number) ?? 0;
  const cost    = 1 + (backExitName ? 1 : 0);

  if (!isStaff && quota < cost) {
    u.send(`You don't have enough quota. Cost: ${cost}, You have: ${quota}.`);
    return;
  }

  if (backExitName && !(await u.canEdit(actor, destination))) {
    u.send("Permission denied: you can't create a back exit in that room.");
    return;
  }

  const location = swtch === "inventory" ? actor.id : u.here.id;

  const _exit = await u.db.create({
    flags: new Set(["exit"]),
    location,
    state: { name: exitName, destination: destination.id, owner: actor.id },
  });
  u.send(`You open exit %ch${exitName.split(";")[0]}%cn to ${u.util.displayName(destination, actor)}.`);

  if (backExitName) {
    const _backExit = await u.db.create({
      flags: new Set(["exit"]),
      location: destination.id,
      state: { name: backExitName, destination: u.here.id, owner: actor.id },
    });
    u.send(`You open back exit %ch${backExitName.split(";")[0]}%cn to ${u.util.displayName(u.here, actor)}.`);
  }

  if (!isStaff) {
    await u.db.modify(actor.id, "$inc", { "data.quota": -cost });
  }
};
