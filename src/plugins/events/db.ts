import { DBO } from "../../services/Database/database.ts";
import { counters } from "../../services/Database/index.ts";
import type { IGameEvent, IEventRSVP } from "../../@types/IGameEvent.ts";

export type { IGameEvent, IEventRSVP };

export const gameEvents = new DBO<IGameEvent>("server.game-events");
export const eventRsvps = new DBO<IEventRSVP>("server.event-rsvps");

export function getNextEventNumber(): Promise<number> {
  return counters.atomicIncrement("eventid");
}

/** Parse "YYYY-MM-DD" or "YYYY-MM-DD HH:MM" into a ms timestamp. Returns null on failure. */
export function parseDateTime(str: string): number | null {
  const normalized = str.trim().replace(" ", "T");
  const d = new Date(normalized);
  return isNaN(d.getTime()) ? null : d.getTime();
}

/** Format a ms timestamp for in-game display. */
export function formatDateTime(ms: number): string {
  return new Date(ms).toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}
