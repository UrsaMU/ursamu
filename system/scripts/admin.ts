import { IUrsamuSDK } from "../../src/@types/UrsamuSDK.ts";

export const aliases = ["toad", "newpassword", "newpass", "chown", "site", "reboot", "restart", "shutdown"];

export default async (u: IUrsamuSDK) => {
  const cmd = u.cmd.original?.toLowerCase() || u.cmd.name.toLowerCase();
  const args = u.cmd.args;
  const rawArgs = args[0]; // The full argument string "target=value" or "target"

  // 1. Permission Check
  if (!u.me.flags.has("admin") && !u.me.flags.has("wizard")) {
    u.send("Permission denied.");
    return;
  }

  // 2. Dispatch
  switch (cmd) {
    case "boot":
    case "@boot":
      await handleBoot(u, rawArgs);
      break;
    case "toad":
    case "@toad":
      await handleToad(u, rawArgs);
      break;
    case "newpassword":
    case "newpass":
    case "@newpassword":
    case "@newpass":
      await handleNewPass(u, rawArgs);
      break;
    case "chown":
    case "@chown":
      await handleChown(u, rawArgs);
      break;
    case "site":
    case "@site":
      await handleSite(u, rawArgs);
      break;
    case "reboot":
    case "@reboot":
    case "restart":
    case "@restart":
      await handleReboot(u);
      break;
    case "shutdown":
    case "@shutdown":
      await handleShutdown(u);
      break;
    default:
      u.send("Unknown admin command.");
  }
};

async function handleBoot(u: IUrsamuSDK, args: string) {
  if (!args) return u.send("Usage: @boot <player>");

  const target = await u.util.target(u.me, args);
  if (!target) return u.send("Player not found.");

  if (!target.flags.has("player")) {
    return u.send("You can only boot players.");
  }

  if (target.flags.has("superuser")) {
    return u.send("You cannot boot a superuser.");
  }

  u.send("You have been booted from the server.", target.id);
  await u.sys.disconnect(target.id);
  u.send(`You booted ${u.util.displayName(target, u.me)}.`);
}

async function handleToad(u: IUrsamuSDK, args: string) {
  if (!args) return u.send("Usage: @toad <player>");

  const target = await u.util.target(u.me, args);
  if (!target || !target.flags.has("player")) {
    return u.send("Player not found.");
  }

  if (target.flags.has("superuser")) {
    return u.send("You cannot toad a superuser.");
  }

  u.send("You have been toaded. Your character has been destroyed.", target.id);
  await u.sys.disconnect(target.id);
  await u.db.destroy(target.id);
  u.send(`You toaded ${u.util.displayName(target, u.me)}.`);
}

async function handleNewPass(u: IUrsamuSDK, args: string) {
  if (!args) return u.send("Usage: @newpass <player>=<password>");

  const eqIdx = args.indexOf("=");
  if (eqIdx === -1) return u.send("Usage: @newpass <player>=<password>");

  const name = args.slice(0, eqIdx).trim();
  const pass = args.slice(eqIdx + 1).trim();

  if (!name || !pass) return u.send("Usage: @newpass <player>=<password>");

  const target = await u.util.target(u.me, name);
  if (!target || !target.flags.has("player")) {
    return u.send("Player not found.");
  }

  await u.auth.setPassword(target.id, pass);
  u.send(`Password for ${u.util.displayName(target, u.me)} has been changed.`);
}

async function handleChown(u: IUrsamuSDK, args: string) {
  if (!args) return u.send("Usage: @chown <object>=<player>");

  const eqIdx = args.indexOf("=");
  if (eqIdx === -1) return u.send("Usage: @chown <object>=<player>");

  const thingName = args.slice(0, eqIdx).trim();
  const newOwnerName = args.slice(eqIdx + 1).trim();

  if (!thingName || !newOwnerName) return u.send("Usage: @chown <object>=<player>");

  const thing = await u.util.target(u.me, thingName);
  const newOwner = await u.util.target(u.me, newOwnerName);

  if (!thing) return u.send("Object not found.");
  if (!newOwner || !newOwner.flags.has("player")) return u.send("New owner not found.");

  await u.db.modify(thing.id, "$set", { data: { owner: newOwner.id } });
  u.send(`Owner of ${u.util.displayName(thing, u.me)} changed to ${u.util.displayName(newOwner, u.me)}.`);
}

async function handleSite(u: IUrsamuSDK, args: string) {
  if (!args) return u.send("Usage: @site <key>=<value>");

  const eqIdx = args.indexOf("=");
  if (eqIdx === -1) return u.send("Usage: @site <key>=<value>");

  const key = args.slice(0, eqIdx).trim();
  const value = args.slice(eqIdx + 1).trim();

  if (!key || !value) return u.send("Usage: @site <key>=<value>");

  await u.sys.setConfig(key, value);
  u.send(`Config ${key} set to ${value}.`);
}

async function handleReboot(u: IUrsamuSDK) {
  u.here.broadcast(`%chGame>%cn Server @reboot initiated by ${u.me.name}...`);
  await u.sys.reboot();
}

async function handleShutdown(u: IUrsamuSDK) {
  u.here.broadcast(`%chGame>%cn Server shutdown initiated by ${u.me.name}...`);
  await u.sys.shutdown();
}
