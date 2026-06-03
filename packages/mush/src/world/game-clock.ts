/**
 * GameClock — persistent in-game time system.
 *
 * Time is stored as a single integer: total game-minutes elapsed since the
 * fictional epoch (Year 1, Month 1, Day 1, 00:00).
 *
 * Calendar: 12 months × 28 days = 336 days/year.
 * Configurable via `game.timeMultiplier` (default 1.0).
 *   e.g. 2.0 means 2 game-minutes pass per real minute.
 */

import { DBO } from "@ursamu/core";
import { getConfig } from "@ursamu/core";

export type { IGameTime } from "./types.ts";
import type { IGameTime } from "./types.ts";

// ── Calendar constants ────────────────────────────────────────────────────────

const MINUTES_PER_HOUR  = 60;
const HOURS_PER_DAY     = 24;
const DAYS_PER_MONTH    = 28;
const MONTHS_PER_YEAR   = 12;
const MINUTES_PER_DAY   = MINUTES_PER_HOUR  * HOURS_PER_DAY;
const MINUTES_PER_MONTH = MINUTES_PER_DAY   * DAYS_PER_MONTH;
const MINUTES_PER_YEAR  = MINUTES_PER_MONTH * MONTHS_PER_YEAR;

function epochToGameTime(epoch: number): IGameTime {
  const e    = Math.max(0, Math.floor(epoch));
  const year = Math.floor(e / MINUTES_PER_YEAR) + 1;
  const rem1 = e % MINUTES_PER_YEAR;
  const month = Math.floor(rem1 / MINUTES_PER_MONTH) + 1;
  const rem2  = rem1 % MINUTES_PER_MONTH;
  const day   = Math.floor(rem2 / MINUTES_PER_DAY) + 1;
  const rem3  = rem2 % MINUTES_PER_DAY;
  const hour  = Math.floor(rem3 / MINUTES_PER_HOUR);
  const minute = rem3 % MINUTES_PER_HOUR;
  return { year, month, day, hour, minute };
}

function gameTimeToEpoch(t: IGameTime): number {
  return (
    (t.year  - 1) * MINUTES_PER_YEAR  +
    (t.month - 1) * MINUTES_PER_MONTH +
    (t.day   - 1) * MINUTES_PER_DAY   +
    t.hour        * MINUTES_PER_HOUR  +
    t.minute
  );
}

interface IClockRecord { id: string; epoch: number; }

let _epoch = 0;
const _db = new DBO<IClockRecord>("server.gameclock");

export const gameClock = {
  now(): IGameTime {
    return epochToGameTime(_epoch);
  },

  tick(realMs: number): void {
    const mult = getConfig<number>("game.timeMultiplier") ?? 1.0;
    _epoch += (realMs / 60_000) * mult;
    this.save().catch((e: unknown) => console.error("[GameClock] save error:", e));
  },

  format(t?: IGameTime): string {
    const gt = t ?? this.now();
    const hh = String(gt.hour).padStart(2, "0");
    const mm = String(gt.minute).padStart(2, "0");
    return `Year ${gt.year}, Month ${gt.month}, Day ${gt.day}, ${hh}:${mm}`;
  },

  set(partial: Partial<IGameTime>): void {
    const cur = this.now();
    _epoch = gameTimeToEpoch({
      year: partial.year ?? cur.year, month: partial.month ?? cur.month,
      day:  partial.day  ?? cur.day,  hour:  partial.hour  ?? cur.hour,
      minute: partial.minute ?? cur.minute,
    });
  },

  async save(): Promise<void> {
    const existing = await _db.queryOne({ id: "__gameclock__" });
    if (existing) {
      await _db.modify({ id: "__gameclock__" }, "$set", { epoch: _epoch });
    } else {
      await _db.create({ id: "__gameclock__", epoch: _epoch });
    }
  },

  async load(): Promise<void> {
    const record = await _db.queryOne({ id: "__gameclock__" });
    _epoch = record ? (record.epoch ?? 0) : 0;
  },
};
