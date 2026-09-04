/**
 * @module handlers/output
 *
 * Handles worker messages that route output to players:
 *   send, broadcast, room:broadcast, teleport, patch
 */
import {
  send as coreSend,
  broadcastAll,
  notify as coreNotify,
} from "@ursamu/core";
import { gameHooks } from "@ursamu/core";
import type { SDKContext } from "../sdk-service.ts";

type Msg = Record<string, unknown>;

/** Route a "send" message to the appropriate socket(s). */
export function handleSend(msg: Msg, context: SDKContext | undefined): void {
  const message   = msg.message as string | undefined;
  const msgTarget = msg.target  as string | undefined;
  if (!message) return;

  const targets = msgTarget
    ? [msgTarget]
    : context?.socketId ? [context.socketId as string] : [];
  coreSend(targets, message);
}

/** Route a "notify" request to a single actor by id; reply with delivery boolean. */
export function handleNotify(msg: Msg, worker: globalThis.Worker): void {
  const actorId = msg.actorId as string | undefined;
  const message = msg.message as string | undefined;
  const msgId   = msg.msgId;
  const ok = actorId && message ? coreNotify(actorId, message) : false;
  worker.postMessage({ type: "response", msgId, data: ok });
}

/** Route a "broadcast" message to all connected sockets. */
export async function handleBroadcast(msg: Msg): Promise<void> {
  const message = msg.message as string | undefined;
  if (!message) return;
  const { handleCemitSentinel, isCemitSentinel } = await import(
    "../cemit.ts"
  );
  if (isCemitSentinel(message)) {
    await handleCemitSentinel(message);
    return;
  }
  broadcastAll(message);
}

/** Broadcast a message to all players in a specific room. */
export async function handleRoomBroadcast(msg: Msg): Promise<void> {
  const message = msg.message as string | undefined;
  const room = msg.room as string | undefined;
  const excludeIds = Array.isArray(msg.exclude)
    ? (msg.exclude as string[])
    : [];
  if (!message || !room) return;

  const { sendToRoom } = await import("../../world/move.ts");
  const exclude = excludeIds[0];
  await sendToRoom(room, message, exclude);
}

/** Update an in-memory context state property from a "patch" message. */
export function handlePatch(msg: Msg, context: SDKContext | undefined): void {
  if (msg.prop && context?.state) {
    context.state[msg.prop as string] = msg.value;
  }
}

/** Emit gameHooks events for communication actions on the "result" message. */
export async function emitResultHooks(
  data:    unknown,
  context: SDKContext | undefined,
): Promise<void> {
  const meta = (data as { meta?: Record<string, unknown> } | null)?.meta;
  if (!meta || typeof meta.type !== "string") return;

  const roomId = (context?.here as { id?: string } | undefined)?.id
              || (context?.location as string | undefined)
              || "";

  if (meta.type === "say") {
    await gameHooks.emit("player:say", {
      actorId:   String(meta.actorId   ?? context?.id ?? ""),
      actorName: String(meta.actorName ?? ""),
      roomId,
      message:   String(meta.message   ?? ""),
      socketId:  context?.socketId as string | undefined,
    });
  } else if (meta.type === "pose") {
    await gameHooks.emit("player:pose", {
      actorId:    String(meta.actorId   ?? context?.id ?? ""),
      actorName:  String(meta.actorName ?? ""),
      roomId,
      content:    String(meta.content    ?? ""),
      isSemipose: Boolean(meta.isSemipose),
      socketId:   context?.socketId as string | undefined,
    });
  } else if (meta.type === "page") {
    await gameHooks.emit("player:page", {
      actorId:    String(meta.actorId    ?? context?.id ?? ""),
      actorName:  String(meta.actorName  ?? ""),
      targetId:   String(meta.targetId   ?? ""),
      targetName: String(meta.targetName ?? ""),
      message:    String(meta.message    ?? ""),
    });
  }
}

/** Move an entity: leave/arrive + look via shared moveObject. */
export function handleTeleport(
  msg: Msg,
  context: SDKContext | undefined,
): void {
  if (!msg.target || !msg.destination) return;
  const actorId = context?.id as string | undefined;

  (async () => {
    try {
      const { moveObject } = await import("../../world/move.ts");
      await moveObject({
        targetId: String(msg.target),
        destinationId: String(msg.destination),
        cause: "teleport",
        actorId,
        look: true,
      });
    } catch (e: unknown) {
      console.error("[SandboxHandlers] teleport error:", e);
    }
  })();
}
