import { addCmd } from "../commands/addCmd.ts";
import type { IUrsamuSDK } from "../commands/types.ts";
import { validateLock } from "../world/locks.ts";

addCmd({
  name: "@lock",
  pattern: /^[@+]?lock(?:\/(\w+))?\s+([^=]+)\s*=\s*(.*)/i,
  lock: "connected builder+",
  category: "Building",
  help: `@lock[/<switch>] <target>=<lock>  — Set the default or named lock on an object.

SWITCHES
  /<name>   Set a named lock (e.g. @lock/use obj=flag(wizard)).

EXAMPLES
  @lock door=flag(wizard)
  @lock/use chest=holds(#5)`,
  exec: async (u: IUrsamuSDK) => {
    const sw  = (u.cmd.args[0] ?? "").trim();
    const obj = (u.cmd.args[1] ?? "").trim();
    const key = (u.cmd.args[2] ?? "").trim();

    const tar = await u.util.target(u.me, obj);
    if (!tar) { u.send("You can't lock that."); return; }
    if (!(await u.canEdit(u.me, tar))) { u.send("You can't lock that."); return; }
    if (!(await validateLock(key))) { u.send("Invalid lock string."); return; }

    if (sw) {
      const locks = (tar.state.locks as Record<string, string> | undefined) ?? {};
      locks[sw.toLowerCase()] = key;
      await u.db.modify(tar.id, "$set", { "data.locks": locks });
      u.send(`You lock ${u.util.displayName(tar, u.me)} (${sw.toLowerCase()}).`);
    } else {
      await u.db.modify(tar.id, "$set", { "data.lock": key });
      u.send(`You lock ${u.util.displayName(tar, u.me)}.`);
    }
  },
});

addCmd({
  name: "@unlock",
  pattern: /^[@+]?unlock(?:\/(\w+))?\s+(.*)/i,
  lock: "connected builder+",
  category: "Building",
  help: `@unlock[/<switch>] <target>  — Remove the default or named lock on an object.

SWITCHES
  /<name>   Remove a named lock.

EXAMPLES
  @unlock door
  @unlock/use chest`,
  exec: async (u: IUrsamuSDK) => {
    const sw  = (u.cmd.args[0] ?? "").trim();
    const obj = (u.cmd.args[1] ?? "").trim();

    const tar = await u.util.target(u.me, obj);
    if (!tar) { u.send("You can't unlock that."); return; }
    if (!(await u.canEdit(u.me, tar))) { u.send("You can't unlock that."); return; }

    if (sw) {
      const locks = (tar.state.locks as Record<string, string> | undefined) ?? {};
      delete locks[sw.toLowerCase()];
      await u.db.modify(tar.id, "$set", { "data.locks": locks });
      u.send(`You unlock ${u.util.displayName(tar, u.me)} (${sw.toLowerCase()}).`);
    } else {
      await u.db.modify(tar.id, "$set", { "data.lock": "" });
      u.send(`You unlock ${u.util.displayName(tar, u.me)}.`);
    }
  },
});
