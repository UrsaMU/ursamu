import { IUrsamuSDK } from "../../src/@types/UrsamuSDK.ts";

export const aliases = ["lock", "unlock"];

/**
 * System Script: lock.ts
 *
 * Usage:
 *   @lock <target>=<key>          — lock with basic lock
 *   @lock/<type> <target>=<key>   — lock with named type (e.g. /use)
 *   @unlock <target>              — remove basic lock
 *   @unlock/<type> <target>       — remove named lock
 */
export default async (u: IUrsamuSDK) => {
  const isUnlock = (u.cmd.name || "").toLowerCase().includes("unlock") ||
                   (u.cmd.original || "").toLowerCase().trimStart().startsWith("unlock") ||
                   (u.cmd.original || "").toLowerCase().trimStart().startsWith("@unlock");

  // Switch comes from cmdParser — @lock/use → u.cmd.switches[0] = "use"
  const type = (u.cmd.switches?.[0] || "basic").toLowerCase();

  const fullArgs = (u.cmd.args[0] || "");
  const eqIdx    = fullArgs.indexOf("=");
  const targetName = eqIdx === -1 ? fullArgs.trim() : fullArgs.slice(0, eqIdx).trim();
  const key        = eqIdx === -1 ? ""              : fullArgs.slice(eqIdx + 1).trim();

  const target = await u.util.target(u.me, targetName);
  if (!target) { u.send("I can't find that."); return; }
  if (!(await u.canEdit(u.me, target))) { u.send("Permission denied."); return; }

  if (isUnlock) {
    if (type === "basic") {
      await u.db.modify(target.id, "$set", { "data.lock": "" });
      u.send(`Unlocked ${u.util.displayName(target, u.me)}.`);
    } else {
      const locks = (target.state.locks || {}) as Record<string, string>;
      delete locks[type];
      await u.db.modify(target.id, "$set", { "data.locks": locks });
      u.send(`Unlocked ${u.util.displayName(target, u.me)} (${type}).`);
    }
    return;
  }

  if (!key) { u.send("You must specify a key."); return; }

  // Validate: balanced parens, no malformed operators
  let depth = 0;
  for (const ch of key) {
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    if (depth < 0) { u.send("Invalid lock: unbalanced parentheses."); return; }
  }
  if (depth !== 0) { u.send("Invalid lock: unbalanced parentheses."); return; }
  if (/^[&|]|[&|]$|[&|]{2,}/.test(key.replace(/\s/g, ""))) {
    u.send("Invalid lock: malformed operators."); return;
  }

  if (type === "basic") {
    await u.db.modify(target.id, "$set", { "data.lock": key });
    u.send(`Locked ${u.util.displayName(target, u.me)}.`);
  } else {
    const locks = (target.state.locks || {}) as Record<string, string>;
    locks[type] = key;
    await u.db.modify(target.id, "$set", { "data.locks": locks });
    u.send(`Locked ${u.util.displayName(target, u.me)} (${type}).`);
  }
};
