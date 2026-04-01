import { dbojs } from "../Database/index.ts";
import { getAttribute } from "../../utils/getAttribute.ts";
import { sandboxService } from "../Sandbox/SandboxService.ts";
import { getConfig } from "../Config/mod.ts";
import type { IDBOBJ } from "../../@types/IDBObj.ts";
import { gameHooks } from "./GameHooks.ts";
import type { IAttribute } from "../../@types/IAttribute.ts";
import type { ObjectDestroyedEvent } from "./GameHooks.ts";

// ── Tag cleanup on object destroy ─────────────────────────────────────────
// When an object is destroyed, remove all global and personal tags pointing
// to it so #tagname references don't silently resolve to deleted objects.

const _onObjectDestroyed = async (e: ObjectDestroyedEvent) => {
  try {
    const { serverTags, playerTags } = await import("../Database/index.ts");
    const globalTags = await serverTags.find({ objectId: e.objectId });
    for (const t of globalTags) await serverTags.delete({ id: t.id });

    const personalTags = await playerTags.find({ objectId: e.objectId });
    for (const t of personalTags) await playerTags.delete({ id: t.id });
  } catch (err) {
    console.error("[Hooks] tag cleanup on object:destroyed failed:", err);
  }
};

gameHooks.on("object:destroyed", _onObjectDestroyed);

/**
 * Returns true if the attribute should be evaluated as MUX softcode rather
 * than TypeScript/JS via the sandbox.
 *
 * An attribute is softcode when:
 *   1. Its `type` field is explicitly `"softcode"`, OR
 *   2. Autodetect: the value contains MUX substitution/function syntax
 *      (%X, [func(...)]) but does NOT contain TypeScript-style tokens
 *      (import, export, const, let, var, function, =>, async).
 */
function isSoftcode(attr: IAttribute): boolean {
  if (attr.type === "softcode") return true;
  if (attr.type && attr.type !== "attribute") return false; // explicit non-softcode type

  const v = attr.value;
  const hasMux = /\[.*\(|%[0-9a-zA-Z#!@+]/u.test(v);
  if (!hasMux) return false;

  const hasJS = /\b(import|export|const|let|var|function|=>|async\s+function)\b/.test(v);
  return !hasJS;
}

export const hooks = {
  executeAttribute: async (obj: IDBOBJ, attrName: string, args: string[] = [], enactor?: IDBOBJ) => {
    const attr = await getAttribute(obj, attrName);
    if (!attr) return;

    const actor = enactor || obj;

    // ── Route to SoftcodeService for MUX softcode attributes ─────────────
    if (isSoftcode(attr)) {
      const { softcodeService } = await import("../Softcode/index.ts");
      await softcodeService.runSoftcode(attr.value, {
        actorId:    actor.id,
        executorId: obj.id,
        args,
      });
      return;
    }

    // ── Route to SandboxService for TypeScript/JS attributes ──────────────
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
