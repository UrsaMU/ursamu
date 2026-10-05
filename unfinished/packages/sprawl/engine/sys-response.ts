/**
 * Apply Nodejacker system-response mechanics to a sheet.
 */
import type { ISprawlChar } from "../db/schemas.ts";
import { addPendingGlitch } from "./damage.ts";
import { consoleSpec, type SysResponse } from "./net.ts";
import { netOf, withNet } from "./net-state.ts";
import { tryBlockResponse } from "./exploit-inv.ts";
import { queueHeatSpawn } from "./heat-spawn.ts";
import { runResponseFx } from "./sys-response-fx.ts";

export type ApplyResponseResult = {
  next: ISprawlChar;
  neural: number;
  notes: string[];
};

export {
  effectiveCognition,
  hackBlockedReason,
  netStatusLines,
  tickNetState,
  tryCleanMalware,
} from "./net-state.ts";

export { bankNetExploit } from "./exploit-inv.ts";

function immune(
  c: ISprawlChar,
  kind: "neurostim" | "malware" | "biofeedback",
): boolean {
  const tags = consoleSpec(c)?.tags ?? [];
  if (kind === "neurostim") {
    return tags.includes("immune-neurostim");
  }
  if (kind === "malware") {
    return tags.includes("immune-malware");
  }
  return tags.includes("immune-bioelectric-feedback");
}

/** Apply one system response (catalog neural summed by caller). */
export function applySystemResponse(
  c: ISprawlChar,
  sys: SysResponse,
  rng: () => number = Math.random,
): ApplyResponseResult {
  const notes: string[] = [];
  const n = netOf(c);
  n.lastResponse = sys.slug;
  const tags = sys.tags ?? [];

  if (tags.includes("neurostim") && immune(c, "neurostim")) {
    notes.push("console filters Neurostim — no effect");
    return { next: withNet(c, n), neural: 0, notes };
  }
  if (tags.includes("biofeedback") && immune(c, "biofeedback")) {
    notes.push("console filters bio-feedback — no effect");
    return { next: withNet(c, n), neural: 0, notes };
  }
  if (tags.includes("malware") && immune(c, "malware")) {
    notes.push("console immune to malware — no effect");
    return { next: withNet(c, n), neural: 0, notes };
  }

  let next = c;
  if (sys.forceGlitch) {
    next = addPendingGlitch(next, 1);
    notes.push("ICE Glitch sticky on next roll");
  }

  const ctx = {
    c: next,
    n,
    sys,
    rng,
    notes,
    neural: 0,
  };
  runResponseFx(ctx);
  next = withNet(ctx.c, ctx.n);
  // Realspace heat → delayed NPC spawns
  const q = queueHeatSpawn(next, sys.slug, rng);
  next = q.next;
  const notesOut = [...ctx.notes];
  if (q.note) notesOut.push(q.note);
  return { next, neural: ctx.neural, notes: notesOut };
}

export function applySystemResponses(
  c: ISprawlChar,
  list: SysResponse[],
  rng: () => number = Math.random,
): ApplyResponseResult {
  let next = c;
  let neural = 0;
  const notes: string[] = [];
  for (const sys of list) {
    const tags = sys.tags ?? [];
    if (
      tags.includes("malware") &&
      (next.net?.malwareImmuneHacks ?? 0) > 0
    ) {
      notes.push(`${sys.name}: immunoware — no effect`);
      continue;
    }
    const blk = tryBlockResponse(next);
    next = blk.next;
    if (blk.blocked) {
      notes.push(
        `${sys.name}: BLOCKED (Zero Day/Firewall)`,
      );
      continue;
    }
    const r = applySystemResponse(next, sys, rng);
    next = r.next;
    neural += r.neural;
    for (const note of r.notes) {
      notes.push(`${sys.name}: ${note}`);
    }
  }
  return { next, neural, notes };
}
