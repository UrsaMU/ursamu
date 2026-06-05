import { addCmd } from "../commands/addCmd.ts";
import type { IUrsamuSDK } from "../commands/types.ts";
import { dbojs } from "../world/dbobjs.ts";
import type { IDBOBJ, IAttribute } from "../world/types.ts";

// ── @decompile ────────────────────────────────────────────────────────────

const SKIP_KEYS = new Set([
  "name", "password", "owner", "lock", "locks", "home",
  "parent", "zone", "moniker", "lastLogout", "termWidth",
  "quota", "money", "channels",
]);

addCmd({
  name: "@decompile",
  pattern: /^@decompile(?:\/(tf))?\s+(.*)/i,
  lock: "connected",
  category: "Building",
  help: `@decompile[/tf] <object>  — Dump an object as recreatable @set commands.

Switches:
  /tf   Output in TinyMUX installer format (& attribute lines).

Examples:
  @decompile here                 Decompile the current room.
  @decompile/tf mybox             Decompile 'mybox' in TF installer format.`,
  exec: async (u: IUrsamuSDK) => {
    const sw  = (u.cmd.args[0] ?? "").toLowerCase() === "tf";
    const arg = (u.cmd.args[1] ?? "").trim();
    if (!arg) { u.send("Usage: @decompile[/tf] <object>"); return; }

    const targ = await u.util.target(u.me, arg, true);
    if (!targ) { u.send("I don't see that here."); return; }
    if (!await u.canEdit(u.me, targ)) { u.send("Permission denied."); return; }

    const rawObj = await dbojs.queryOne({ id: targ.id });
    if (!rawObj) { u.send("Object not found."); return; }

    const name = (rawObj as unknown as IDBOBJ).data?.name ?? `Object-${targ.id}`;
    const data = ((rawObj as unknown as IDBOBJ).data ?? {}) as Record<string, unknown>;
    const lines: string[] = [];

    if (sw) {
      lines.push(`@create ${name}=1`);
      lines.push(`@set ${name}=<flags>`);
    } else {
      lines.push(`; Decompile of ${name} (#${targ.id})`);
      lines.push(`@create ${name}=1`);
    }

    const attrArray = data.attributes as IAttribute[] | undefined;
    if (Array.isArray(attrArray)) {
      for (const attr of attrArray) {
        if (!attr.name || !attr.value) continue;
        if (sw) lines.push(`&${attr.name.toUpperCase()} ${name}=${attr.value}`);
        else lines.push(`@set ${name}/${attr.name.toUpperCase()}=${attr.value}`);
      }
    }

    for (const [key, val] of Object.entries(data)) {
      if (SKIP_KEYS.has(key) || key === "attributes") continue;
      if (typeof val !== "string" || !val) continue;
      const attrName = key.toUpperCase();
      if (sw) lines.push(`&${attrName} ${name}=${val}`);
      else lines.push(`@set ${name}/${attrName}=${val}`);
    }

    u.send(lines.join("\r\n"));
  },
});

// ── @edit ─────────────────────────────────────────────────────────────────

addCmd({
  name: "@edit",
  pattern: /^@edit\s+(.*)\/(.*)\s*=\s*(.*)\/(.*)/i,
  lock: "connected",
  category: "Building",
  help: `@edit <object>/<attr>=<find>/<replace>  — Find and replace text in an attribute.

Examples:
  @edit me/DESC=tall/short         Replace "tall" with "short" in DESC.
  @edit box/LOCK=player/admin      Replace "player" with "admin" in LOCK.`,
  exec: async (u: IUrsamuSDK) => {
    const [objName, attrName, findStr, replaceStr] = u.cmd.args;
    if (!objName || !attrName || findStr === undefined || replaceStr === undefined) {
      u.send("Usage: @edit <object>/<attr>=<find>/<replace>");
      return;
    }

    const tar = await u.util.target(u.me, objName, true);
    if (!tar) { u.send("I can't find that here!"); return; }
    if (!await u.canEdit(u.me, tar)) { u.send("Permission denied."); return; }

    const attrUpper = attrName.toUpperCase();
    const rawObj = await dbojs.queryOne({ id: tar.id });
    if (!rawObj) { u.send("Object not found."); return; }

    const objData = rawObj as unknown as IDBOBJ;
    const attrs = (objData.data?.attributes as Array<{ name: string; value: string }> | undefined) ?? [];
    const idx = attrs.findIndex((a) => a.name.toUpperCase() === attrUpper);
    if (idx === -1) { u.send(`Attribute ${attrName} not found on ${objName}.`); return; }

    const val = attrs[idx].value;
    if (!val.includes(findStr)) { u.send(`String '${findStr}' not found in ${attrName}.`); return; }

    attrs[idx].value = val.replaceAll(findStr, replaceStr);
    if (!objData.data) objData.data = {};
    objData.data.attributes = attrs as IAttribute[];
    await dbojs.modify({ id: tar.id }, "$set", rawObj);
    u.send(`Set - ${attrUpper}: ${attrs[idx].value}`);
  },
});
