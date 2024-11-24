import { Obj, setAttr } from "../services";
import { send } from "../services/broadcast";
import { addCmd } from "../services/commands";
import { dbojs } from "../services/Database";
import { displayName } from "../utils/displayName";
import { target } from "../utils/target";

export default () =>
  addCmd({
    name: "@describe",
    pattern: /^[@\+]?desc(?:ribe)?(?:\s+(.*)\s*=\s*(.*))?/i,
    lock: "connected",
    help: "Set a description",
    exec: async (ctx, args) => {
      const en = await dbojs.findOne({ id: ctx.socket.cid });
      if (!en) return;
      const enObj = new Obj(en);
      const tar = await target(en, args[0]);
      
      if (!tar) {
        send([ctx.socket.id], "I can't find that here!", {});
        return;
      }
      const obj = new Obj(tar);
      console.log(args)
      if (args[1]) {
        await setAttr(obj, "description", args[1], enObj.dbref);

        send(
          [ctx.socket.id],
          `Description for %ch${displayName(en, tar)}%cn set!`,
          {},
        );
        return;
      }
    },
  });
