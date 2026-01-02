import { addCmd } from "../services/commands/index.ts";
import { dbojs } from "../services/Database/index.ts";
import { send } from "../services/broadcast/index.ts";
import { getNextId } from "../utils/getNextId.ts";
import type { IDBOBJ } from "../@types/IDBObj.ts";
import { target } from "../utils/target.ts";
import { canEdit } from "../utils/canEdit.ts";

export default () =>
  addCmd({
    name: "clone",
    pattern: /^@clone\s+(.*)/i,
    lock: "connected",
    exec: async (ctx, args) => {
      const enactor = ctx.socket.cid ? await dbojs.queryOne({ id: ctx.socket.cid }) : undefined;
      if (!enactor) return;

      const fullArg = args[0];
      const [objName, newName] = fullArg.split("=");
      
      const obj = await target(enactor, objName.trim());
      
      if (!obj) {
        send([ctx.socket.id], "I can't see that here.");
        return;
      }

      // Permission check: You must be able to examine/control the object to clone it?
      // Standard MUSH: You must control the object to clone it.
      if (!await canEdit(enactor, obj)) {
         send([ctx.socket.id], "Permission denied.");
         return;
      }

      const id = await getNextId("objid");
      
      const cloneStub: IDBOBJ = {
        id,
        flags: obj.flags,
        location: enactor.id, // Clone appears in inventory
        data: {
            ...obj.data,
            name: newName ? newName.trim() : obj.data?.name || "Cloned Object",
            password: "", // Don't copy password
            // Copy attributes? Yes.
            attributes: obj.data?.attributes ? [...obj.data.attributes] : []
        }
      };
      
      // Update attribute setters to enactor?
      if (cloneStub.data?.attributes) {
          cloneStub.data.attributes = cloneStub.data.attributes.map(attr => ({
              ...attr,
              setter: enactor.id
          }));
      }

      await dbojs.create(cloneStub);
      
      send([ctx.socket.id], `Cloned: ${obj.data?.name}(#${obj.id}) -> ${cloneStub.data?.name}(#${cloneStub.id})`);
    },
  });
