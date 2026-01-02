import { dbojs } from "../Database/index.ts";
import { getAttribute } from "../../utils/getAttribute.ts";
import { parser } from "../Softcode/parser.ts";
import { force } from "../commands/index.ts";
import { getConfig } from "../Config/mod.ts";
import type { IDBOBJ } from "../../@types/IDBObj.ts";

export const hooks = {
  executeAttribute: async (obj: IDBOBJ, attrName: string, args: string[] = [], enactor?: IDBOBJ) => {
    const attr = await getAttribute(obj, attrName);
    if (!attr) return;

    // Evaluate
    const result = await parser(attr.value, { 
        data: { enactor: enactor || obj }, 
        registers: {}, 
        args 
    });
    
    // Execute
    if (result.trim()) {
        // We need a context. Mocking one for now since hooks often run background.
        // If enactor has a socket (is connected), use it?
        // But force needs socket... 
        
        // TODO: Update force to handle background tasks better.
        // For now, construct a dummy socket with just CID.
        // deno-lint-ignore no-explicit-any
        const ctx: any = {
            socket: { cid: enactor?.id || obj.id, id: "hook" },
            msg: result,
            data: {}
        };
        
        try {
            await force(ctx, result);
        } catch(e) {
            console.error(`Hook execution failed for ${attrName} on #${obj.id}:`, e);
        }
    }
  },

  aconnect: async (player: IDBOBJ) => {
    // 1. Player @aconnect
    await hooks.executeAttribute(player, "ACONNECT", [], player);

    // 2. Master Room @aconnect (and contents?)
    // Master room is usually start room or config 'master_room' (not in default config yet).
    // Assuming #0 or config.
    const masterRoomId = getConfig<string>("game.masterRoom") || "0";
    if (masterRoomId) {
        const masterRoom = await dbojs.queryOne({id: masterRoomId});
        if (masterRoom) {
            await hooks.executeAttribute(masterRoom, "ACONNECT", [], player);
        }
    }
    
    // 3. Location / Zone (simplified)
    if (player.location) {
        const loc = await dbojs.queryOne({id: player.location});
        if (loc) {
            // Zone logic later
            // Room @aconnect?
            // MUX: Room @aconnect (on room contents?) 
            // "If the location ... belongs to a zone... if room... execute @aconnect found on any of that room's contents"
            // That's heavy.
            // But typical: Room itself might have ACONNECT? MUX Help says "Zone object... if room...".
            // Let's stick to Player + Master Room for Phase 1.
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
