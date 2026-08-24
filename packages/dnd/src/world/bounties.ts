/**
 * Bounty catalog + progress helpers (pure).
 */
import bountiesJson from "../../resources/bounties.json" with {
  type: "json",
};

export type BountyGoal =
  | { kind: "kills"; template: string; count: number }
  | { kind: "delve"; skin: string };

export interface BountyDef {
  slug: string;
  name: string;
  board: string;
  faction: string;
  summary: string;
  goal: BountyGoal;
  rewardXp: number;
  rewardGp: number;
  rep: number;
  tier: number;
  book?: string;
}

export interface BountyProgress {
  slug: string;
  kills: Record<string, number>;
  delves: string[];
  takenAt: number;
}

export const BOUNTIES: Record<string, BountyDef> =
  bountiesJson as Record<string, BountyDef>;

export function bountyBySlug(
  raw: string,
): BountyDef | undefined {
  const t = raw.toLowerCase().trim();
  return BOUNTIES[t] ??
    Object.values(BOUNTIES).find((b) =>
      b.name.toLowerCase() === t
    );
}

export function listBounties(board?: string): BountyDef[] {
  const all = Object.values(BOUNTIES).sort(
    (a, b) => a.tier - b.tier || a.name.localeCompare(b.name),
  );
  if (!board) return all;
  const b = board.toLowerCase();
  return all.filter((x) => x.board === b);
}

export function emptyProgress(slug: string): BountyProgress {
  return {
    slug,
    kills: {},
    delves: [],
    takenAt: Date.now(),
  };
}

export function noteKill(
  prog: BountyProgress,
  template: string,
): BountyProgress {
  const t = template.toLowerCase();
  const kills = { ...prog.kills, [t]: (prog.kills[t] ?? 0) + 1 };
  return { ...prog, kills };
}

export function noteDelve(
  prog: BountyProgress,
  skin: string,
): BountyProgress {
  const s = skin.toLowerCase();
  if (prog.delves.includes(s)) return prog;
  return { ...prog, delves: [...prog.delves, s] };
}

export function bountyComplete(
  def: BountyDef,
  prog: BountyProgress,
): boolean {
  if (def.goal.kind === "kills") {
    const n = prog.kills[def.goal.template.toLowerCase()] ?? 0;
    return n >= def.goal.count;
  }
  return prog.delves.includes(def.goal.skin.toLowerCase());
}

export function progressLine(
  def: BountyDef,
  prog: BountyProgress | null,
): string {
  if (!prog || prog.slug !== def.slug) return "not taken";
  if (def.goal.kind === "kills") {
    const n = prog.kills[def.goal.template.toLowerCase()] ?? 0;
    return `${n}/${def.goal.count} ${def.goal.template}`;
  }
  const done = prog.delves.includes(def.goal.skin.toLowerCase());
  return done
    ? `cleared ${def.goal.skin}`
    : `need delve ${def.goal.skin}`;
}
