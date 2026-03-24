import { dbojs } from "../Database/index.ts";
import { getAttribute } from "../../utils/getAttribute.ts";
import { sandboxService } from "../Sandbox/SandboxService.ts";
import { getConfig } from "../Config/mod.ts";
import type { IDBOBJ } from "../../@types/IDBObj.ts";
import { gameHooks } from "./GameHooks.ts";

export const hooks = {
  executeAttribute: async (obj: IDBOBJ, attrName: string, args: string[] = [], enactor?: IDBOBJ) => {
    const attr = await getAttribute(obj, attrName);
    if (!attr) return;

    const actor = enactor || obj;
    const { SDKService } = await import("../Sandbox/SDKService.ts");
    const { Obj } = await import("../DBObjs/DBObjs.ts");

    const meObj = await Obj.get(actor.id);
    const hereObj = actor.location ? await Obj.get(actor.location) : null;

    await sandboxService.runScript(attr.value, {
      id: actor.id,
      me: meObj ? await SDKService.hydrate(meObj) : { id: actor.id, flags: new Set(actor.flags.split(" ")), state: actor.data || {} },
      here: hereObj ? await SDKService.hydrate(hereObj, true) : undefined,
      location: actor.location || "limbo",
      state: actor.data?.state as Record<string, unknown> || {},
      cmd: { name: attrName.toLowerCase(), args },
    });
  },

  aconnect: async (player: IDBOBJ, socketId?: string) => {
    try {
      // 1. Player @aconnect
      await hooks.executeAttribute(player, "ACONNECT", [], player);

      // 2. Master Room @aconnect
      const masterRoomId = getConfig<string>("game.masterRoom") || "0";
      if (masterRoomId) {
          const masterRoom = await dbojs.queryOne({id: masterRoomId});
          if (masterRoom) {
              await hooks.executeAttribute(masterRoom, "ACONNECT", [], player);
          }
      }
    } catch (e) {
      console.error("[Hooks] aconnect error:", e);
    }
    gameHooks.emit("player:login", {
      actorId:   player.id,
      actorName: (player.data?.name as string) || player.id,
      socketId,
    }).catch(e => console.error("[GameHooks] player:login:", e));
  },

  adisconnect: async (player: IDBOBJ, socketId?: string) => {
    await hooks.executeAttribute(player, "ADISCONNECT", [], player);

    const masterRoomId = getConfig<string>("game.masterRoom") || "0";
    if (masterRoomId) {
        const masterRoom = await dbojs.queryOne({id: masterRoomId});
        if (masterRoom) {
            await hooks.executeAttribute(masterRoom, "ADISCONNECT", [], player);
        }
    }
    gameHooks.emit("player:logout", {
      actorId:   player.id,
      actorName: (player.data?.name as string) || player.id,
      socketId,
    }).catch(e => console.error("[GameHooks] player:logout:", e));
  }
};
