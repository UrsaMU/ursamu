import type { IUrsamuSDK } from "@ursamu/mush";

/**
 * @open[/inventory] <name>=<dest>[,<back exit>]
 *
 * Creates one or two exits from the current location (room or
 * enterable object / vehicle) to a destination.
 *
 * Switches:
 *   /inventory  Place the exit in inventory instead of here.
 *
 * Examples:
 *   @open North;N=#5
 *   @open Out=Dock Bay
 *   @open North;N=Library,South;S
 *   @open/inventory North=Cellar
 */
export default async (u: IUrsamuSDK) => {
  const actor    = u.me;
  const fullArgs = (u.cmd.args[0] || "").trim();
  const swtch    = (u.cmd.switches?.[0] || "").toLowerCase();

  const match = fullArgs.match(/^([^=,]+)\s*=\s*([^,]+)(?:,\s*(.*))?/i);
  if (!match) {
    u.send(
      "Usage: @open[/inventory] <name>=<dest>[,<back exit>]",
    );
    return;
  }

  const exitName     = match[1].trim();
  const destName     = match[2].trim();
  const backExitName = match[3] ? match[3].trim() : "";

  const searchResults = await u.db.search(destName);
  const destination   = searchResults[0];
  if (!destination) {
    u.send(`Could not find destination: ${destName}`);
    return;
  }

  const isStaff = actor.flags.has("wizard") ||
    actor.flags.has("admin") ||
    actor.flags.has("superuser");
  const quota   = (actor.state.quota as number) ?? 0;
  const cost    = 1 + (backExitName ? 1 : 0);

  if (!isStaff && quota < cost) {
    u.send(
      `You don't have enough quota. Cost: ${cost}, ` +
        `You have: ${quota}.`,
    );
    return;
  }

  if (backExitName && !(await u.canEdit(actor, destination))) {
    u.send(
      "Permission denied: you can't create a back exit there.",
    );
    return;
  }

  const location = swtch === "inventory" ? actor.id : u.here.id;
  if (
    swtch !== "inventory" &&
    !u.here.flags.has("room") &&
    !(await u.canEdit(actor, u.here))
  ) {
    u.send(
      "Permission denied: you don't control this object.",
    );
    return;
  }

  await u.db.create({
    flags: new Set(["exit"]),
    location,
    state: {
      name: exitName,
      destination: destination.id,
      owner: actor.id,
    },
  });
  u.send(
    `You open exit %ch${exitName.split(";")[0]}%cn to ` +
      `${u.util.displayName(destination, actor)}.`,
  );

  if (backExitName) {
    await u.db.create({
      flags: new Set(["exit"]),
      location: destination.id,
      state: {
        name: backExitName,
        destination: u.here.id,
        owner: actor.id,
      },
    });
    u.send(
      `You open back exit %ch${backExitName.split(";")[0]}%cn ` +
        `to ${u.util.displayName(u.here, actor)}.`,
    );
  }

  if (!isStaff) {
    await u.db.modify(actor.id, "$inc", { "data.quota": -cost });
  }
};
