import { addCmd } from "../commands/addCmd.ts";
import type { IUrsamuSDK } from "../commands/types.ts";
import { log } from "@ursamu/core";

// ── @flags / @set ─────────────────────────────────────────────────────────────

async function execSetFlags(u: IUrsamuSDK): Promise<void> {
  const raw    = u.util.stripSubs(u.cmd.args[0] ?? "").trim();
  const eqIdx  = raw.indexOf("=");
  if (eqIdx === -1) { u.send("Usage: @flags <target>=<flags>"); return; }
  const targetStr = raw.slice(0, eqIdx).trim();
  const flagStr   = raw.slice(eqIdx + 1).trim();
  if (!targetStr || !flagStr) { u.send("Usage: @flags <target>=<flags>"); return; }
  const tar = await u.util.target(u.me, targetStr);
  if (!tar) { u.send("I can't find that here."); return; }
  if (!(await u.canEdit(u.me, tar))) { u.send("Permission denied."); return; }
  await u.setFlags(tar.id, flagStr);
  u.send(`Flags set on ${u.util.displayName(tar, u.me)}.`);
}

addCmd({
  name: "@flags",
  pattern: /^@?flags\s+(.*)/i,
  lock: "connected",
  category: "Building",
  help: `@flags <target>=<flags>  — Set or remove flags on an object.

Use ! to remove a flag.

EXAMPLES
  @flags me=dark
  @flags #5=!builder`,
  exec: execSetFlags,
});

addCmd({
  name: "@set",
  pattern: /^@set\s+(.*)/i,
  lock: "connected",
  category: "Building",
  help: `@set <target>=<flag>  — Set or clear a flag on an object (alias for @flags).

Use ! to clear a flag.

EXAMPLES
  @set me=quiet
  @set me=!quiet`,
  exec: execSetFlags,
});

// ── @aconnect ─────────────────────────────────────────────────────────────────

async function execAttrSetter(
  u: IUrsamuSDK,
  attrKey: string,
  usage: string,
): Promise<void> {
  const raw    = u.util.stripSubs(u.cmd.args[0] ?? "").trim();
  const eqIdx  = raw.indexOf("=");
  if (eqIdx === -1) { u.send(`Usage: ${usage}`); return; }
  const targetStr = raw.slice(0, eqIdx).trim();
  const value     = (u.cmd.args[0] ?? "").slice(eqIdx + 1); // preserve unsanitized value
  const tar       = await u.util.target(u.me, targetStr);
  if (!tar) { u.send("I can't find that."); return; }
  if (!(await u.canEdit(u.me, tar))) { u.send("Permission denied."); return; }
  await u.db.modify(tar.id, "$set", { [`data.${attrKey}`]: value });
  u.send(`${attrKey.toUpperCase()} set on ${u.util.displayName(tar, u.me)}.`);
}

addCmd({
  name: "@aconnect",
  pattern: /^@?aconnect\s+(.*)/i,
  lock: "connected",
  category: "Building",
  help: `@aconnect <target>=<action>  — Set action executed when a player connects.

EXAMPLES
  @aconnect me=@pemit me=Welcome back!
  @aconnect me=`,
  exec: (u) => execAttrSetter(u, "aconnect", "@aconnect <target>=<action>"),
});

addCmd({
  name: "@adisconnect",
  pattern: /^@?adisconnect\s+(.*)/i,
  lock: "connected",
  category: "Building",
  help: `@adisconnect <target>=<action>  — Set action when a player disconnects.

EXAMPLES
  @adisconnect me=@pemit me=Goodbye!
  @adisconnect me=`,
  exec: (u) => execAttrSetter(u, "adisconnect", "@adisconnect <target>=<action>"),
});

addCmd({
  name: "@startup",
  pattern: /^@?startup\s+(.*)/i,
  lock: "connected",
  category: "Building",
  help: `@startup <target>=<action>  — Set action executed when the server starts.

EXAMPLES
  @startup #5=@pemit me=System ready.
  @startup #5=@trigger me/INIT`,
  exec: (u) => execAttrSetter(u, "startup", "@startup <target>=<action>"),
});

addCmd({
  name: "@daily",
  pattern: /^@?daily\s+(.*)/i,
  lock: "connected",
  category: "Building",
  help: `@daily <target>=<action>  — Set action executed once per day at midnight.

EXAMPLES
  @daily #5=@trigger me/RESET
  @daily #5=`,
  exec: (u) => execAttrSetter(u, "daily", "@daily <target>=<action>"),
});

// ── @log ──────────────────────────────────────────────────────────────────────

addCmd({
  name: "@log",
  pattern: /^@?log(?:\/\S+)?\s+(.*)/i,
  lock: "connected",
  category: "Information",
  help: `@log [<object>=]<message>  — Write a message to the server log.

EXAMPLES
  @log Something happened.
  @log reqlog=Player requested item.`,
  exec: (u: IUrsamuSDK) => {
    const raw   = (u.cmd.args[0] ?? "").trim();
    const eqIdx = raw.indexOf("=");
    const msg   = eqIdx >= 0 ? raw.slice(eqIdx + 1) : raw;
    log("info", `[MUSH LOG] ${msg}`);
  },
});
