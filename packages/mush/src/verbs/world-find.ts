import { addCmd } from "../commands/addCmd.ts";
import type { IUrsamuSDK } from "../commands/types.ts";

export async function execFind(u: IUrsamuSDK): Promise<void> {
  const sw  = (u.cmd.args[0] || "").toLowerCase().trim();
  const arg = (u.cmd.args[1] || "").trim();
  if (!arg) {
    u.send("Usage: @find <name>  |  @find/flag <flag>  |  @find/type <type>");
    return;
  }

  const escaped = arg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  let results;
  if (sw === "flag") {
    results = await u.db.search({ flags: new RegExp(escaped, "i") });
  } else if (sw === "type") {
    results = await u.db.search({ flags: new RegExp(`\\b${escaped}\\b`, "i") });
  } else {
    results = await u.db.search({ "data.name": new RegExp(escaped, "i") });
  }

  if (!results.length) { u.send(`No objects found matching '${arg}'.`); return; }
  u.send(`%chFound ${results.length} object${results.length === 1 ? "" : "s"}:%cn`);
  for (const obj of results) {
    const name = (obj.state?.name as string) || obj.name || "(unnamed)";
    const flagList = obj.flags instanceof Set ? [...obj.flags].join(" ") : String(obj.flags);
    u.send(`  #${obj.id}  ${name}  [${flagList}]`);
  }
}

export async function execFlags(u: IUrsamuSDK): Promise<void> {
  const raw   = (u.cmd.args[0] || "").trim();
  const eqIdx = raw.indexOf("=");
  if (eqIdx === -1) { u.send("Usage: @flags <target>=<flags>"); return; }

  const targetName = raw.slice(0, eqIdx).trim();
  const flags      = raw.slice(eqIdx + 1).trim();
  if (!targetName || !flags) { u.send("Usage: @flags <target>=<flags>"); return; }

  const tar = await u.util.target(u.me, targetName);
  if (!tar) { u.send("I can't find that here."); return; }
  if (!(await u.canEdit(u.me, tar))) { u.send("Permission denied."); return; }

  await u.setFlags(tar.id, flags);
  u.send(`Flags set on ${u.util.displayName(tar, u.me)}.`);
}

addCmd({
  name: "@find",
  pattern: /^@(?:find|search)(?:\/(\S+))?\s+(.*)/i,
  lock: "connected",
  category: "Admin",
  help: `@find[/flag|/type] <name>  — Search all objects by name, flag, or type.

Examples:
  @find sword
  @find/flag wizard
  @find/type room`,
  exec: execFind,
});

addCmd({
  name: "@flags",
  pattern: /^@flags\s+(.*)/i,
  lock: "connected",
  category: "Admin",
  help: `@flags <target>=<flags>  — Set or clear flags on an object.

Examples:
  @flags sword=!dark
  @flags Alice=wizard`,
  exec: execFlags,
});
