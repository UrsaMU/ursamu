import { send } from "../services/broadcast/index.ts";
import { addCmd } from "../services/commands/index.ts";
import { dbojs, scenes } from "../services/Database/index.ts";
import type { IPose } from "../@types/IScene.ts";

export default () =>
  addCmd({
    name: "pose",
    pattern: /^(pose\s+|:|;)(.*)/i,
    lock: "connected",
    exec: async (ctx, args) => {
      const player = await dbojs.queryOne({ id: ctx.socket.cid || "" });
      if (!player) return;
      const name = player.data?.moniker || player.data?.name;
      const msg =
        args[0] === ";" ? `${name}${args[1]}%cn` : `${name} ${args[1]}%cn`;

      // Broadcast to room
      send([`#${player.location}`], msg, {});

      // Add to active scene if one exists in this room
      if (player.location) {
        // Try to find a scene that matches the location (either ID or #ID)
        const activeScene = await scenes.queryOne({
          $and: [
            {
               status: "active" 
            },
            {
              $or: [
                { location: player.location },
                { location: `#${player.location}` }
              ]
            }
          ]
        });

        if (activeScene) {
          const cleanMsg = args[0] === ";" ? `${name}${args[1]}` : `${name} ${args[1]}`;
          const dbref = `#${player.id}`;
          
          const newPose: IPose = {
            id: crypto.randomUUID(),
            charId: dbref,
            charName: name || "Unknown",
            msg: cleanMsg.replace(/%[a-z0-9]+/gi, ""), // Strip ANSI codes for web
            type: "pose",
            timestamp: Date.now()
          };

          activeScene.poses.push(newPose);
          
          // Add participant if needed
          if (!activeScene.participants.includes(dbref)) {
            activeScene.participants.push(dbref);
            await scenes.modify({ id: activeScene.id }, "$set", { 
              poses: activeScene.poses,
              participants: activeScene.participants
            });
          } else {
             await scenes.modify({ id: activeScene.id }, "$set", { poses: activeScene.poses });
          }
        }
      }
    },
  });
