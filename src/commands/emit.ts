import { addCmd, Obj, send } from "../services";
import { target } from "../utils";

export default () => {
  // Emit a message to the room
  addCmd({
    name: "@emit",
    pattern: /^@emit\s+(.*)/i,
    lock: "connected",
    category: "Communication",
    help: "Emit a message to the room",
    exec: async (ctx, args) => {
      const en = await Obj.get(ctx.socket.cid);
      if (!en) return;

      await send([`#${en.location}`], args[0]);
    },
  });

  // pemit a message to the room
  addCmd({
    name: "@pemit",
    pattern: /^@pemit\s+(.*)\s*=\s*(.*)/i,
    lock: "connected",
    category: "Communication",
    help: "Emit a message to a specific player",
    exec: async (ctx, [targ, val]) => {
      const en = await Obj.get(ctx.socket.cid);
      if (!en) return;

      const tar = await target(en, targ);
      if (!tar) {
        return await send([ctx.socket.id], "I can't find that here!");
      }

      await send([tar.id], val);
    },
  });

  // remit a message to the room
  addCmd({
    name: "@remit",
    pattern: /^@remit\s+(.*)\s*=\s*(.*)/i,
    lock: "connected",
    category: "Communication",
    help: "Emit a message to the room, but remove the sender's name",
    exec: async (ctx, [targ, val]) => {
      const en = await Obj.get(ctx.socket.cid);
      if (!en) return;

      const tar = await target(en, targ);
      if (!tar) {
        return await send([ctx.socket.id], "I can't find that here!");
      }

      if (tar.flags.includes("room")) {
        await send([`#${en.location}`], val);
      } else {
        await send([ctx.socket.cid], "You can only remit to rooms.");
      }
    },
  });
};
