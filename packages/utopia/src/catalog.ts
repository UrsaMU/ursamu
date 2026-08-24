import type { IActionDef, IStory } from "./types.ts";
import newsJson from "../data/newsfeed.json" with { type: "json" };
import actJson from "../data/actions.json" with { type: "json" };

export const NEWS_CATALOG: readonly IStory[] =
  (newsJson as IStory[]).map((s) => ({
    id: s.id,
    title: s.title,
    severity: 0,
    ongoing: s.ongoing,
  }));

export const ACTIONS: readonly IActionDef[] =
  actJson as IActionDef[];

export function findAction(id: string): IActionDef | null {
  const key = id.toLowerCase().trim();
  return ACTIONS.find((a) => a.id === key) ?? null;
}

export function pickStory(
  used: Set<string>,
  rng: () => number,
): IStory | null {
  const pool = NEWS_CATALOG.filter((s) => !used.has(s.id));
  if (!pool.length) return null;
  const i = Math.min(
    pool.length - 1,
    Math.floor(rng() * pool.length),
  );
  const s = pool[i];
  const sev = Math.min(6, Math.max(1, Math.floor(rng() * 6) + 1));
  return { ...s, severity: sev };
}
