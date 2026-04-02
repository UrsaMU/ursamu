import { dbojs } from "../Database/index.ts";
import { getAttribute } from "../../utils/getAttribute.ts";
import { sandboxService } from "../Sandbox/SandboxService.ts";
import { getConfig } from "../Config/mod.ts";
import type { IDBOBJ } from "../../@types/IDBObj.ts";
import { gameHooks } from "./GameHooks.ts";
import type { ObjectDestroyedEvent, SayEvent, PoseEvent } from "./GameHooks.ts";
import { isSoftcode } from "../../utils/isSoftcode.ts";
import { fireCaretPatterns } from "../../utils/caretPatterns.ts";

// ── Tag cleanup on object destroy ─────────────────────────────────────────

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

// ── ^-pattern listeners (MONITOR objects) ─────────────────────────────────

const _onSay = async (e: SayEvent) => {
  if (!e.roomId) return;
  // Heard text for say: the full formatted line as players see it
  const heard = `${e.actorName} says, "${e.message}"`;
  const masterRoomId = getConfig<string>("game.masterRoom") || undefined;
  // deno-lint-ignore no-explicit-any
  await fireCaretPatterns(e.roomId, heard, e.actorId, e.socketId || "", dbojs as any, masterRoomId).catch(
    err => console.error("[Hooks] ^-pattern error on player:say:", err)
  );
};

const _onPose = async (e: PoseEvent) => {
  if (!e.roomId) return;
  const masterRoomId = getConfig<string>("game.masterRoom") || undefined;
  // deno-lint-ignore no-explicit-any
  await fireCaretPatterns(e.roomId, e.content, e.actorId, e.socketId || "", dbojs as any, masterRoomId).catch(
    err => console.error("[Hooks] ^-pattern error on player:pose:", err)
  );
};

gameHooks.on("player:say",  _onSay);
gameHooks.on("player:pose", _onPose);

export const hooks = {
  /**
   * Execute a named attribute on an object, routing to softcode or sandbox
   * depending on attribute type.
   *
   * @param obj       The object whose attribute runs (executor, %!).
   * @param attrName  Attribute name (case-insensitive).
   * @param args      Positional args (%0–%9).
   * @param enactor   The triggering actor (%#, %N). Defaults to obj.
   * @param socketId  The enactor's socket id — needed for softcode output routing.
   */
  executeAttribute: async (
    obj:      IDBOBJ,
    attrName: string,
    args:     string[] = [],
    enactor?: IDBOBJ,
    socketId?: string,
  ) => {
    const attr = await getAttribute(obj, attrName);
    if (!attr) return;

    const actor = enactor || obj;

    if (isSoftcode(attr)) {
      const { softcodeService } = await import("../Softcode/index.ts");
      await softcodeService.runSoftcode(attr.value, {
        actorId:    actor.id,
        executorId: obj.id,
        args,
        socketId,
      });
      return;
    }

    const { SDKService } = await import("../Sandbox/SDKService.ts");
    const { Obj } = await import("../DBObjs/DBObjs.ts");

    const meObj   = await Obj.get(actor.id);
    const hereObj = actor.location ? await Obj.get(actor.location) : null;

    await sandboxService.runScript(attr.value, {
      id:       actor.id,
      me:       meObj ? await SDKService.hydrate(meObj) : { id: actor.id, flags: new Set(actor.flags.split(" ")), state: actor.data || {} },
      here:     hereObj ? await SDKService.hydrate(hereObj, true) : undefined,
      location: actor.location || "limbo",
      state:    actor.data?.state as Record<string, unknown> || {},
      cmd:      { name: attrName.toLowerCase(), args },
      socketId,
    });
  },

  aconnect: async (player: IDBOBJ, socketId?: string) => {
    try {
      await hooks.executeAttribute(player, "ACONNECT", [], player, socketId);

      const masterRoomId = getConfig<string>("game.masterRoom") || "0";
      if (masterRoomId) {
        const masterRoom = await dbojs.queryOne({ id: masterRoomId });
        if (masterRoom) {
          await hooks.executeAttribute(masterRoom as IDBOBJ, "ACONNECT", [], player, socketId);
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
    try {
      await hooks.executeAttribute(player, "ADISCONNECT", [], player, socketId);

      const masterRoomId = getConfig<string>("game.masterRoom") || "0";
      if (masterRoomId) {
        const masterRoom = await dbojs.queryOne({ id: masterRoomId });
        if (masterRoom) {
          await hooks.executeAttribute(masterRoom as IDBOBJ, "ADISCONNECT", [], player, socketId);
        }
      }
    } catch (e) {
      console.error("[Hooks] adisconnect error:", e);
    }
    gameHooks.emit("player:logout", {
      actorId:   player.id,
      actorName: (player.data?.name as string) || player.id,
      socketId,
    }).catch(e => console.error("[GameHooks] player:logout:", e));
  },
};
