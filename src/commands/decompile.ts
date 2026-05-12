import { addCmd } from "../services/commands/index.ts";
import { dbojs } from "../services/Database/index.ts";
import { canEdit } from "../utils/index.ts";
import { send } from "../services/broadcast/index.ts";
import { target } from "../utils/target.ts";
import type { IDBOBJ } from "../@types/IDBObj.ts";
import type { IAttribute } from "../@types/IAttribute.ts";
import type { IUrsamuSDK } from "../@types/UrsamuSDK.ts";

// System-level data keys that should not be decompiled as attributes.
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

      const en = await dbojs.queryOne({ id: u.me.id });
      if (!en) return;

      const targ = await target(en as unknown as IDBOBJ, arg);
      if (!targ) { send([u.socketId ?? ""], "I don't see that here."); return; }
      if (!await canEdit(en as unknown as IDBOBJ, targ as unknown as IDBOBJ)) {
        u.send("Permission denied.");
        return;
      }

      const name = (targ as unknown as IDBOBJ).data?.name ?? `Object-${targ.id}`;
      const data = ((targ as unknown as IDBOBJ).data ?? {}) as Record<string, unknown>;

      const lines: string[] = [];

      if (sw) {
        // TinyMUX installer format
        lines.push(`@create ${name}=1`);
        lines.push(`@set ${name}=<flags>`);
      } else {
        lines.push(`; Decompile of ${name} (#${targ.id})`);
        lines.push(`@create ${name}=1`);
      }

      // Emit IAttribute-style attribute array if present
      const attrArray = data.attributes as IAttribute[] | undefined;
      if (Array.isArray(attrArray)) {
        for (const attr of attrArray) {
          if (!attr.name || !attr.value) continue;
          if (sw) {
            lines.push(`&${attr.name.toUpperCase()} ${name}=${attr.value}`);
          } else {
            lines.push(`@set ${name}/${attr.name.toUpperCase()}=${attr.value}`);
          }
        }
      }

      // Also emit plain string keys stored directly in data (legacy / simple attrs)
      for (const [key, val] of Object.entries(data)) {
        if (SKIP_KEYS.has(key)) continue;
        if (key === "attributes") continue; // handled above
        if (typeof val !== "string") continue;
        if (!val) continue;
        const attrName = key.toUpperCase();
        if (sw) {
          lines.push(`&${attrName} ${name}=${val}`);
        } else {
          lines.push(`@set ${name}/${attrName}=${val}`);
        }
      }

      send([u.socketId ?? ""], lines.join("\r\n"));
    },
  });
