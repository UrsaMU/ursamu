import { addCmd } from "../services/commands/index.ts";
import type { IUrsamuSDK } from "../@types/UrsamuSDK.ts";
import { logSecurity } from "../utils/logger.ts";

/** Check whether a flags value (Set or space-delimited string) contains a flag. */
const hasFlag = (flags: Set<string> | string | unknown, flag: string): boolean => {
  if (flags instanceof Set) return flags.has(flag);
  if (typeof flags === "string") return flags.includes(flag);
  return false;
};

export default () => {
  addCmd({
    name: "@boot",
    pattern: /^@boot\s+(.*)/i,
    lock: "connected & admin+",
    help: "Disconnect a player",
    category: "admin",
    exec: async (u: IUrsamuSDK) => {
      const tar = await u.util.target(u.me, u.cmd.args[0]);
      if (!tar) return u.send("Player not found.");
      if (!hasFlag(tar.flags, "player")) return u.send("You can only boot players.");
      if (hasFlag(tar.flags, "superuser")) return u.send("You cannot boot a superuser.");
      await logSecurity("ADMIN_BOOT", { actor: u.me.id, target: tar.id });
      u.send("You are being booted from the server.", tar.id);
      await u.sys.disconnect(tar.id);
      u.send(`You booted ${u.util.displayName(tar, u.me)}.`);
    },
  });

  addCmd({
    name: "@toad",
    pattern: /^@toad\s+(.*)/i,
    lock: "connected & admin+",
    help: "Destroy a player",
    category: "admin",
    exec: async (u: IUrsamuSDK) => {
      const tar = await u.util.target(u.me, u.cmd.args[0]);
      if (!tar || !hasFlag(tar.flags, "player")) return u.send("Player not found.");
      if (hasFlag(tar.flags, "superuser")) return u.send("You cannot toad a superuser.");
      await logSecurity("ADMIN_TOAD", { actor: u.me.id, target: tar.id });
      u.send("You have been toaded.", tar.id);
      await u.sys.disconnect(tar.id);
      await u.force(`@destroy ${tar.id}`);
      u.send(`You toaded ${String(tar.state.name || tar.id)}.`);
    },
  });

  addCmd({
    name: "@newpassword",
    pattern: /^@newpass(?:word)?\s+(.*)\s*=\s*(.*)/i,
    lock: "connected & admin+",
    help: "Change a player's password",
    category: "admin",
    exec: async (u: IUrsamuSDK) => {
      const [name, pass] = u.cmd.args;
      const tar = await u.util.target(u.me, name);
      if (!tar || !hasFlag(tar.flags, "player")) return u.send("Player not found.");
      await logSecurity("ADMIN_NEWPASSWORD", { actor: u.me.id, target: tar.id });
      await u.auth.setPassword(tar.id, pass);
      u.send(`Password for ${u.util.displayName(tar, u.me)} changed.`);
      u.send(`Your password has been changed by ${u.util.displayName(u.me, u.me)}.`, tar.id);
    },
  });

  addCmd({
    name: "@chown",
    pattern: /^@chown\s+(.*)\s*=\s*(.*)/i,
    lock: "connected & admin+",
    help: "Change ownership of an object",
    category: "admin",
    exec: async (u: IUrsamuSDK) => {
      const [thingName, newOwnerName] = u.cmd.args;
      const thing = await u.util.target(u.me, thingName);
      const newOwner = await u.util.target(u.me, newOwnerName);
      if (!thing) return u.send("Object not found.");
      if (!newOwner || !hasFlag(newOwner.flags, "player")) return u.send("New owner not found.");
      await u.db.modify(thing.id, "$set", { "data.owner": newOwner.id });
      u.send(`Owner of ${u.util.displayName(thing, u.me)} changed to ${u.util.displayName(newOwner, u.me)}.`);
    },
  });

  addCmd({
    name: "@resettoken",
    pattern: /^@resettoken\s+(.*)/i,
    lock: "connected & admin+",
    help: "Generate a one-time password-reset token for a player",
    category: "admin",
    exec: async (u: IUrsamuSDK) => {
      const tar = await u.util.target(u.me, u.cmd.args[0]);
      if (!tar || !hasFlag(tar.flags, "player")) return u.send("Player not found.");
      const token = crypto.randomUUID();
      const expiry = Date.now() + 60 * 60 * 1000; // 1 hour
      await u.db.modify(tar.id, "$set", { "data.resetToken": token, "data.resetTokenExpiry": expiry });
      await logSecurity("ADMIN_RESETTOKEN", { actor: u.me.id, target: tar.id });
      // Show full token only to the admin who generated it; log only a truncated version
      u.send(`Reset token for ${u.util.displayName(tar, u.me)}: ${token} (expires in 1 hour)`);
      u.send(`%ch%cyWARNING:%cn Copy this token now — it will not be shown again.`);
    },
  });

  const ALLOWED_SITE_CONFIGS = new Set([
    "server.name",
    "server.description",
    "server.banner",
    "server.corsOrigins",
    "server.maxConnections",
    "game.maxPlayers",
    "game.description",
    "game.loginMessage",
    "game.welcomeMessage",
  ]);

  addCmd({
    name: "@site",
    pattern: /^@site\s+(.*)\s*=\s*(.*)/i,
    lock: "connected & admin+",
    help: "Set site configuration",
    category: "admin",
    exec: async (u: IUrsamuSDK) => {
      const [setting, value] = u.cmd.args;
      if (!ALLOWED_SITE_CONFIGS.has(setting)) {
        await logSecurity("ADMIN_SITE_BLOCKED", { actor: u.me.id, setting, value });
        return u.send(`Unknown or protected config key: ${setting}. Allowed: ${[...ALLOWED_SITE_CONFIGS].join(", ")}`);
      }
      await logSecurity("ADMIN_SITE_SET", { actor: u.me.id, setting, value });
      await u.sys.setConfig(setting, value);
      u.send(`Config ${setting} set to ${value}.`);
    },
  });
};
