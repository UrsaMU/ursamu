/**
 * Realspace heat → delayed NPC spawns (seekers, tac, cops).
 */
import type { IUrsamuSDK } from "@ursamu/ursamu";
import type { INetState, ISprawlChar } from "../db/schemas.ts";
import { spawnNpc } from "./npcs.ts";
import { netOf, nowMs, withNet } from "./net-state.ts";

export type PendingSpawn = {
  kind: string;
  slug: string;
  name: string;
  count: number;
  at: number;
  label: string;
};

function d6(rng: () => number): number {
  return 1 + Math.floor(rng() * 6);
}

/** Map system-response slugs → spawn plans. */
export function planSpawnFromResponse(
  slug: string,
  rng: () => number = Math.random,
): PendingSpawn | null {
  const t = nowMs();
  switch (slug) {
    case "seekers": {
      const n = d6(rng);
      return {
        kind: "seekers",
        slug: "corporate-security",
        name: "Seeker Drone",
        count: Math.min(n, 4),
        at: t + d6(rng) * 60_000,
        label: `${n} seeker unit(s)`,
      };
    }
    case "tac-team":
      return {
        kind: "tac-team",
        slug: "killmorph",
        name: "Tac Operator",
        count: 2 + (d6(rng) > 3 ? 1 : 0),
        at: t + d6(rng) * 60_000,
        label: "tac-team",
      };
    case "nine-one-one":
      return {
        kind: "cops",
        slug: "sprawl-cop",
        name: "TF Officer",
        count: 2,
        at: t + (1 + d6(rng)) * 3_600_000,
        label: "Transmission Felonies",
      };
    case "sense-net": {
      const n = d6(rng);
      return {
        kind: "ops",
        slug: "corporate-agent",
        name: "Sense/Net Op",
        count: Math.min(n, 3),
        at: t + d6(rng) * 120_000,
        label: `${n} Sense/Net op(s)`,
      };
    }
    case "trace-protocol":
      // Soft: one agent later
      return {
        kind: "trace",
        slug: "corporate-agent",
        name: "Trace Runner",
        count: 1,
        at: t + 5 * 60_000,
        label: "trace runner",
      };
    default:
      return null;
  }
}

/** Queue spawn on net state after a response. */
export function queueHeatSpawn(
  c: ISprawlChar,
  responseSlug: string,
  rng: () => number = Math.random,
): { next: ISprawlChar; note?: string } {
  const plan = planSpawnFromResponse(responseSlug, rng);
  if (!plan) return { next: c };
  const n = netOf(c);
  const q = [...(n.pendingSpawns ?? []), plan].slice(-8);
  n.pendingSpawns = q as INetState["pendingSpawns"];
  n.heatNote = `${plan.label} ETA`;
  return {
    next: withNet(c, n),
    note: `${plan.label} inbound (realspace)`,
  };
}

/**
 * Spawn any due heat responses into the current room.
 */
export async function flushHeatSpawns(
  u: IUrsamuSDK,
  c: ISprawlChar,
): Promise<{ next: ISprawlChar; notes: string[]; count: number }> {
  const n = netOf(c);
  const q = [...(n.pendingSpawns ?? [])] as PendingSpawn[];
  if (!q.length) return { next: c, notes: [], count: 0 };
  const t = nowMs();
  const due = q.filter((p) => p.at <= t);
  const rest = q.filter((p) => p.at > t);
  const notes: string[] = [];
  let count = 0;
  for (const p of due) {
    for (let i = 0; i < p.count; i++) {
      const label = p.count > 1
        ? `${p.name} ${i + 1}`
        : p.name;
      const obj = await spawnNpc(u, {
        slug: p.slug,
        name: label,
      });
      if (obj) count++;
    }
    notes.push(
      `${p.label} arrived (${p.count}× ${p.name})`,
    );
  }
  n.pendingSpawns = rest.length
    ? rest as INetState["pendingSpawns"]
    : undefined;
  if (!rest.length && n.heatNote?.includes("ETA")) {
    delete n.heatNote;
  }
  return { next: withNet(c, n), notes, count };
}

export function pendingSpawnLines(c: ISprawlChar): string[] {
  const q = (c.net?.pendingSpawns ?? []) as PendingSpawn[];
  if (!q.length) return [];
  const t = nowMs();
  return q.map((p) => {
    const sec = Math.max(0, Math.ceil((p.at - t) / 1000));
    const eta = sec <= 0
      ? "NOW"
      : sec < 120
      ? `${sec}s`
      : `${Math.ceil(sec / 60)}m`;
    return `${p.label} · ETA ${eta}`;
  });
}
