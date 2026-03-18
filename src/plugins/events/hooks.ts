import type { IGameEvent, IEventRSVP } from "../../@types/IGameEvent.ts";

// ─── hook type map ────────────────────────────────────────────────────────────

export type EventHookMap = {
  /** A new event was created. */
  "event:created":         (event: IGameEvent) => void | Promise<void>;
  /** An event's details were updated (title, description, location, times, tags). */
  "event:updated":         (event: IGameEvent) => void | Promise<void>;
  /** An event's status was changed to "cancelled". */
  "event:cancelled":       (event: IGameEvent) => void | Promise<void>;
  /** An event's status was changed to "completed". */
  "event:completed":       (event: IGameEvent) => void | Promise<void>;
  /** An event was permanently deleted. */
  "event:deleted":         (event: IGameEvent) => void | Promise<void>;
  /** A player submitted or updated an RSVP. */
  "event:rsvp":            (event: IGameEvent, rsvp: IEventRSVP) => void | Promise<void>;
  /** A player cancelled their RSVP. */
  "event:rsvp-cancelled":  (event: IGameEvent, rsvp: IEventRSVP) => void | Promise<void>;
};

type HandlerList = { [K in keyof EventHookMap]: EventHookMap[K][] };

// ─── registry ─────────────────────────────────────────────────────────────────

const _handlers: HandlerList = {
  "event:created":        [],
  "event:updated":        [],
  "event:cancelled":      [],
  "event:completed":      [],
  "event:deleted":        [],
  "event:rsvp":           [],
  "event:rsvp-cancelled": [],
};

// ─── public API ───────────────────────────────────────────────────────────────

export interface IEventHooks {
  on<K extends keyof EventHookMap>(event: K, handler: EventHookMap[K]): void;
  off<K extends keyof EventHookMap>(event: K, handler: EventHookMap[K]): void;
  emit<K extends keyof EventHookMap>(event: K, ...args: Parameters<EventHookMap[K]>): Promise<void>;
}

export const eventHooks: IEventHooks = {
  /**
   * Register a handler for an event lifecycle hook.
   *
   * @example
   * ```ts
   * import { eventHooks } from "jsr:@ursamu/ursamu/plugins/events";
   *
   * eventHooks.on("event:created", (ev) => {
   *   console.log(`New event #${ev.number}: ${ev.title}`);
   * });
   * ```
   */
  on<K extends keyof EventHookMap>(event: K, handler: EventHookMap[K]): void {
    (_handlers[event] as EventHookMap[K][]).push(handler);
  },

  /** Remove a previously registered handler. */
  off<K extends keyof EventHookMap>(event: K, handler: EventHookMap[K]): void {
    const list = _handlers[event] as EventHookMap[K][];
    const idx = list.indexOf(handler);
    if (idx !== -1) list.splice(idx, 1);
  },

  /** Fire all registered handlers (errors are caught and logged). */
  async emit<K extends keyof EventHookMap>(
    event: K,
    ...args: Parameters<EventHookMap[K]>
  ): Promise<void> {
    for (const handler of [...(_handlers[event] as ((...a: Parameters<EventHookMap[K]>) => void | Promise<void>)[])]) {
      try {
        await (handler as (...a: Parameters<EventHookMap[K]>) => void | Promise<void>)(...args);
      } catch (e) {
        console.error(`[events] Uncaught error in hook "${event}":`, e);
      }
    }
  },
};
