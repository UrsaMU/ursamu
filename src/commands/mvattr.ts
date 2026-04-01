import { addCmd } from "../services/commands/index.ts";
import { Obj } from "../services/DBObjs/index.ts";
import { canEdit, target } from "../utils/index.ts";
import { send } from "../services/broadcast/index.ts";
import { dbojs } from "../services/Database/index.ts";
import type { IAttribute } from "../@types/IAttribute.ts";
import type { IDBOBJ } from "../@types/IDBObj.ts";
import type { IUrsamuSDK } from "../@types/UrsamuSDK.ts";

export default () =>
  addCmd({
    name: "@mvattr",
    pattern: /^@mvattr\s+(.+?)=(.+)/i,
    lock: "connected",
    category: "Building",
    help: `@mvattr <object>=<old>,<new>[,<copy1>,<copy2>...]

Rename attribute <old> to <new> on <object>. Optionally copy to additional
names at the same time. You must control <object>.

If the source attribute is owned by another player, the rename creates a copy
instead of removing the original.

Examples:
  @mvattr me=DESC,DESCRIPTION         Rename DESC → DESCRIPTION on yourself.
  @mvattr box=TEMP,BACKUP,ARCHIVE     Rename TEMP → BACKUP, also copy to ARCHIVE.`,
    exec: async (u: IUrsamuSDK) => {
      const objRef  = (u.cmd.args[0] ?? "").trim();
      const nameStr = (u.cmd.args[1] ?? "").trim();
      if (!objRef || !nameStr) return u.send("Usage: @mvattr <object>=<old>,<new>[,<copy>...]");

      const names = nameStr.split(",").map(s => s.trim()).filter(Boolean);
      if (names.length < 2) return u.send("@mvattr requires at least <old>,<new>.");

      const [oldName, newName, ...extraCopies] = names;

      const en = await dbojs.queryOne({ id: u.me.id });
      if (!en) return;

      const result = await target(en as unknown as IDBOBJ, objRef);
      if (!result) return send([u.socketId ?? ""], `I can't find '${objRef}'.`);
      if (!await canEdit(en as unknown as IDBOBJ, result)) return u.send("Permission denied.");

      const obj = await Obj.get(result.id);
      if (!obj) return u.send("Object not found.");
      if (!obj.dbobj.data) obj.dbobj.data = { attributes: [] };

      const attrs: IAttribute[] = (obj.data?.attributes as IAttribute[] | undefined) ?? [];
      const srcIdx = attrs.findIndex(a => a.name.toLowerCase() === oldName.toLowerCase());
      if (srcIdx === -1) return u.send(`Attribute '${oldName}' not found on ${obj.name}.`);

      const srcAttr = attrs[srcIdx];
      const canModify = srcAttr.setter === u.me.id
        || u.me.flags.has("admin") || u.me.flags.has("wizard") || u.me.flags.has("superuser");

      // Create or update the new name
      const upsert = (name: string) => {
        const upper = name.toUpperCase();
        const i = attrs.findIndex(a => a.name.toLowerCase() === upper.toLowerCase());
        const entry: IAttribute = { name: upper, value: srcAttr.value, setter: u.me.id, type: srcAttr.type };
        if (i >= 0) attrs[i] = entry;
        else attrs.push(entry);
      };

      upsert(newName);
      for (const extra of extraCopies) upsert(extra);

      if (canModify) {
        // Remove the original
        attrs.splice(srcIdx, 1);
        u.send(`Renamed ${obj.name}/${oldName.toUpperCase()} → ${newName.toUpperCase()}${extraCopies.length ? ` (+${extraCopies.length} copies)` : ""}.`);
      } else {
        u.send(`Cannot modify '${oldName}' (owned by another). Copied to ${newName.toUpperCase()}${extraCopies.length ? ` and ${extraCopies.length} more` : ""} without removing original.`);
      }

      obj.dbobj.data!.attributes = attrs;
      await obj.save();
    },
  });
