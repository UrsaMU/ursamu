/**
 * Persist bounty progress on player state.dndBounty.
 */
import type { IUrsamuSDK } from "@ursamu/ursamu";
import {
  type BountyProgress,
  bountyBySlug,
  bountyComplete,
  emptyProgress,
  noteDelve,
  noteKill,
} from "./bounties.ts";
import { addRep, readRep } from "./reputation.ts";
import { addCoins } from "../stats/currency.ts";
import { migrateSheet } from "../stats/dnd_sheet.ts";
import { addXp as addXpSheet } from "../stats/rules.ts";

export function readProgress(
  // deno-lint-ignore no-explicit-any
  state: any,
): BountyProgress | null {
  const p = state?.dndBounty;
  if (!p || typeof p !== "object" || !p.slug) return null;
  return {
    slug: String(p.slug),
    kills: (p.kills && typeof p.kills === "object")
      ? p.kills as Record<string, number>
      : {},
    delves: Array.isArray(p.delves)
      ? p.delves.map(String)
      : [],
    takenAt: Number(p.takenAt) || 0,
  };
}

export async function saveProgress(
  u: IUrsamuSDK,
  prog: BountyProgress | null,
): Promise<void> {
  if (!prog) {
    await u.db.modify(u.me.id, "$unset", {
      "data.dndBounty": "",
    });
    // deno-lint-ignore no-explicit-any
    if (u.me.state) delete (u.me.state as any).dndBounty;
    return;
  }
  await u.db.modify(u.me.id, "$set", {
    "data.dndBounty": prog,
  });
  // deno-lint-ignore no-explicit-any
  if (u.me.state) (u.me.state as any).dndBounty = prog;
}

export async function onMonsterKilled(
  u: IUrsamuSDK,
  template: string,
): Promise<string | null> {
  const prog = readProgress(u.me.state);
  if (!prog) return null;
  const def = bountyBySlug(prog.slug);
  if (!def || def.goal.kind !== "kills") return null;
  const next = noteKill(prog, template);
  await saveProgress(u, next);
  const n = next.kills[template.toLowerCase()] ?? 0;
  if (def.goal.template.toLowerCase() !== template.toLowerCase()) {
    return null;
  }
  if (bountyComplete(def, next)) {
    return `%ch%cyBOUNTY>>%cn ${def.name} complete! ` +
      `+bounty/turnin`;
  }
  return `%ch%cyBOUNTY>>%cn ${def.name}: ${n}/` +
    `${def.goal.count} ${def.goal.template}`;
}

export async function onDelveCleared(
  u: IUrsamuSDK,
  skinOrSlug: string,
): Promise<string | null> {
  const prog = readProgress(u.me.state);
  if (!prog) return null;
  const def = bountyBySlug(prog.slug);
  if (!def || def.goal.kind !== "delve") return null;
  // skin may be embedded in run slug like goblin-warren-a1b2
  const skin = def.goal.skin.toLowerCase();
  const raw = skinOrSlug.toLowerCase();
  if (raw !== skin && !raw.startsWith(skin)) return null;
  const next = noteDelve(prog, skin);
  await saveProgress(u, next);
  if (bountyComplete(def, next)) {
    return `%ch%cyBOUNTY>>%cn ${def.name} complete! ` +
      `+bounty/turnin`;
  }
  return null;
}

export async function turnInBounty(
  u: IUrsamuSDK,
): Promise<{ ok: boolean; message: string }> {
  const prog = readProgress(u.me.state);
  if (!prog) {
    return { ok: false, message: "No active bounty." };
  }
  const def = bountyBySlug(prog.slug);
  if (!def) {
    return { ok: false, message: "Unknown bounty." };
  }
  if (!bountyComplete(def, prog)) {
    return {
      ok: false,
      message: "Not finished yet. +bounty for progress.",
    };
  }
  // deno-lint-ignore no-explicit-any
  let sheet = migrateSheet((u.me.state as any)?.dnd ?? {});
  sheet = addXpSheet(sheet, def.rewardXp);
  sheet = addCoins(sheet, def.rewardGp, "gp");
  const rep = addRep(readRep(u.me.state), def.faction, def.rep);
  await u.db.modify(u.me.id, "$set", {
    "data.dnd": sheet,
    "data.dndRep": rep,
  });
  // deno-lint-ignore no-explicit-any
  if (u.me.state) {
    // deno-lint-ignore no-explicit-any
    (u.me.state as any).dnd = sheet;
    // deno-lint-ignore no-explicit-any
    (u.me.state as any).dndRep = rep;
  }
  await saveProgress(u, null);
  return {
    ok: true,
    message:
      `Turned in ${def.name}: +${def.rewardXp} XP, ` +
      `+${def.rewardGp} gp, ${def.faction} rep +${def.rep}.`,
  };
}

export { emptyProgress };
