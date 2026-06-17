// Chronicles of Darkness plugin entry point.
// Phase 1 (commands.ts side-effect import — addCmd() fires at module load).
// Phase 2 (init: register help dir, REST routes).
// Phase 3 (remove: tear down anything init() did).

import "./commands.ts";

import type { IDBObj, IPlugin, MoveEvent, ObjectMovedEvent } from "@ursamu/ursamu";
import { registerPluginRoute, gameHooks, dbojs, send, sessions, registerFormatHandler, unregisterFormatHandler, registerHeader, unregisterHeader, registerDivider, unregisterDivider, registerFooter, unregisterFooter } from "@ursamu/ursamu";
import type { LayoutFn } from "@ursamu/ursamu";
import { itemData } from "./src/equipment/objects.ts";
import { cofdConformatHandler, cofdDescformatHandler } from "./src/support/index.ts";
import { header as cofdHeaderFn, divider as cofdDividerFn, footer as cofdFooterFn } from "./src/support/format.ts";
import { registerHelpDir } from "@ursamu/help-plugin";
import { registerJobBuckets } from "@ursamu/jobs-plugin";
import { routeHandler } from "./routes.ts";
import { getEncounterForRoom, setMoved } from "./src/combat/encounter.ts";
import { enforceMoveLock, type MoveLockActor } from "./src/combat/move_lock.ts";
import {
  aggroMobsInRoom,
  makeHookSdk,
  rearmAllWanderers,
  stopAllWanderers,
} from "./src/combat/zone.ts";
import {
  autoJoinTarget,
  ensureEncounter,
} from "./src/combat/auto.ts";

// Active-combat move-lock: anyone who has joined an active encounter cannot
// leave the room until the encounter ends or they leave it explicitly. Admins
// and wizards bypass. Implementation lives in src/combat/move_lock.ts as a
// pure handler; this listener just wires the live SDK as its dependencies.
async function onPlayerMove(e: MoveEvent): Promise<void> {
  const outcome = await enforceMoveLock(
    { actorId: e.actorId, fromRoomId: e.fromRoomId },
    {
      loadEncounter: (roomId) => getEncounterForRoom(roomId),
      loadActor: async (actorId): Promise<MoveLockActor | null> => {
        const a = await dbojs.queryOne({ id: actorId });
        if (!a) return null;
        const rawFlags = a.flags as unknown;
        const flags: Set<string> = rawFlags instanceof Set
          ? (rawFlags as Set<string>)
          : new Set(
              Array.isArray(rawFlags)
                ? (rawFlags as string[])
                : String(rawFlags ?? "").split(/[,\s]+/).filter(Boolean),
            );
        const sock = sessions.list().find((s) => (s as unknown as Record<string,unknown>).actorId === actorId);
        return { id: a.id, flags, socketId: sock?.socketId };
      },
      snapBack: async (actorId, roomId) => {
        await dbojs.modify({ id: actorId }, "$set", { location: roomId });
      },
      notify: (socketId, msg) => {
        send([socketId], msg, {});
      },
    },
  );

  // If the move was NOT blocked, mark the actor as having used their move
  // action this round in any encounter they participate in. Used by /charge
  // feasibility check in +attack. Errors are swallowed: movement tracking
  // must not throw into the engine.
  if (!outcome.blocked) {
    try {
      for (const roomId of [e.fromRoomId, e.toRoomId]) {
        if (!roomId) continue;
        const enc = await getEncounterForRoom(roomId);
        if (!enc) continue;
        if (enc.participants.some((p) => p.actorId === e.actorId)) {
          await setMoved(enc.id, e.actorId, true);
        }
      }
    } catch (_err) { /* swallow */ }

    // Aggro entry: if the destination room contains territorial/hunter mobs,
    // open an encounter and slot them in alongside the moving player. The
    // player keeps control -- the encounter just starts immediately so the
    // next +attack/+throw/+grapple resolves in initiative order.
    try {
      if (e.toRoomId) {
        const aggro = await aggroMobsInRoom(e.toRoomId);
        if (aggro.length > 0) {
          const actor = await dbojs.queryOne({ id: e.actorId });
          if (actor) {
            const u = await makeHookSdk(actor as unknown as IDBObj, e.toRoomId);
            const enc = await ensureEncounter(u, actor as unknown as IDBObj);
            if (enc) {
              for (const mob of aggro) await autoJoinTarget(u, enc, mob);
            }
          }
        }
      }
    } catch (_err) { /* swallow */ }
  }
}

