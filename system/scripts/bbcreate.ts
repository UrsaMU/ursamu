import { IUrsamuSDK } from "../../src/@types/UrsamuSDK.ts";

/**
 * @bbcreate <name>[=<description>]
 * Create a new bulletin board. Admin/wizard only.
 */
export default async (u: IUrsamuSDK) => {
  const actor = u.me;
  if (!actor.flags.has("admin") && !actor.flags.has("wizard") && !actor.flags.has("superuser")) {
    u.send("Permission denied.");
    return;
  }

  const arg = (u.cmd.args[0] || "").trim();
  if (!arg) {
    u.send("Usage: @bbcreate <name>[=<description>]");
    return;
  }

  const eqIdx = arg.indexOf("=");
  const name = (eqIdx === -1 ? arg : arg.slice(0, eqIdx)).trim();
  const description = eqIdx !== -1 ? arg.slice(eqIdx + 1).trim() : undefined;

  if (!name) {
    u.send("Usage: @bbcreate <name>[=<description>]");
    return;
  }

  const result = await u.bb.createBoard(name, description ? { description } : undefined) as { id?: string; name?: string; error?: string };
  if (result?.error) {
    u.send(`Error: ${result.error}`);
    return;
  }

  u.send(`Board '${result.name}' created.`);
};
