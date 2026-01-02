import { Obj } from "../services/DBObjs/index.ts";
import { send } from "../services/broadcast/index.ts";
import { addCmd } from "../services/commands/index.ts";
import { canEdit } from "../utils/canEdit.ts";
import { target } from "../utils/target.ts";
import { displayName } from "../utils/displayName.ts";

export default () => {
  const messages = [
    { name: "@succ", attr: "success", help: "Set the success message for an object" },
    { name: "@osucc", attr: "osuccess", help: "Set the outer success message for an object" },
    { name: "@fail", attr: "fail", help: "Set the failure message for an object" },
    { name: "@ofail", attr: "ofail", help: "Set the outer failure message for an object" },
    { name: "@drop", attr: "drop", help: "Set the drop message for an object" },
    { name: "@odrop", attr: "odrop", help: "Set the outer drop message for an object" },
  ];

  messages.forEach((msg) => {
    addCmd({
      name: msg.name,
      pattern: new RegExp(`^${msg.name}\\s+(.*)\\s*=\\s*(.*)?$`, "i"),
      lock: "connected builder+",
      help: msg.help,
      category: "building",
      exec: async (ctx, args) => {
        const [obj, message] = args;
        if (!ctx.socket.cid) return;
        const en = await Obj.get(ctx.socket.cid);
        if (!en) return;

        const tar = await target(en.dbobj, obj, true);
        if (!tar) return send([ctx.socket.id], "I don't see that here.");

        const tarObj = await Obj.get(tar.id);
        if(!tarObj?.dbobj) return send([ctx.socket.id], "I don't see that here.");

        if (await canEdit(en.dbobj, tarObj.dbobj)) {
          tarObj.dbobj.data ||= {};
          
          if (!message) {
            delete tarObj.dbobj.data[msg.attr];
            await tarObj.save();
             return send([ctx.socket.id], `${msg.name} cleared on ${displayName(en.dbobj, tarObj.dbobj, true)}.`);
          }

          tarObj.dbobj.data[msg.attr] = message;
          await tarObj.save();
          send([ctx.socket.id], `${msg.name} set on ${displayName(en.dbobj, tarObj.dbobj, true)}.`);
        } else {
             send([ctx.socket.id], "Permission denied.");
        }
      },
    });
  });
};
