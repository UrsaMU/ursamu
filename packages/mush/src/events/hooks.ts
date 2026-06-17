import { dbojs, Obj } from "../world/dbobjs.ts";
import { sandboxService } from "../softcode/sandbox.ts";
import { fireCaretPatterns } from "../world/caret-patterns.ts";
import { gameHooks, getConfig } from "@ursamu/core";
import { SDKService } from "../softcode/sdk-service.ts";
import type { IDBOBJ } from "../world/types.ts";
import type { ObjectDestroyedEvent, SayEvent, PoseEvent } from "./types.ts";
import type { IAttribute } from "../world/types.ts";

/**
 * Recursively fetch a named attribute from an object, walking its parent chain.
 * Returns `undefined` when not found; cycles are detected via a visited set.
 */
export const getAttribute = async (
  obj:     IDBOBJ,
  attr:    string,
  visited: Set<string> = new Set(),
): Promise<IAttribute | undefined> => {
  const attribute = obj.data?.attributes?.find(
    (a: IAttribute) => a.name.toLowerCase() === attr.toLowerCase(),
  );
  if (attribute) return attribute;

  if (obj.data?.parent) {
    const parentId = obj.data.parent as string;
    visited.add(obj.id);
    if (visited.has(parentId)) return undefined;
    const parent = await dbojs.queryOne({ id: parentId });
    if (parent) return getAttribute(parent as IDBOBJ, attr, visited);
  }
  return undefined;
};

// Helper to check if attribute is softcode (starts with $ or is otherwise a softcode attribute)
function isAttrSoftcode(attr: { value?: string } | null): boolean {
  if (!attr?.value) return false;
  return attr.value.startsWith("[") || attr.value.includes("[") || attr.value.includes("%");
}

// ── Tag cleanup on object destroy ─────────────────────────────────────────

const _onObjectDestroyed = async (e: ObjectDestroyedEvent) => {
  try {
    const { serverTags, playerTags } = await import("../world/dbobjs.ts");
    const globalTags = await serverTags.query({ objectId: e.objectId });
    for (const t of globalTags) await serverTags.delete({ id: t.id });

    const personalTags = await playerTags.query({ objectId: e.objectId });
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
  ): Promise<void> => {
    const attr = await getAttribute(obj, attrName);
    if (!attr) return;

    const actor = enactor || obj;

    if (isAttrSoftcode(attr)) {
      const { runSoftcodeSimple } = await import("../softcode/engine.ts");
      await runSoftcodeSimple(attr.value, {
        actorId:    actor.id,
        executorId: obj.id,
        args,
        socketId,
      });
      return;
    }

    // SDKService and Obj are already imported at the top level

    const meObj   = await Obj.get(actor.id);
    const hereObj = actor.location ? await Obj.get(actor.location) : null;

    await sandboxService.runScript(attr.value, {
      id:       actor.id,
      me:       meObj ? await SDKService.hydrate(meObj.dbobj) : { id: actor.id, flags: new Set(actor.flags.split(" ")), state: actor.data || {} },
      here:     hereObj ? await SDKService.hydrate(hereObj.dbobj, true) : undefined,
      location: actor.location || "limbo",
      state:    actor.data?.state as Record<string, unknown> || {},
      cmd:      { name: attrName.toLowerCase(), args },
      socketId,
    });
  },

  aconnect: async (player: IDBOBJ, socketId?: string): Promise<void> => {
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

  adisconnect: async (player: IDBOBJ, socketId?: string): Promise<void> => {
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
