import { IUrsamuSDK } from "../../src/@types/UrsamuSDK.ts";

export const aliases = ["moniker"];

export default async (u: IUrsamuSDK) => {
  const input = u.cmd.args.join(" ");
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
  if (!u.me.flags.has("admin") && !u.me.flags.has("wizard")) {
      return u.send("Permission denied.");
  }

  const stripped = u.util.stripSubs(moniker.trim());
  if (!stripped) {
    return u.send("Moniker cannot be empty.");
  }

  target.state.moniker = moniker.trim();
  // Use nested data object — DB.modify uses Object.assign so dot notation keys don't work
  await u.db.modify(target.id, "$set", { data: { ...target.state } });
  
  u.send(`Set moniker for ${target.name} to ${moniker.trim()}.`);
};