// Ammo-stack merge on every object move. When a magazine ends up in a new
// container (get, drop, give, teleport, plugin-defined), collapse it into an
// existing same-key stack on that container. Errors are swallowed: ammo
// merging is a UX nicety and must not throw into the engine.
async function onObjectMoved(e: ObjectMovedEvent): Promise<void> {
  if (!e.to) return; // destroy or detach -- nothing to merge into
  try {
    // deno-lint-ignore no-explicit-any
    const moved = await dbojs.queryOne({ id: e.objectId }) as any;
    if (!moved) return;
    const d = itemData(moved);
    if (!d || d.kind !== "ammo") return;
    // deno-lint-ignore no-explicit-any
    const siblings = await dbojs.query({ location: e.to }) as any[];
    for (const sib of siblings) {
      if (sib.id === moved.id) continue;
      const sd = itemData(sib);
      if (sd?.kind !== "ammo" || sd.key !== d.key) continue;
      const merged = (sd.count ?? 1) + (d.count ?? 1);
      await dbojs.modify(
        { id: sib.id },
        "$set",
        // deno-lint-ignore no-explicit-any
        { "data.cofd_item": { ...sd, count: merged } } as any,
      );
      await dbojs.delete({ id: moved.id });
      return;
    }
  } catch (_err) { /* swallow */ }
}

// Re-arm any zone wander intervals persisted from the last server run.
async function onEngineReady(): Promise<void> {
  try {
    await rearmAllWanderers();
  } catch (_err) { /* swallow */ }
}

export const plugin: IPlugin = {
  name: "cofd",
  version: "1.0.0",
  description: "Chronicles of Darkness 2e plugin: sheets, chargen, d10 dice with 10/9/8-again, rote, and Willpower spend.",
  dependencies: [
    { name: "help", version: ">=1.0.0" },
    { name: "jobs", version: ">=1.0.0" },
  ],

  init: () => {
    registerHelpDir(new URL("./help", import.meta.url).pathname, "cofd");
    registerJobBuckets(["SHEET", "DOWNTIME"]);
    registerPluginRoute("/api/v1/cofd", routeHandler);
    gameHooks.on("player:move", onPlayerMove);
    gameHooks.on("object:moved", onObjectMoved);
    gameHooks.on("engine:ready", onEngineReady);
    registerHeader(cofdHeaderFn as LayoutFn);
    registerDivider(cofdDividerFn as LayoutFn);
    registerFooter(cofdFooterFn as LayoutFn);
    // deno-lint-ignore no-explicit-any
    (registerFormatHandler as any)("CONFORMAT", cofdConformatHandler, { prepend: true });
    // deno-lint-ignore no-explicit-any
    (registerFormatHandler as any)("DESCFORMAT", cofdDescformatHandler, { prepend: true });
    return true;
  },

  remove: () => {
    gameHooks.off("player:move", onPlayerMove);
    gameHooks.off("object:moved", onObjectMoved);
    gameHooks.off("engine:ready", onEngineReady);
    stopAllWanderers();
    unregisterHeader(cofdHeaderFn as LayoutFn);
    unregisterDivider(cofdDividerFn as LayoutFn);
    unregisterFooter(cofdFooterFn as LayoutFn);
    unregisterFormatHandler("CONFORMAT", cofdConformatHandler);
    unregisterFormatHandler("DESCFORMAT", cofdDescformatHandler);
  },
};

export default plugin;
