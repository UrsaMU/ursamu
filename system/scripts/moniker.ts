import { IUrsamuSDK } from "../../src/@types/UrsamuSDK.ts";

export const aliases = ["moniker"];

export default async (u: IUrsamuSDK) => {
  const input = (u.cmd.args[0] || "").trim();
  const eqIdx = input.indexOf("=");

  if (eqIdx === -1) {
    return u.send("Usage: @moniker <target>=<moniker>");
  }

  const name = input.slice(0, eqIdx).trim();
  const moniker = input.slice(eqIdx + 1);

  if (!moniker.trim()) {
    return u.send("Usage: @moniker <target>=<moniker>");
  }

  const target = await u.util.target(u.me, name);
  if (!target) return u.send("I can't find that.");

  // Permission check
  if (!u.me.flags.has("admin") && !u.me.flags.has("wizard") && !u.me.flags.has("superuser")) {
      return u.send("Permission denied.");
  }

  const stripped = u.util.stripSubs(moniker.trim());
  if (!stripped) {
    return u.send("Moniker cannot be empty.");
  }

  await u.db.modify(target.id, "$set", { "data.moniker": moniker.trim() });
  
  u.send(`Set moniker for ${target.name} to ${moniker.trim()}.`);
};
