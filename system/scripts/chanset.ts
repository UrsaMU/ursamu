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

  const input = u.cmd.args.join(" ").trim();
  // Expect: <name>/<property>=<value>
  const match = input.match(/^([^/]+)\/(\w+)\s*=\s*(.*)$/);

  if (!match) {
    u.send("Usage: @chanset <name>/<property>=<value>");
    u.send("  Properties: header, lock, hidden (on/off), masking (on/off)");
    return;
  }

  const chanName = match[1].trim().toLowerCase();
  const property = match[2].trim().toLowerCase();
  const value = match[3].trim();

  const options: { header?: string; lock?: string; hidden?: boolean; masking?: boolean } = {};

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
    default:
      u.send(`Unknown property: ${property}. Valid: header, lock, hidden, masking`);
      return;
  }

  const result = await u.chan.set(chanName, options) as { error?: string };

  if (result?.error) {
    u.send(result.error);
    return;
  }

  u.send(`Channel %ch${chanName}%cn: ${property} set to "${value}".`);
};
