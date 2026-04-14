/**
 * @module sandbox-handlers-output
 *
 * Handles worker messages that route output to players:
 *   send, broadcast, room:broadcast, teleport, patch
 */
import { send as broadcastSend, broadcast as broadcastAll } from "../broadcast/index.ts";
import { wsService } from "../WebSocket/index.ts";
import type { SDKContext } from "./SDKService.ts";
import { gameHooks } from "../Hooks/GameHooks.ts";

type Msg = Record<string, unknown>;

/** Route a "send" message to the appropriate socket(s). */
export function handleSend(msg: Msg, context: SDKContext | undefined): void {
  const message   = msg.message as string | undefined;
  const msgTarget = msg.target  as string | undefined;
  if (!message) return;

  const targets = msgTarget
    ? [msgTarget]
    : context?.socketId ? [context.socketId as string] : [];
  broadcastSend(targets, message, msg.data as Record<string, unknown> | undefined);

  if ((msg.data as Record<string, unknown> | undefined)?.quit && context?.socketId) {
    const sock = wsService.getConnectedSockets().find(s => s.id === context.socketId);
    if (sock?.cid) wsService.disconnect(sock.cid);
  }
}

/** Route a "broadcast" message to all connected sockets. */
export function handleBroadcast(msg: Msg): void {
  const message = msg.message as string | undefined;
  if (message) broadcastAll(message, msg.data as Record<string, unknown> | undefined);
}

/** Broadcast a message to all players in a specific room. */
export async function handleRoomBroadcast(msg: Msg): Promise<void> {
  const message    = msg.message  as string | undefined;
  const room       = msg.room     as string | undefined;
  const excludeIds = Array.isArray(msg.exclude) ? (msg.exclude as string[]) : [];
  if (!message || !room) return;

  const { dbojs } = await import("../Database/index.ts");
  const players = await dbojs.query({ $and: [{ location: room }, { flags: /connected/i }] });
  const targets = players.filter(p => !excludeIds.includes(p.id)).map(p => p.id);
  if (targets.length > 0) broadcastSend(targets, message, {});
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

/** Move an entity to a new location, notifying rooms and triggering auto-look. */
export function handleTeleport(msg: Msg, context: SDKContext | undefined): void {
  if (!msg.target || !msg.destination) return;
  const { moniker: mk } = { moniker: (o: { data?: Record<string, unknown> }) => String(o.data?.name ?? "Unknown") };

  (async () => {
    const { dbojs: db }  = await import("../Database/index.ts");
    const { moniker }    = await import("../../utils/moniker.ts");

    const target = await db.queryOne({ id: msg.target as string });
    const dest   = await db.queryOne({ id: msg.destination as string });
    if (!target || !dest) return;

    const sourceId = target.location;

    if (sourceId) {
      const sourcePlayers = await db.query({
        $and: [{ location: sourceId }, { flags: /connected/i }, { id: { $ne: target.id } }],
      });
      if (sourcePlayers.length > 0) {
        broadcastSend(sourcePlayers.map(p => p.id), `${moniker(target)} has left.`, {});
      }
    }

    await db.modify({ id: target.id }, "$set", { location: msg.destination as string });

    const destPlayers = await db.query({
      $and: [{ location: msg.destination as string }, { flags: /connected/i }, { id: { $ne: target.id } }],
    });
    if (destPlayers.length > 0) {
      const sourceRoom = sourceId ? await db.queryOne({ id: sourceId }) : null;
      const fromStr    = sourceRoom?.data?.name ? ` from ${sourceRoom.data.name}` : "";
      broadcastSend(destPlayers.map(p => p.id), `${moniker(target)} has arrived${fromStr}.`, {});
    }

    const sock = wsService.getConnectedSockets().find(s => s.cid === target.id);
    if (sock) {
      const { cmdParser } = await import("../commands/index.ts");
      await cmdParser.run({ socket: sock, msg: "look" });
    }
  })().catch(err => console.error("[SandboxHandlers] teleport error:", err));

  void mk; // suppress unused-var lint on the inline fallback
  void context;
}
