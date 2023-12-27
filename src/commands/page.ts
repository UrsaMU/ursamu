import { dbojs } from "../services/Database/index.ts";
import { send } from "../services/broadcast/index.ts";
import { addCmd } from "../services/commands/index.ts";
import { moniker } from "../utils/moniker.ts";
import { target } from "../utils/target.ts";

export default () => {
  addCmd({
    name: "page",
    pattern: /^(?:p|page)\s+(?:(.*)\s*=\s*(.*)|(.*))/i,
    lock: "connected",
    exec: async (ctx, args) => {
      const [obj, msg, reply] = args;
      const en = await dbojs.queryOne({ id: ctx.socket.cid });
      if (!en) return;

      const tars = obj?.split(" ") || en.data?.lastpage || [];
      const targets = [];
      for (const tar of tars) {
        const t = await target(en, tar, true);
        if (t) targets.push(t);
      }

      // we need to build two lists, a list of target._ids and a list of targets
      // with their Name(alias) notation. We'll use the latter to display the list in
      // the page message.

      const targetIds = targets
        .filter((t) => (t.id && t.flags.includes("connected") ? true : false))
        .filter(Boolean)
        .map((t) => t.id);
      const targetNames = targets.map(
        (t) => `${moniker(t)}${t.data?.alias ? "(" + t.data.alias + ")" : ""}`,
      );

      // now we can send the page message to the targets
      let msgOrReply = msg ? msg?.trim() : reply?.trim();
      let tempmsg = "";
      let sendermsg = "";
      let senderHeader = `To (${targetNames.join(", ")}),`;
      let header = targetIds.length > 1
        ? `To (${targetNames.join(", ")}),`
        : "From afar,";
      switch (true) {
        case msgOrReply?.trim().startsWith(";"):
          tempmsg = `${header} ${moniker(en)}${
            en.data?.alias ? "(" + en.data?.alias + ")" : ""
          }${msgOrReply.slice(1)}`;
          sendermsg = `${senderHeader} ${moniker(en)}${
            en.data?.alias ? "(" + en.data?.alias + ")" : ""
          }${msgOrReply.slice(1)}`;

          break;
        case msgOrReply?.trim().startsWith(":"):
          tempmsg = `${header} ${moniker(en)}${
            en.data?.alias ? "(" + en.data?.alias + ")" : ""
          } ${msgOrReply.slice(1)}`;

          sendermsg = `${senderHeader} ${moniker(en)}${
            en.data?.alias ? "(" + en.data?.alias + ")" : ""
          } ${msgOrReply.slice(1)}`;
          break;
        default:
          tempmsg = `${header} ${moniker(en)}${
            en.data?.alias ? "(" + en.data?.alias + ")" : ""
          } pages: ${msgOrReply}`;

          sendermsg = `${senderHeader} ${moniker(en)}${
            en.data?.alias ? "(" + en.data?.alias + ")" : ""
          } pages: ${msgOrReply}`;
      }

      if (en.data?.lastpage && reply) {
        if (!targets.filter((ob) => ob.id === en.id).length) {
          send([ctx.socket.id], sendermsg, {});
        }
        return send(
          targetIds.map((t) => `#${t}`),
          tempmsg,
          {},
        );
      }

      if (!targetIds.length && !en.data?.lasstpage) {
        return send([ctx.socket.id], "No one to page.", {});
      }

      // now we can send the page message to the targets
      const targts = Array.from(new Set(targetIds));
      send(
        targts.map((t) => `#${t}`),
        tempmsg,
        {},
      );
      if (!targets.filter((ob) => ob._id === en._id).length) {
        send([ctx.socket.id], sendermsg, {});
      }
      en.data ||= {};
      en.data.lastpage = targts;
      await dbojs.modify({ _id: en._id }, "$set", en);
    },
  });
};
