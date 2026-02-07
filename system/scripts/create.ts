import { IUrsamuSDK } from "../../src/@types/UrsamuSDK.ts";

/**
 * System Script: create.ts
 * Migrated from legacy @create command (thing creation).
 */
export default async (u: IUrsamuSDK) => {
  const actor = u.me;
  const input = u.cmd.args.join(" ").trim();

  if (!input) {
    u.send("Usage: @create <name>[=<cost>]");
    return;
  }

  const [name, costStr] = input.split("=");
  const objName = name.trim();
  const objCost = costStr ? parseInt(costStr.trim()) : 0;

  // Quota & Permission Check
  const isStaff = actor.flags.has("wizard") || actor.flags.has("admin") || actor.flags.has("superuser");
  const quota = (actor.state.quota as number) || 0;
  const cost = 1;

  if (!isStaff && quota < cost) {
    u.send(`You don't have enough quota. Cost: ${cost}, You have: ${quota}.`);
    return;
  }

  // Create the thing
  const thing = await u.db.create({
    flags: new Set(["thing"]),
    location: actor.id, // Appear in inventory
    state: {
      name: objName,
      owner: actor.id,
      value: objCost
    }
  });

  // Decrease quota
  if (!isStaff) {
    actor.state.quota = quota - cost;
  }

  u.send(`You create ${objName} (#${thing.id}).`);
};
