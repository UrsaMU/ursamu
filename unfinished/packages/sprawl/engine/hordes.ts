/**
 * Optional Hollywood Hordes (book p.30-ish):
 * Mob DS = headcount; each damage point drops one punk.
 */
import type { ISprawlChar } from "../db/schemas.ts";

export interface IHorde {
  name: string;
  /** Living members (= current DS). */
  size: number;
  sizeMax: number;
  at: number;
}

export function getHorde(c: ISprawlChar): IHorde | undefined {
  return c.horde;
}

export function spawnHorde(
  c: ISprawlChar,
  name: string,
  size: number,
): ISprawlChar {
  const n = Math.max(1, Math.min(40, Math.floor(size)));
  const label = (name || "street punks").trim().slice(0, 40);
  return {
    ...c,
    horde: {
      name: label,
      size: n,
      sizeMax: n,
      at: Date.now(),
    },
  };
}

export function clearHorde(c: ISprawlChar): ISprawlChar {
  const next = { ...c };
  delete next.horde;
  return next;
}

export type HordeHit = {
  next: ISprawlChar;
  before: number;
  after: number;
  dropped: number;
  wiped: boolean;
  ds: number;
};

/**
 * Apply attack damage (margin) to the horde.
 * Damage points = punks removed; DS shrinks with size.
 */
export function hitHorde(
  c: ISprawlChar,
  damage: number,
): HordeHit | null {
  const h = c.horde;
  if (!h || h.size <= 0) return null;
  const before = h.size;
  const dmg = Math.max(0, Math.floor(damage));
  const after = Math.max(0, before - dmg);
  const dropped = before - after;
  const horde = after > 0
    ? { ...h, size: after }
    : undefined;
  const next: ISprawlChar = { ...c, horde };
  if (!horde) delete next.horde;
  return {
    next,
    before,
    after,
    dropped,
    wiped: after <= 0,
    ds: before,
  };
}

export function hordeDs(c: ISprawlChar): number | null {
  const h = c.horde;
  if (!h || h.size <= 0) return null;
  return h.size;
}
