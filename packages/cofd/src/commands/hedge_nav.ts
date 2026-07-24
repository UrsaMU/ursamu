// +hedge/travel — navigate the Hedge (chase vs Hedge).

import type { IUrsamuSDK } from "@ursamu/ursamu";
import { addCondition } from "../subsystems/conditions.ts";
import { executeRoll } from "../roller/index.ts";
import {
  buildNavPools,
  isInHedge,
  readHedgeState,
  readNavState,
  resolveNavTurn,
  writeHedgeState,
  writeNavState,
  type NavUrgency,
} from "../hedge/index.ts";
import {
  getSheet,
  persistSheet,
  roomHedge,
} from "./hedge_helpers.ts";

function parseUrgency(s: string): NavUrgency {
  const k = s.toLowerCase();
  if (k === "some" || k === "1") return "some";
  if (k === "more" || k === "2") return "more";
  if (k === "most" || k === "3") return "most";
  return "none";
}

/**
 * Parse: <goal> [/urgent=some|more|most] [/miles=N]
 * Or empty to continue active nav.
 */
function parseTravelArgs(rest: string): {
  goal: string;
  urgency: NavUrgency;
  milestones: number;
  bedlam: boolean;
  abort: boolean;
} {
  let urgency: NavUrgency = "none";
  let milestones = 0;
  let bedlam = false;
  let abort = false;
  const tokens = rest.split(/\s+/).filter(Boolean);
  const goalParts: string[] = [];
  for (const t of tokens) {
    const low = t.toLowerCase();
    if (low === "/abort" || low === "abort") {
      abort = true;
      continue;
    }
    if (low.startsWith("/urgent=") || low.startsWith("urgent=")) {
      urgency = parseUrgency(t.split("=")[1] ?? "");
      continue;
    }
    if (low.startsWith("/miles=") || low.startsWith("miles=")) {
      const n = parseInt(t.split("=")[1] ?? "0", 10);
      if (Number.isFinite(n) && n > 0) milestones = Math.min(5, n);
      continue;
    }
    if (low === "/bedlam" || low === "bedlam") {
      bedlam = true;
      continue;
    }
    goalParts.push(t);
  }
  return {
    goal: goalParts.join(" ").trim(),
    urgency,
    milestones,
    bedlam,
    abort,
  };
}

export async function hedgeTravel(
  u: IUrsamuSDK,
  rest: string,
): Promise<void> {
  const sheet0 = getSheet(u.me);
  if (!sheet0) {
    u.send("No character sheet.");
    return;
  }
  const hr = roomHedge(u.here ?? { state: {} });
  const inHedge = isInHedge(hr) ||
    readHedgeState(sheet0).inHedge === true;
  if (!inHedge) {
    u.send(
      "You are not in the Hedge. +hedge/open a gate first.",
    );
    return;
  }

  const args = parseTravelArgs(u.util.stripSubs(rest));
  if (args.abort) {
    const cleared = writeNavState(sheet0, null);
    await persistSheet(u, u.me.id, cleared);
    u.send("You abandon the path. Navigation cleared.");
    return;
  }

  const prior = readNavState(sheet0);
  let goal = args.goal;
  if (!goal && prior) goal = prior.goal;
  if (!goal) {
    u.send(
      "Usage: +hedge/travel <goal> " +
        "[/urgent=some|more|most] [/miles=N]\n" +
        "  Continue: +hedge/travel\n" +
        "  Abort:    +hedge/travel abort",
    );
    return;
  }
  if (prior && args.goal && args.goal !== prior.goal) {
    u.send(
      `Already navigating to "${prior.goal}" ` +
        `(${prior.progress}/${prior.target}). ` +
        `+hedge/travel to continue, or /abort.`,
    );
    return;
  }

  const pools = buildNavPools(
    sheet0,
    {
      room: hr,
      milestones: args.milestones || undefined,
      urgency: args.urgency,
      bedlam: args.bedlam,
    },
    prior?.turns ?? 0,
    prior?.hedgeEdge ?? false,
  );

  if (pools.autoSuccess) {
    const r = resolveNavTurn(goal, prior, pools, 0, 0);
    const sheet = writeNavState(sheet0, null);
    await persistSheet(u, u.me.id, sheet);
    u.send(
      `${r.message}\n  (${pools.mods.join("; ")})`,
    );
    return;
  }

  const pRoll = executeRoll(pools.playerPool);
  const hRoll = executeRoll(pools.hedgePool);
  const r = resolveNavTurn(
    goal,
    prior,
    pools,
    pRoll.successes,
    hRoll.successes,
  );

  let sheet = sheet0;
  if (r.kind === "continue" && r.nav) {
    sheet = writeNavState(sheet, r.nav);
  } else {
    sheet = writeNavState(sheet, null);
  }
  if (r.applyLost) {
    sheet = addCondition(sheet, "lost", "Hedge navigation");
  }
  await persistSheet(u, u.me.id, sheet);

  const lines: string[] = [];
  lines.push(
    `NAV>> Wits+Survival ${pools.playerPool}d → ` +
      `${pRoll.successes}s  |  Hedge ${pools.hedgePool}d → ` +
      `${hRoll.successes}s`,
  );
  lines.push(`  ${r.message}`);
  if (r.kind === "continue") {
    lines.push(
      `  Edge: ${r.hedgeEdge ? "Hedge" : "you"}  ` +
        `Target ${r.target}`,
    );
  }
  if (r.applyLost) {
    lines.push("  Condition: Lost (−2 navigation).");
  }
  u.send(lines.join("\n"));
}
