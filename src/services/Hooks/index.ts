import { dbojs } from "../Database/index.ts";
import { getAttribute } from "../../utils/getAttribute.ts";
import { sandboxService } from "../Sandbox/SandboxService.ts";
import { getConfig } from "../Config/mod.ts";
import type { IDBOBJ } from "../../@types/IDBObj.ts";

export const hooks = {
  executeAttribute: async (obj: IDBOBJ, attrName: string, _args: string[] = [], _enactor?: IDBOBJ) => {
    const attr = await getAttribute(obj, attrName);
    if (!attr) return;

    // Evaluate via Script Engine
    await sandboxService.runScript(attr.value, { 
        id: obj.id,
        location: obj.location || "limbo",
        state: obj.data?.state as Record<string, unknown> || {},
    });
  },

  aconnect: async (player: IDBOBJ) => {
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
  },

  adisconnect: async (player: IDBOBJ) => {
    await hooks.executeAttribute(player, "ADISCONNECT", [], player);
    
    const masterRoomId = getConfig<string>("game.masterRoom") || "0";
    if (masterRoomId) {
        const masterRoom = await dbojs.queryOne({id: masterRoomId});
        if (masterRoom) {
            await hooks.executeAttribute(masterRoom, "ADISCONNECT", [], player);
        }
    }
  }
};
