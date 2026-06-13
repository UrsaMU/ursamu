/**
 * @module world/context
 *
 * Defines `GameContext` — the single resolved execution context produced once
 * per command dispatch — and `buildContext()`, the factory that fetches and
 * hydrates the actor/room from the database and binds the send/broadcast
 * helpers to the calling socket.
 */
import type { IDBObj, IDBOBJ } from "./types.ts";
import { dbojs, hydrate } from "./dbobjs.ts";
import { send as sendFn } from "@ursamu/core";

/**
 * The resolved, hydrated execution context for a single command dispatch.
 */
export interface GameContext {
  /** The WebSocket connection ID for the player who sent the command. */
  socketId: string;
  /** Hydrated actor. Falls back to a stub object when `actorId` is unknown. */
  actor: IDBObj;
  /**
   * Hydrated room with a bound `broadcast` helper.
   * Falls back to a "limbo" stub when the actor has no location.
   */
  room: IDBObj & {
    broadcast(message: string, options?: Record<string, unknown>): void;
  };
  /** Actor's per-execution mutable state (`data.state` on the raw DB object). */
  state: Record<string, unknown>;
  /** Parsed command descriptor. */
  cmd: {
    name: string;
    original?: string;
    args: string[];
    switches?: string[];
  };
  /**
   * Send a message to this socket, or to a specific `target` socket ID
   * when `target` is provided.
   */
  send(message: string, target?: string, options?: Record<string, unknown>): void;
  /**
   * Broadcast a message to everyone in the actor's current room.
   * No-ops when the actor has no location.
   */
  broadcast(message: string, options?: Record<string, unknown>): void;
}

/**
 * Fetch the actor and room from the database, hydrate them, and bind
 * the `send`/`broadcast` helpers to the calling socket.
 */
export async function buildContext(
  socketId: string,
  actorId: string,
  cmd: {
    name: string;
    original?: string;
    args: string[];
    switches?: string[];
  },
): Promise<GameContext> {
  const rawActor: IDBOBJ | null =
    (await dbojs.queryOne({ id: actorId })) ?? null;

  const rawRoom: IDBOBJ | null = rawActor?.location
    ? (await dbojs.queryOne({ id: rawActor.location })) ?? null
    : null;

  const actor: IDBObj = rawActor
    ? hydrate(rawActor)
    : { id: actorId, flags: new Set<string>(), state: {}, contents: [] };

  const roomBase: IDBObj = rawRoom
    ? hydrate(rawRoom)
    : { id: "limbo", flags: new Set<string>(), state: {}, contents: [] };

  if (rawRoom) {
    const rawContents = await dbojs.query({ location: roomBase.id });
    roomBase.contents = rawContents.map((c) => hydrate(c));
  }

  const room = {
    ...roomBase,
    broadcast: (message: string, options?: Record<string, unknown>) => {
      const exclude = (options?.exclude as string[]) || [];
      sendFn([`#${roomBase.id}`], message, options, exclude);
    },
  };

  // data.state is the per-character mutable scratch state stored in the DB.
  const state = (rawActor?.data?.state as Record<string, unknown>) ?? {};

  const send = (
    message: string,
    target?: string,
    options?: Record<string, unknown>,
  ) => sendFn([target ?? socketId], message, options);

  const broadcast = (
    message: string,
    options?: Record<string, unknown>,
  ) => {
    const exclude = (options?.exclude as string[]) || [];
    if (rawActor?.location) {
      sendFn([`#${rawActor.location}`], message, options, exclude);
    }
  };

  return { socketId, actor, room, state, cmd, send, broadcast };
}
