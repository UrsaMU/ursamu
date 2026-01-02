import { send } from "../services/broadcast/index.ts";
import { addCmd, force } from "../services/commands/index.ts";
import { dbojs } from "../services/Database/index.ts";

export default () =>
  addCmd({
    name: "home",
    pattern: /^home$/i,
    lock: "connected",
    exec: async (ctx) => {
      const en = await dbojs.queryOne({ id: ctx.socket.cid || "" });
      if (!en) return;

      // deno-lint-ignore no-explicit-any
      const homeId = (en.data as any)?.home || 1;
      const home = await dbojs.queryOne({ id: homeId });

      if (!home) {
         return send([ctx.socket.id], "You have no home!", {});
      }

      if (en.location === home.id) {
          return send([ctx.socket.id], "You are already home.", {});
      }

      // Teleport them
      // We can use the force command to leverage the teleport command logic if we want,
      // or manually move them. Manual move is safer to avoid permission checks on 'teleport'.
      
      // Actually, 'home' is a command that usually works regardless of teleport locks, 
      // but might be restricted by 'enter' locks on the room? 
      // Standard MUSH: 'home' just sends you home.

      // Standard MUSH: 'home' just sends you home.

      en.location = home.id;
      await dbojs.modify({ id: en.id }, "$set", en);

      // Notifications
      send([ctx.socket.id], "There's no place like home...", {});
      send([ctx.socket.id], `You arrive at ${home.data?.name || "Home"}.`, {});
      
      // Force look
      force(ctx, "look");
    },
  });
