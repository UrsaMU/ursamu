import { IUrsamuSDK } from "../../src/@types/UrsamuSDK.ts";

export const aliases = ["chanset", "@chanset"];

/**
 * System Script: chanset.ts
 * Modifies an existing channel's properties. Admin/wizard only.
 * Usage: @chanset <name>/<property>=<value>
 *   Properties: header, lock, hidden (on/off), masking (on/off)
 * Examples:
 *   @chanset public/header=[PUB]
 *   @chanset public/lock=player+
 *   @chanset public/hidden=on
 *   @chanset public/masking=on
 */
export default async (u: IUrsamuSDK) => {
  const actor = u.me;

  if (!actor.flags.has("admin") && !actor.flags.has("wizard") && !actor.flags.has("superuser")) {
    u.send("Permission denied.");
    return;
  }

  const input = (u.cmd.args[0] || "").trim();
  // Expect: <name>/<property>=<value>
  const match = input.match(/^([^/]+)\/(\w+)\s*=\s*(.*)$/);

  if (!match) {
    u.send("Usage: @chanset <name>/<property>=<value>");
    u.send("  Properties: header, lock, hidden (on/off), masking (on/off), log (on/off), historyLimit (<n>)");
    return;
  }

  const chanName = match[1].trim().toLowerCase();
  const property = match[2].trim().toLowerCase();
  const value = match[3].trim();

  // Only the channel owner or a superuser may modify the channel.
  if (!actor.flags.has("superuser")) {
    const allChans = await u.chan.list() as { name: string; owner?: string }[];
    const chanObj = allChans.find(c => c.name === chanName);
    if (chanObj && chanObj.owner !== `#${actor.id}` && chanObj.owner !== actor.id) {
      u.send("Permission denied. Only the channel owner or a superuser may modify this channel.");
      return;
    }
  }

  const options: { header?: string; lock?: string; hidden?: boolean; masking?: boolean; logHistory?: boolean; historyLimit?: number } = {};

  switch (property) {
    case "header":
      options.header = value;
      break;
    case "lock":
      options.lock = value;
      break;
    case "hidden":
      options.hidden = value.toLowerCase() === "on" || value.toLowerCase() === "yes" || value === "1";
      break;
    case "masking":
      options.masking = value.toLowerCase() === "on" || value.toLowerCase() === "yes" || value === "1";
      break;
    case "log":
    case "loghistory":
      options.logHistory = value.toLowerCase() === "on" || value.toLowerCase() === "yes" || value === "1";
      break;
    case "historylimit": {
      const n = parseInt(value);
      if (isNaN(n) || n < 1 || n > 5000) {
        u.send("historyLimit must be a number between 1 and 5000.");
        return;
      }
      options.historyLimit = n;
      break;
    }
    default:
      u.send(`Unknown property: ${property}. Valid: header, lock, hidden, masking, log, historyLimit`);
      return;
  }

  const result = await u.chan.set(chanName, options) as { error?: string };

  if (result?.error) {
    u.send(result.error);
    return;
  }

  u.send(`Channel %ch${chanName}%cn: ${property} set to "${value}".`);
};
