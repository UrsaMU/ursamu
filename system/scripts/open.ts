import { IUrsamuSDK } from "../../src/@types/UrsamuSDK.ts";

/**
 * System Script: open.ts
 * Migrated from legacy @open command.
 */
export default async (u: IUrsamuSDK) => {
  const actor = u.me;
  const fullArgs = u.cmd.args.join(" ").trim();

  // Pattern: @open[/sw] <name>=<room>[,<back exit>]
  const match = fullArgs.match(/^(\/.*)?\s+([^=,]+)\s*=\s*([^,]+)(?:,\s*(.*))?/i);

  if (!match) {
    u.send("Usage: @open[/inventory] <name>=<room>[,<back exit>]");
    return;
  }

  const swtch = (match[1] || "").toLowerCase();
  const exitName = match[2].trim();
  const destName = match[3].trim();
  const backExitName = match[4] ? match[4].trim() : "";

  // Find destination room
  const searchResults = await u.db.search(destName);
  const destination = searchResults[0];

  if (!destination) {
    u.send(`Could not find destination room: ${destName}`);
    return;
  }

  // Quota & Permission Check
  const isStaff = actor.flags.has("wizard") || actor.flags.has("admin");
  const quota = (actor.state.quota as number) || 0;
  let cost = 1;
  if (backExitName) cost++;

  if (!isStaff && quota < cost) {
    u.send(`You don't have enough quota. Cost: ${cost}, You have: ${quota}.`);
    return;
  }

  const location = swtch === "/inventory" ? actor.id : u.here.id;

  // Create the exit
  const _exit = await u.db.create({
    flags: new Set(["exit"]),
    location: location,
    state: {
      name: exitName,
      destination: destination.id,
      owner: actor.id
    }
  });

  const _canEditDest = u.canEdit(actor, destination);
  const destDisplay = u.util.displayName(destination, actor);
  u.send(`You open exit %ch${exitName.split(";")[0]}%cn to ${destDisplay}.`);

  // Create back exit
  if (backExitName) {
    const _backExit = await u.db.create({
      flags: new Set(["exit"]),
      location: destination.id,
      state: {
        name: backExitName,
        destination: u.here.id,
        owner: actor.id
      }
    });
    u.send(`You open back exit %ch${backExitName.split(";")[0]}%cn to ${u.util.displayName(u.here, actor)}.`);
  }

  // Decrease quota
  if (!isStaff) {
    actor.state.quota = quota - cost;
  }
};
