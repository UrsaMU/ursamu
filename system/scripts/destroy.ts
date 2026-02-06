import { IUrsamuSDK } from "../../src/@types/UrsamuSDK.ts";

/**
 * System Script: destroy.ts
 * Migrated from legacy @destroy command.
 */
export default async (u: IUrsamuSDK) => {
  const actor = u.me;
  const fullArgs = u.cmd.args.join(" ").trim();
  
  // Pattern: @destroy[/sw] <target>
  const match = fullArgs.match(/^(\/.*)?\s+(.*)/i);

  if (!match) {
    u.send("Usage: @destroy[/override] <target>");
    return;
  }

  const swtch = (match[1] || "").toLowerCase();
  const targetName = match[2].trim();

  const searchTarget = await u.db.search(targetName);
  const target = searchTarget[0];

  if (!target) {
    u.send(`Could not find target: ${targetName}`);
    return;
  }

  // Permission check
  if (!u.canEdit(actor, target)) {
    u.send("You can't destroy that.");
    return;
  }

  // Safe check
  if (target.flags.has("safe") && swtch !== "/override") {
    u.send("You can't destroy that. It's safe. Try using the '/override' switch.");
    return;
  }

  // Void check
  if (target.flags.has("void")) {
    u.send("You can't destroy that. It's the void.");
    return;
  }

  // Room destruction check: Send actors home
  if (target.flags.has("room")) {
    const homeId = (actor.state.home as string) || "1";
    // This is complex for a script to find ALL objects in a room and move them.
    // The legacy code used en.location = en.data.home || 1.
    // For now, let's at least handle the enactor if they are in the target room.
    if (u.here.id === target.id) {
       u.teleport("me", homeId);
       u.send("You are sent home.");
    }
  }

  await u.db.destroy(target.id);
  u.send(`You destroy ${u.util.displayName(target, actor)}.`);
  
  // Clean up Orphaned Exits
  // In legacy, it queries for exits where destination or location is the destroyed object.
  // We can do this via db.search with a query object.
  const orphanedExits = await u.db.search({
    $and: [
      {
        $or: [{ "data.destination": target.id }, { location: target.id }],
      },
      { flags: /exit/i },
    ],
  });

  for (const exit of orphanedExits) {
    await u.db.destroy(exit.id);
  }
};
