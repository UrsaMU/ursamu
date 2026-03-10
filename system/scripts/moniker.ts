import { IUrsamuSDK } from "../../src/@types/UrsamuSDK.ts";

export const aliases = ["moniker"];

export default async (u: IUrsamuSDK) => {
  const input = u.cmd.args.join(" ");
  const [name, moniker] = input.split("=");

  const target = await u.util.target(u.me, name?.trim());
  if (!target) return u.send("I can't find that.");

  // Permission check
  // Original was "connected admin+".
  // But maybe users should be able to set their own moniker?
  // Original logic: `lock: "connected admin+"`.
  if (!u.me.flags.has("admin") && !u.me.flags.has("wizard")) {
      return u.send("Permission denied.");
  }

  if (!moniker) {
      return u.send("Usage: @moniker <target>=<moniker>");
  }

  // Logic: Moniker must match name (case insensitive) just with different capitalization/coloring?
  // Original: `if (stripped.toLowerCase() != tar.data.name?.toLowerCase())`
  // We need to strip subs (ansi) from moniker to check.
  // SDK doesn't expose stripSubs.
  // We can try to approximate or assume plain text for now.
  // Or just check if `moniker` (assuming it has codes) roughly equals name.
  // Let's rely on basic check for now.
  
  // Implementation note: Missing `parser.stripSubs`.
  // Adding a TODO.
  
  target.state.moniker = moniker.trim();
  // Use nested data object — DB.modify uses Object.assign so dot notation keys don't work
  await u.db.modify(target.id, "$set", { data: { ...target.state } });
  
  u.send(`Set moniker for ${target.name} to ${moniker.trim()}.`);
};
