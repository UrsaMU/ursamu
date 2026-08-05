import { addCmd } from "../commands/addCmd.ts";
import type { IUrsamuSDK } from "../commands/types.ts";
import { log } from "@ursamu/core";
import { flags, unknownFlagNames } from "../world/flags.ts";

// ── @flags / @set ─────────────────────────────────────────────────────────────

async function execSetFlags(u: IUrsamuSDK): Promise<void> {
  const raw    = u.util.stripSubs(u.cmd.args[0] ?? "").trim();
  const eqIdx  = raw.indexOf("=");
  if (eqIdx === -1) {
    u.send("Usage: @flags <target>=<flags>");
    return;
  }
  const targetStr = raw.slice(0, eqIdx).trim();
  const flagStr = raw.slice(eqIdx + 1).trim();
  if (!targetStr || !flagStr) {
    u.send("Usage: @flags <target>=<flags>");
    return;
  }
  // Digibear Tags.set silently drops unknown names — refuse early.
  const unknown = unknownFlagNames(flagStr);
  if (unknown.length) {
    u.send(
      `Unknown flag${unknown.length > 1 ? "s" : ""}: ` +
        unknown.join(", ") +
        ". Use @flags me to list current flags; " +
        "registered names only (e.g. fae, dark, builder).",
    );
    return;
  }
  // Global + *Name: staff can @set offline players elsewhere.
  const tar = await u.util.target(u.me, targetStr, true);
  if (!tar) { u.send("I can't find that here."); return; }
  if (!(await u.canEdit(u.me, tar))) { u.send("Permission denied."); return; }
  await u.setFlags(tar.id, flagStr);
  // Keep in-session me.flags in sync when editing self.
  if (tar.id === u.me.id) {
    for (const tok of flagStr.trim().split(/\s+/).filter(Boolean)) {
      if (tok.startsWith("!")) {
        const n = tok.slice(1);
        const reg = flags.exists(n);
        u.me.flags.delete(reg?.name ?? n);
        u.me.flags.delete(n.toLowerCase());
      } else {
        const reg = flags.exists(tok);
        if (reg?.name) u.me.flags.add(reg.name);
      }
    }
  }
  u.send(`Flags set on ${u.util.displayName(tar, u.me)}.`);
}

addCmd({
  name: "@flags",
  pattern: /^@?flags\s+(.*)/i,
  lock: "connected",
  category: "Building",
  help: `@flags <target>=<flags>  — Set or remove flags on an object.

Use ! to remove a flag. Targets resolve globally (*Name ok).

EXAMPLES
  @flags me=dark
  @flags Builder=superuser
  @flags #5=!builder`,
  exec: execSetFlags,
});

addCmd({
  name: "@set",
  pattern: /^@set\s+(.*)/i,
  lock: "connected",
  category: "Building",
  help: `@set <target>=<flag>  — Set or clear a flag (alias for @flags).

Use ! to clear a flag. Targets resolve globally (*Name ok).

EXAMPLES
  @set me=quiet
  @set Builder=superuser
  @set *Alice=builder
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
