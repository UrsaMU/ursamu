import { addCmd } from "../services/commands/index.ts";
import type { IUrsamuSDK } from "../@types/UrsamuSDK.ts";
import { logSecurity } from "../utils/logger.ts";

/** Check whether a flags value (Set or space-delimited string) contains a flag. */
const hasFlag = (flags: Set<string> | string | unknown, flag: string): boolean => {
  if (flags instanceof Set) return flags.has(flag);
  if (typeof flags === "string") return flags.includes(flag);
  return false;
};

export async function execBoot(u: IUrsamuSDK): Promise<void> {
  const isAdmin = u.me.flags.has("admin") || u.me.flags.has("wizard") || u.me.flags.has("superuser");
  if (!isAdmin) { u.send("Permission denied."); return; }
  const arg = (u.cmd.args[0] || "").trim();
  if (!arg) { u.send("Usage: @boot <player>"); return; }
  const tar = await u.util.target(u.me, arg);
  if (!tar) return u.send("Player not found.");
  if (!hasFlag(tar.flags, "player")) return u.send("You can only boot players.");
  if (hasFlag(tar.flags, "superuser")) return u.send("You cannot boot a superuser.");
  await logSecurity("ADMIN_BOOT", { actor: u.me.id, target: tar.id });
  u.send("You are being booted from the server.", tar.id);
  await u.sys.disconnect(tar.id);
  u.send(`You booted ${u.util.displayName(tar, u.me)}.`);
}

export async function execToad(u: IUrsamuSDK): Promise<void> {
  const isAdmin = u.me.flags.has("admin") || u.me.flags.has("wizard") || u.me.flags.has("superuser");
  if (!isAdmin) { u.send("Permission denied."); return; }
  const tar = await u.util.target(u.me, u.cmd.args[0]);
  if (!tar || !hasFlag(tar.flags, "player")) return u.send("Player not found.");
  if (hasFlag(tar.flags, "superuser")) return u.send("You cannot toad a superuser.");
  await logSecurity("ADMIN_TOAD", { actor: u.me.id, target: tar.id });
  u.send("You have been toaded.", tar.id);
  await u.sys.disconnect(tar.id);
  await u.db.destroy(tar.id);
  u.send(`You toaded ${String(tar.state.name || tar.id)}.`);
}

export async function execNewpassword(u: IUrsamuSDK): Promise<void> {
  const isAdmin = u.me.flags.has("admin") || u.me.flags.has("wizard") || u.me.flags.has("superuser");
  if (!isAdmin) { u.send("Permission denied."); return; }
  const name = (u.cmd.args[0] || "").trim();
  const pass = (u.cmd.args[1] || "").trim();
  if (!name || !pass) { u.send("Usage: @newpassword <player>=<password>"); return; }
  const tar = await u.util.target(u.me, name);
  if (!tar || !hasFlag(tar.flags, "player")) return u.send("Player not found.");
  await logSecurity("ADMIN_NEWPASSWORD", { actor: u.me.id, target: tar.id });
  await u.auth.setPassword(tar.id, pass);
  u.send(`Password for ${u.util.displayName(tar, u.me)} changed.`);
  u.send(`Your password has been changed by ${u.util.displayName(u.me, u.me)}.`, tar.id);
}

export async function execChown(u: IUrsamuSDK): Promise<void> {
  const isAdmin = u.me.flags.has("admin") || u.me.flags.has("wizard") || u.me.flags.has("superuser");
  if (!isAdmin) { u.send("Permission denied."); return; }
  const thingName = (u.cmd.args[0] || "").trim();
  const newOwnerName = (u.cmd.args[1] || "").trim();
  if (!thingName || !newOwnerName) { u.send("Usage: @chown <object>=<player>"); return; }
  const thing = await u.util.target(u.me, thingName);
  const newOwner = await u.util.target(u.me, newOwnerName);
  if (!thing) return u.send("Object not found.");
  if (!newOwner || !hasFlag(newOwner.flags, "player")) return u.send("New owner not found.");
  await u.db.modify(thing.id, "$set", { "data.owner": newOwner.id });
  u.send(`Owner of ${u.util.displayName(thing, u.me)} changed to ${u.util.displayName(newOwner, u.me)}.`);
}

