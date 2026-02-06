import { IUrsamuSDK } from "../../src/@types/UrsamuSDK.ts";

/**
 * System Script: channels.ts
 * Manages game channels (join, leave, list).
 */
export default async (u: IUrsamuSDK) => {
  const switchArg = u.cmd.name.split("/")[1] || "";
  const args = u.cmd.args;

  switch (switchArg) {
    case "join": {
      const [chan, alias] = args[0].split("=");
      if (!chan || !alias) {
        u.send("Usage: @channel/join <channel>=<alias>");
        return;
      }
      await u.chan.join(chan.trim(), alias.trim());
      u.send(`You have joined channel ${chan.trim()} with alias ${alias.trim()}.`);
      break;
    }
    case "leave": {
      const alias = args[0];
      if (!alias) {
        u.send("Usage: @channel/leave <alias>");
        return;
      }
      await u.chan.leave(alias.trim());
      u.send(`You have left the channel with alias ${alias.trim()}.`);
      break;
    }
    case "list":
    default: {
      const list = await u.chan.list();
      u.send("--- Channels ---");
      for (const chan of list as any[]) {
        u.send(`${chan.name} [${chan.alias || "No Alias"}]`);
      }
      u.send("----------------");
      break;
    }
  }
};
