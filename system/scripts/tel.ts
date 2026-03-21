import { IUrsamuSDK } from "../../src/@types/UrsamuSDK.ts";

export const aliases = ["@tel"];

/**
 * System Script: tel.ts
 * Admin-only teleport: move any object/player to a destination room.
 * Usage: @tel <target>=<destination>
 */
export default async (u: IUrsamuSDK) => {
  const actor = u.me;

  if (!actor.flags.has("admin") && !actor.flags.has("wizard") && !actor.flags.has("superuser")) {
    u.send("Permission denied.");
    return;
  }

  const input = (u.cmd.args[0] || "").trim();
  const eqIdx = input.indexOf("=");
  if (eqIdx === -1) {
    u.send("Usage: @tel <target>=<destination>");
    return;
  }

  const targetName = input.slice(0, eqIdx).trim();
  const destName = input.slice(eqIdx + 1).trim();

  if (!targetName || !destName) {
    u.send("Usage: @tel <target>=<destination>");
    return;
  }

  const target = await u.util.target(actor, targetName);
  if (!target) {
    u.send(`I can't find '${targetName}'.`);
    return;
  }

  const dest = await u.util.target(actor, destName);
  if (!dest) {
    u.send(`I can't find destination '${destName}'.`);
    return;
  }

  await u.db.modify(target.id, "$set", { location: dest.id });

  u.send(`You are teleported to ${dest.name || dest.id}.`, target.id);
  u.send(`You teleport ${target.name || target.id} to ${dest.name || dest.id}.`);
};
