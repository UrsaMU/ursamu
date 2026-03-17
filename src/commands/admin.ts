import { addCmd } from "../services/commands/index.ts";
import type { IUrsamuSDK } from "../@types/UrsamuSDK.ts";

export default () => {
  addCmd({
    name: "@boot",
    pattern: /^@boot\s+(.*)/i,
    lock: "connected admin+",
    help: "Disconnect a player",
    category: "admin",
    exec: async (u: IUrsamuSDK) => {
      const tar = await u.util.target(u.me, u.cmd.args[0]);
      if (!tar) return u.send("Player not found.");
      if (!tar.flags.has("player")) return u.send("You can only boot players.");
      if (tar.flags.has("superuser")) return u.send("You cannot boot a superuser.");
      u.send("You are being booted from the server.", tar.id);
      await u.sys.disconnect(tar.id);
      u.send(`You booted ${u.util.displayName(tar, u.me)}.`);
    },
  });

  addCmd({
    name: "@toad",
    pattern: /^@toad\s+(.*)/i,
    lock: "connected admin+",
    help: "Destroy a player",
    category: "admin",
    exec: async (u: IUrsamuSDK) => {
      const tar = await u.util.target(u.me, u.cmd.args[0]);
      if (!tar || !tar.flags.has("player")) return u.send("Player not found.");
      if (tar.flags.has("superuser")) return u.send("You cannot toad a superuser.");
      u.send("You have been toaded.", tar.id);
      await u.sys.disconnect(tar.id);
      await u.force(`@destroy ${tar.id}`);
      u.send(`You toaded ${String(tar.state.name || tar.id)}.`);
    },
  });

  addCmd({
    name: "@newpassword",
    pattern: /^@newpass(?:word)?\s+(.*)\s*=\s*(.*)/i,
    lock: "connected admin+",
    help: "Change a player's password",
    category: "admin",
    exec: async (u: IUrsamuSDK) => {
      const [name, pass] = u.cmd.args;
      const tar = await u.util.target(u.me, name);
      if (!tar || !tar.flags.has("player")) return u.send("Player not found.");
      await u.auth.setPassword(tar.id, pass);
      u.send(`Password for ${u.util.displayName(tar, u.me)} changed.`);
      u.send(`Your password has been changed by ${u.util.displayName(u.me, u.me)}.`, tar.id);
    },
  });

  addCmd({
    name: "@chown",
    pattern: /^@chown\s+(.*)\s*=\s*(.*)/i,
    lock: "connected admin+",
    help: "Change ownership of an object",
    category: "admin",
    exec: async (u: IUrsamuSDK) => {
      const [thingName, newOwnerName] = u.cmd.args;
      const thing = await u.util.target(u.me, thingName);
      const newOwner = await u.util.target(u.me, newOwnerName);
      if (!thing) return u.send("Object not found.");
      if (!newOwner || !newOwner.flags.has("player")) return u.send("New owner not found.");
      await u.db.modify(thing.id, "$set", { data: { ...thing.state, owner: newOwner.id } });
      u.send(`Owner of ${u.util.displayName(thing, u.me)} changed to ${u.util.displayName(newOwner, u.me)}.`);
    },
  });

  addCmd({
    name: "@site",
    pattern: /^@site\s+(.*)\s*=\s*(.*)/i,
    lock: "connected admin+",
    help: "Set site configuration",
    category: "admin",
    exec: async (u: IUrsamuSDK) => {
      const [setting, value] = u.cmd.args;
      await u.sys.setConfig(setting, value);
      u.send(`Config ${setting} set to ${value}.`);
    },
  });
};
