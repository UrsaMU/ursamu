import { IUrsamuSDK } from "../../src/@types/UrsamuSDK.ts";

/**
 * Channel alias commands — MUX-style shorthand for the channel system.
 *
 *   @addcom <alias>=<channel>     Add a channel alias (join if not already on it)
 *   @delcom <alias>               Remove a channel alias (leave channel)
 *   @allcom                       List all your channel aliases
 *   @clearcom                     Remove all channel aliases (leave all)
 *   @comtitle <alias>=<title>     Set your title prefix for a channel
 */
export const aliases = ["addcom", "delcom", "allcom", "clearcom", "comtitle"];

export default async (u: IUrsamuSDK) => {
  const cmd = (u.cmd.original || u.cmd.name).replace(/^@/, "").toLowerCase();

  switch (cmd) {
    case "addcom": {
      const arg = (u.cmd.args[0] || "").trim();
      const eqIdx = arg.indexOf("=");
      if (eqIdx === -1) { u.send("Usage: @addcom <alias>=<channel>"); return; }
      const alias   = arg.slice(0, eqIdx).trim();
      const channel = arg.slice(eqIdx + 1).trim();
      if (!alias || !channel) { u.send("Usage: @addcom <alias>=<channel>"); return; }

      const existing = await u.chan.list() as Array<{ name: string }>;
      if (!existing.find(c => c.name.toLowerCase() === channel.toLowerCase())) {
        u.send(`No channel named "${channel}".`);
        return;
      }

      await u.chan.join(channel, alias);
      u.send(`Added alias %ch${alias}%cn for channel %ch${channel}%cn.`);
      break;
    }

    case "delcom": {
      const alias = (u.cmd.args[0] || "").trim();
      if (!alias) { u.send("Usage: @delcom <alias>"); return; }
      await u.chan.leave(alias);
      u.send(`Removed channel alias %ch${alias}%cn.`);
      break;
    }

    case "allcom": {
      const list = await u.chan.list() as Array<{ name: string; alias?: string; title?: string; active?: boolean }>;
      if (!list.length) { u.send("You have no channel aliases."); return; }
      u.send("--- Your Channel Aliases ---");
      for (const entry of list) {
        const status = entry.active === false ? "%cr[off]%cn" : "%cg[on]%cn";
        const title  = entry.title ? ` <${entry.title}>` : "";
        u.send(`  %ch${entry.alias || "?"}%cn → ${entry.name}${title} ${status}`);
      }
      u.send("----------------------------");
      break;
    }

    case "clearcom": {
      const list = await u.chan.list() as Array<{ alias?: string }>;
      for (const entry of list) {
        if (entry.alias) await u.chan.leave(entry.alias);
      }
      u.send("All channel aliases removed.");
      break;
    }

    case "comtitle": {
      const arg = (u.cmd.args[0] || "").trim();
      const eqIdx = arg.indexOf("=");
      if (eqIdx === -1) { u.send("Usage: @comtitle <alias>=<title>"); return; }
      const alias = arg.slice(0, eqIdx).trim();
      const title = arg.slice(eqIdx + 1).trim();
      if (!alias) { u.send("Usage: @comtitle <alias>=<title>"); return; }

      // Read the player's channels array and update the matching entry
      const playerObj = await u.db.search(u.me.id);
      const me = playerObj[0];
      if (!me) return;

      type ChanEntry = { id: string; channel: string; alias: string; title?: string; active: boolean };
      const channels = ((me.state as Record<string, unknown>).channels as ChanEntry[] | undefined)
        ?? (me.state.data as Record<string, unknown>)?.channels as ChanEntry[] | undefined
        ?? [];

      const entry = channels.find((c: ChanEntry) => c.alias === alias);
      if (!entry) { u.send(`No channel alias "${alias}" found.`); return; }

      entry.title = title || undefined;
      await u.db.modify(u.me.id, "$set", { "data.channels": channels });
      u.send(title
        ? `Title on %ch${alias}%cn set to: ${title}`
        : `Title on %ch${alias}%cn cleared.`);
      break;
    }
  }
};
