/**
 * Staff grants — cash, AP, parse helpers.
 * Catalog mint: staff-mint.ts
 */
import type { ISprawlChar } from "../db/schemas.ts";
import { grantAp } from "./advance-rules.ts";

export type GrantOk = {
  ok: true;
  char: ISprawlChar;
  note: string;
};
export type GrantFail = { ok: false; reason: string };
export type GrantResult = GrantOk | GrantFail;

/** Parse "Name=rest" or "Name rest". */
export function parseWhoRest(
  arg: string,
): { who: string; rest: string } | null {
  const s = arg.trim();
  if (!s) return null;
  const eq = s.indexOf("=");
  if (eq > 0) {
    const who = s.slice(0, eq).trim();
    const rest = s.slice(eq + 1).trim();
    if (who && rest) return { who, rest };
  }
  const m = s.match(/^(\S+)\s+(.+)$/);
  if (m) return { who: m[1], rest: m[2].trim() };
  return null;
}

export function grantCash(
  c: ISprawlChar,
  amount: number,
): GrantResult {
  const n = Math.floor(amount);
  if (!Number.isFinite(n) || n === 0 || Math.abs(n) > 1_000_000) {
    return {
      ok: false,
      reason: "Need amount −1e6…1e6 (not 0).",
    };
  }
  const next = Math.max(0, (c.bityuan ?? 0) + n);
  return {
    ok: true,
    char: { ...c, bityuan: next },
    note: `${n > 0 ? "+" : ""}${n} b¥ → ${next}`,
  };
}

export function grantApAmount(
  c: ISprawlChar,
  amount: number,
): GrantResult {
  const n = Math.floor(amount);
  if (!Number.isFinite(n) || n <= 0 || n > 10_000) {
    return { ok: false, reason: "Need AP 1…10000." };
  }
  const next = grantAp(c, n);
  return {
    ok: true,
    char: next,
    note: `+${n} AP → pool ${next.ap}` +
      ` · life ${next.apTotal ?? 0}` +
      ` · Lv${next.level}`,
  };
}

export { grantCatalogGear } from "./staff-mint.ts";
