/**
 * GameClock — persistent in-game time system.
 *
 * Time is stored as a single integer: total game-minutes elapsed since the
 * fictional epoch (Year 1, Month 1, Day 1, 00:00).
 *
 * Calendar: 12 months × 28 days = 336 days/year.
 * Configurable multiplier: `game.timeMultiplier` (default 1.0).
 *   e.g. 2.0 means 2 game-minutes pass per real minute.
 */

import { getConfig } from "../Config/mod.ts";

export interface IGameTime {
  year: number;
  month: number;   // 1–12
  day: number;     // 1–28
  hour: number;    // 0–23
  minute: number;  // 0–59
}

// Calendar constants
const MINUTES_PER_HOUR  = 60;
const HOURS_PER_DAY     = 24;
const DAYS_PER_MONTH    = 28;
const MONTHS_PER_YEAR   = 12;
const MINUTES_PER_DAY   = MINUTES_PER_HOUR * HOURS_PER_DAY;           // 1440
const MINUTES_PER_MONTH = MINUTES_PER_DAY  * DAYS_PER_MONTH;          // 40320
const MINUTES_PER_YEAR  = MINUTES_PER_MONTH * MONTHS_PER_YEAR;        // 483840

/** Convert a game-minutes epoch to a structured IGameTime. */
function epochToGameTime(epoch: number): IGameTime {
  const e = Math.max(0, Math.floor(epoch));
  const year   = Math.floor(e / MINUTES_PER_YEAR) + 1;
  const rem1   = e % MINUTES_PER_YEAR;
  const month  = Math.floor(rem1 / MINUTES_PER_MONTH) + 1;
  const rem2   = rem1 % MINUTES_PER_MONTH;
  const day    = Math.floor(rem2 / MINUTES_PER_DAY) + 1;
  const rem3   = rem2 % MINUTES_PER_DAY;
  const hour   = Math.floor(rem3 / MINUTES_PER_HOUR);
  const minute = rem3 % MINUTES_PER_HOUR;
  return { year, month, day, hour, minute };
}

/** Convert a structured IGameTime back to a game-minutes epoch. */
function gameTimeToEpoch(t: IGameTime): number {
  return (
    (t.year  - 1) * MINUTES_PER_YEAR  +
    (t.month - 1) * MINUTES_PER_MONTH +
    (t.day   - 1) * MINUTES_PER_DAY   +
    t.hour        * MINUTES_PER_HOUR  +
    t.minute
  );
}

interface IGameClockRecord {
  id: string;
  epoch: number;
}

/** Internal epoch (game-minutes since fictional start). */
let _epoch = 0;

export const gameClock = {
  /** Return the current game time. */
  now(): IGameTime {
    return epochToGameTime(_epoch);
  },

  /**
   * Advance the clock by `realMs` real milliseconds multiplied by the
   * configured time multiplier.
   * Saves the new epoch to the DB after advancing.
   */
  tick(realMs: number): void {
    const mult = getConfig<number>("game.timeMultiplier") ?? 1.0;
    const gameMinutes = (realMs / 60_000) * mult;
    _epoch += gameMinutes;
    // fire-and-forget save
    this.save().catch((e) =>
      console.error("[GameClock] save error during tick:", e)
    );
  },

  /** Format a game time (defaults to now) as a readable string. */
  format(t?: IGameTime): string {
    const gt = t ?? this.now();
    const hh = String(gt.hour).padStart(2, "0");
    const mm = String(gt.minute).padStart(2, "0");
    return `Year ${gt.year}, Month ${gt.month}, Day ${gt.day}, ${hh}:${mm}`;
  },

  /** Directly set one or more fields of the current game time (admin use). */
  set(partial: Partial<IGameTime>): void {
    const current = this.now();
    const merged: IGameTime = {
      year:   partial.year   ?? current.year,
      month:  partial.month  ?? current.month,
      day:    partial.day    ?? current.day,
      hour:   partial.hour   ?? current.hour,
      minute: partial.minute ?? current.minute,
    };
    _epoch = gameTimeToEpoch(merged);
  },

  /** Persist the current epoch to the DB. */
  async save(): Promise<void> {
    const { DBO } = await import("../Database/database.ts");
    const db = new DBO<IGameClockRecord>("server.gameclock");
    const existing = await db.queryOne({ id: "__gameclock__" });
    if (existing) {
      await db.modify({ id: "__gameclock__" }, "$set", { epoch: _epoch });
    } else {
      await db.create({ id: "__gameclock__", epoch: _epoch });
    }
  },

  /** Load the epoch from the DB. If no record exists, starts at 0 (Year 1, Month 1, Day 1, 00:00). */
  async load(): Promise<void> {
    const { DBO } = await import("../Database/database.ts");
    const db = new DBO<IGameClockRecord>("server.gameclock");
    const record = await db.queryOne({ id: "__gameclock__" });
    _epoch = record ? (record.epoch ?? 0) : 0;
  },
};
