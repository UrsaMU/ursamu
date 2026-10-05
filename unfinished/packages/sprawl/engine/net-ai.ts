/**
 * AI encounters + Paradoxware (Nodejacker).
 */
import type { ISprawlChar } from "../db/schemas.ts";
import {
  NET_AI,
  PARADOXWARE,
  find,
  findByName,
  type Row,
} from "./catalog.ts";
import { consoleSpec } from "./net.ts";
import { effectiveCognition } from "./net-state.ts";
import { netOf, withNet } from "./net-state.ts";

function d6(rng: () => number): number {
  return 1 + Math.floor(rng() * 6);
}
function nd6(n: number, rng: () => number): number {
  let t = 0;
  for (let i = 0; i < n; i++) t += d6(rng);
  return t;
}

export function resolveAi(q: string): Row | undefined {
  return find("netAi", q) ?? findByName(NET_AI, q);
}

export function resolveParadox(q: string): Row | undefined {
  return find("paradoxware", q) ?? findByName(PARADOXWARE, q);
}

export function rollAiDs(row: Row, rng: () => number): number {
  const base = Number(row.dsBase ?? 8);
  return base + nd6(2, rng);
}

export type AiStartResult =
  | { ok: true; next: ISprawlChar; notes: string[] }
  | { ok: false; error: string };

/** Start fight vs AI class. */
export function startAiFight(
  c: ISprawlChar,
  aiQ: string,
  rng: () => number = Math.random,
): AiStartResult {
  const row = resolveAi(aiQ);
  if (!row) return { ok: false, error: "unknown AI class" };
  const ds = rollAiDs(row, rng);
  const n = netOf(c);
  n.aiFight = {
    slug: row.slug,
    name: String(row.name ?? row.slug),
    ds,
    dsMax: ds,
  };
  return {
    ok: true,
    next: withNet(c, n),
    notes: [
      `${n.aiFight.name} DS${ds} online` +
        ` — +paradox <ware> or +hack`,
    ],
  };
}

export type ParadoxResult =
  | { ok: true; next: ISprawlChar; notes: string[]; won: boolean }
  | { ok: false; error: string };

/**
 * Deploy paradoxware vs current AI.
 * Correct type: +1. Halve DS → grasp (won).
 */
export function strikeParadox(
  c: ISprawlChar,
  wareQ: string,
  rng: () => number = Math.random,
): ParadoxResult {
  const fight = c.net?.aiFight;
  if (!fight) {
    return { ok: false, error: "no AI engaged (+paradox/scan)" };
  }
  const ware = resolveParadox(wareQ);
  if (!ware) return { ok: false, error: "unknown paradoxware" };
  const vs = (ware.vs as string[] | undefined) ?? [];
  const tags = (ware.tags as string[] | undefined) ?? [];
  const correct = tags.includes("all-classes") ||
    vs.includes(fight.slug);
  const spec = consoleSpec(c);
  const cog = effectiveCognition(c);
  const bonus = (spec?.bonus ?? 0) + (correct ? 1 : 0) +
    Number(ware.bonus ?? 1);
  const total = d6(rng) + d6(rng) + cog + bonus;
  const notes: string[] = [
    `${ware.name} ${total} vs DS${fight.ds}` +
      (correct ? " (matched)" : " (wrong class)"),
  ];
  if (!correct) {
    notes.push("wrong paradox type — no bonus");
  }
  if (total <= fight.ds) {
    notes.push("AI shrugs it off");
    return { ok: true, next: c, notes, won: false };
  }
  const margin = total - fight.ds;
  const newDs = Math.max(0, fight.ds - margin);
  const n = netOf(c);
  const half = Math.ceil(fight.dsMax / 2);
  if (newDs <= half) {
    delete n.aiFight;
    notes.push(
      `AI DS${newDs} ≤ half (${half}) — in your grasp`,
    );
    n.lastSoftNote = `${fight.name} compromised`;
    return {
      ok: true,
      next: withNet(c, n),
      notes,
      won: true,
    };
  }
  n.aiFight = { ...fight, ds: newDs, paradox: ware.slug };
  notes.push(`AI reeling DS${newDs}/${fight.dsMax}`);
  return {
    ok: true,
    next: withNet(c, n),
    notes,
    won: false,
  };
}

export function clearAiFight(c: ISprawlChar): ISprawlChar {
  const n = netOf(c);
  if (!n.aiFight) return c;
  delete n.aiFight;
  return withNet(c, n);
}