export async function execResetToken(u: IUrsamuSDK): Promise<void> {
  const tar = await u.util.target(u.me, u.cmd.args[0]);
  if (!tar || !hasFlag(tar.flags, "player")) return u.send("Player not found.");
  const token = crypto.randomUUID();
  const expiry = Date.now() + 60 * 60 * 1000; // 1 hour
  await u.db.modify(tar.id, "$set", { "data.resetToken": token, "data.resetTokenExpiry": expiry });
  await logSecurity("ADMIN_RESETTOKEN", { actor: u.me.id, target: tar.id });
  u.send(`Reset token for ${u.util.displayName(tar, u.me)}: ${token} (expires in 1 hour)`);
}

const ALLOWED_SITE_CONFIGS = new Set([
  "server.name",
  "server.motd",
  "server.description",
  "server.banner",
  "server.corsOrigins",
  "server.maxConnections",
  "game.maxPlayers",
  "game.description",
  "game.loginMessage",
  "game.welcomeMessage",
]);

export async function execSite(u: IUrsamuSDK): Promise<void> {
  const isAdmin = u.me.flags.has("admin") || u.me.flags.has("wizard") || u.me.flags.has("superuser");
  if (!isAdmin) { u.send("Permission denied."); return; }
  const setting = (u.cmd.args[0] || "").trim();
  const value = (u.cmd.args[1] ?? "").trim();
  if (!setting) { u.send("Usage: @site <key>=<value>"); return; }
  if (!ALLOWED_SITE_CONFIGS.has(setting)) {
    await logSecurity("ADMIN_SITE_BLOCKED", { actor: u.me.id, setting, value });
    return u.send(`Unknown or protected config key: ${setting}. Allowed: ${[...ALLOWED_SITE_CONFIGS].join(", ")}`);
  }
  await logSecurity("ADMIN_SITE_SET", { actor: u.me.id, setting, value });
  await u.sys.setConfig(setting, value);
  u.send(`Config ${setting} set to ${value}.`);
}

export async function execShutdown(u: IUrsamuSDK): Promise<void> {
  const isAdmin = u.me.flags.has("admin") || u.me.flags.has("wizard") || u.me.flags.has("superuser");
  if (!isAdmin) { u.send("Permission denied."); return; }
  u.here.broadcast(
    `%chGame>%cn Server @shutdown initiated by %ch${u.me.name || u.me.id}%cn.`
  );
  await u.sys.shutdown();
}

export default () => {
  addCmd({
    name: "@boot",
    pattern: /^@boot\s+(.*)/i,
    lock: "connected & admin+",
    help: "Disconnect a player",
    category: "admin",
    exec: execBoot,
  });

  addCmd({
    name: "@toad",
    pattern: /^@toad\s+(.*)/i,
    lock: "connected & admin+",
    help: "Destroy a player",
    category: "admin",
    exec: execToad,
  });

  addCmd({
    name: "@newpassword",
    pattern: /^@newpass(?:word)?\s+(.*)\s*=\s*(.*)/i,
    lock: "connected & admin+",
    help: "Change a player's password",
    category: "admin",
    exec: execNewpassword,
  });

  addCmd({
    name: "@chown",
    pattern: /^@chown\s+(.*)\s*=\s*(.*)/i,
    lock: "connected & admin+",
    help: "Change ownership of an object",
    category: "admin",
    exec: execChown,
  });

  addCmd({
    name: "@resettoken",
    pattern: /^@resettoken\s+(.*)/i,
    lock: "connected & admin+",
    help: "Generate a one-time password-reset token for a player",
    category: "admin",
    exec: execResetToken,
  });

  addCmd({
    name: "@site",
    pattern: /^@site\s+(.*)\s*=\s*(.*)/i,
    lock: "connected & admin+",
    help: "Set site configuration",
    category: "admin",
    exec: execSite,
  });

  addCmd({
    name: "@shutdown",
    pattern: /^@shutdown$/i,
    lock: "connected & admin+",
    help: "Shut down the server",
    category: "admin",
    exec: execShutdown,
  });
};
