import { addCmd } from "../services/commands/index.ts";
import { dbojs } from "../services/Database/index.ts";
import { send } from "../services/broadcast/index.ts";
import { canEdit, globToRegex, target } from "../utils/index.ts";
import { Obj } from "../services/DBObjs/index.ts";
import type { IAttribute } from "../@types/IAttribute.ts";
import type { IDBOBJ } from "../@types/IDBObj.ts";
import type { IUrsamuSDK } from "../@types/UrsamuSDK.ts";

// Attributes that should never be copied between objects.
const SYSTEM_ATTRS = new Set([
  "name", "password", "owner", "lock", "locks", "home",
  "parent", "zone", "moniker", "lastLogout", "termWidth",
  "quota", "money", "channels",
]);

export default () =>
  addCmd({
    name: "@include",
    pattern: /^@include\s+([^=]+)=([^/\r\n]+)(?:\/(.+))?/i,
    lock: "connected builder+",
    category: "Building",
    help: `@include <dest>=<source>[/<glob>]  — Copy attributes from source to destination.

  <dest>    Object to copy attributes into.
  <source>  Object to copy attributes from.
  <glob>    Optional glob pattern to filter which attrs to copy (default: *).

Examples:
  @include myobj=template          Copy all attrs from 'template' to 'myobj'.
  @include myobj=template/DESC*    Copy only DESC* attrs from 'template'.`,
    exec: async (u: IUrsamuSDK) => {
      const destArg = (u.cmd.args[0] ?? "").trim();
      const srcArg  = (u.cmd.args[1] ?? "").trim();
      const globPat = ((u.cmd.args[2] ?? "").trim()) || "*";

      if (!destArg || !srcArg) {
        u.send("Usage: @include <dest>=<source>[/<glob>]");
        return;
      }

      const en = await dbojs.queryOne({ id: u.me.id });
      if (!en) return;

      const srcResult  = await target(en as unknown as IDBOBJ, srcArg);
      const destResult = await target(en as unknown as IDBOBJ, destArg);

      if (!srcResult)  { send([u.socketId ?? ""], `Source '${srcArg}' not found.`);      return; }
      if (!destResult) { send([u.socketId ?? ""], `Destination '${destArg}' not found.`); return; }

      if (!await canEdit(en as unknown as IDBOBJ, srcResult  as unknown as IDBOBJ))
        { send([u.socketId ?? ""], "Permission denied on source.");      return; }
      if (!await canEdit(en as unknown as IDBOBJ, destResult as unknown as IDBOBJ))
        { send([u.socketId ?? ""], "Permission denied on destination."); return; }

      const srcObj  = await Obj.get(srcResult.id);
      const destObj = await Obj.get(destResult.id);

      if (!srcObj)  { u.send("Source object not found.");      return; }
      if (!destObj) { u.send("Destination object not found."); return; }

      const re = globToRegex(globPat);

      const srcAttrs:  IAttribute[] = (srcObj.data?.attributes  as IAttribute[] | undefined) ?? [];
      if (!destObj.dbobj.data) destObj.dbobj.data = { attributes: [] };
      const destAttrs: IAttribute[] = (destObj.data?.attributes as IAttribute[] | undefined) ?? [];

      let count = 0;
      for (const attr of srcAttrs) {
        if (SYSTEM_ATTRS.has(attr.name.toLowerCase())) continue;
        if (!re.test(attr.name.toUpperCase())) continue;

        const existingIdx = destAttrs.findIndex(
          a => a.name.toLowerCase() === attr.name.toLowerCase(),
        );
        const newAttr: IAttribute = {
          name:   attr.name.toUpperCase(),
          value:  attr.value,
          setter: u.me.id,
          type:   attr.type,
        };

        if (existingIdx >= 0) destAttrs[existingIdx] = newAttr;
        else destAttrs.push(newAttr);
        count++;
      }

      destObj.dbobj.data.attributes = destAttrs;
      await destObj.save();

      send(
        [u.socketId ?? ""],
        `${count} attribute${count === 1 ? "" : "s"} copied from ${srcObj.name} to ${destObj.name}.`,
      );
    },
  });
