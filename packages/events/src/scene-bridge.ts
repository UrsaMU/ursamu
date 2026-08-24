/**
 * Soft bridge to @ursamu/scene — optional peer.
 *
 * When an event is cancelled/completed, if a scene package is present and
 * exposes gameHooks listeners via a known soft API, we do nothing invasive.
 * Instead we emit a thin gameHooks-compatible side channel only when the
 * host already has gameHooks and a consumer registered for `event:scene-hint`.
 *
 * Primary contract for scene plugins: subscribe to `eventHooks` from this
 * package directly. This module documents the recommended payload shape and
 * provides a no-op-safe publisher used by tests.
 */

import type { IGameEvent } from "./types.ts";
import { eventHooks } from "./hooks.ts";

export type EventSceneHint = {
  kind: "event-status";
  eventId: string;
  eventNumber: number;
  title: string;
  status: IGameEvent["status"];
  startTime: number;
};

type HintHandler = (hint: EventSceneHint) => void | Promise<void>;

const _hintHandlers: HintHandler[] = [];

/** Test/plugin helper — listen for scene-oriented event status changes. */
export function onEventSceneHint(handler: HintHandler): void {
  _hintHandlers.push(handler);
}

export function offEventSceneHint(handler: HintHandler): void {
  const i = _hintHandlers.indexOf(handler);
  if (i !== -1) _hintHandlers.splice(i, 1);
}

async function publishHint(ev: IGameEvent): Promise<void> {
  if (ev.status !== "cancelled" && ev.status !== "completed" &&
    ev.status !== "active") {
    return;
  }
  const hint: EventSceneHint = {
    kind: "event-status",
    eventId: ev.id,
    eventNumber: ev.number,
    title: ev.title,
    status: ev.status,
    startTime: ev.startTime,
  };
  for (const h of [..._hintHandlers]) {
    try {
      await h(hint);
    } catch (e: unknown) {
      console.error("[events] scene-bridge hint handler error:", e);
    }
  }
}

const onStatus = (ev: IGameEvent): void => {
  void publishHint(ev);
};

/** Wire event lifecycle → scene hints (safe if no listeners). */
export function registerSceneBridge(): void {
  eventHooks.on("event:cancelled", onStatus);
  eventHooks.on("event:completed", onStatus);
  eventHooks.on("event:updated", onStatus);
}

export function removeSceneBridge(): void {
  eventHooks.off("event:cancelled", onStatus);
  eventHooks.off("event:completed", onStatus);
  eventHooks.off("event:updated", onStatus);
}
