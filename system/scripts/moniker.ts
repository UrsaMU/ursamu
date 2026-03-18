import { IUrsamuSDK } from "../../src/@types/UrsamuSDK.ts";

export const aliases = ["moniker"];

export default async (u: IUrsamuSDK) => {
  const input = (u.cmd.args[0] || "").trim();
  const [name, moniker] = input.split("=");

  const target = await u.util.target(u.me, name?.trim());
  if (!target) return u.send("I can't find that.");

  // Permission check
  // Original was "connected admin+".
  // But maybe users should be able to set their own moniker?
  // Original logic: `lock: "connected admin+"`.
  if (!u.me.flags.has("admin") && !u.me.flags.has("wizard") && !u.me.flags.has("superuser")) {
      return u.send("Permission denied.");
  }

  if (!moniker) {
      return u.send("Usage: @moniker <target>=<moniker>");
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
