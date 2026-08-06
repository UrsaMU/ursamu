// +feed — slake Vitae from animal, human, or Kindred blood.

import type { IUrsamuSDK } from "@ursamu/ursamu";
import {
  applyFeed,
  parseFeedSource,
  type FeedSource,
} from "../beast/index.ts";
import { isVampireSheet } from "../vitae/index.ts";
import {
  migrateSheet,
  refreshAdvantages,
  type CofdSheet,
} from "../stats/index.ts";

function getSheet(obj: {
  state?: Record<string, unknown>;
}): CofdSheet | null {
  const raw = obj.state?.cofd;
  if (!raw || typeof raw !== "object") return null;
  return migrateSheet(raw);
}

async function persist(
  u: IUrsamuSDK,
  id: string,
  sheet: CofdSheet,
): Promise<void> {
  await u.db.modify(id, "$set", {
    "data.cofd": refreshAdvantages(sheet),
  });
}

/**
 * Parse:
 *   +feed animal [N]
 *   +feed human [N]
 *   +feed kindred [N]
 *   +feed <player>[=N]           (defaults human; kindred if vamp)
 *   +feed/animal N
 */
function parseFeedArgs(
  sw: string,
  rest: string,
): {
  source: FeedSource | null;
  amount: number;
  targetName: string;
  error?: string;
} {
  const combined = [sw, rest].filter(Boolean).join(" ").trim();
  if (!combined) {
    return {
      source: null,
      amount: 1,
      targetName: "",
      error:
        "Usage: +feed <animal|human|kindred> [N]  or  " +
        "+feed <player>[=N]",
    };
  }

  // source amount
  const parts = combined.split(/\s+/);
  const src0 = parseFeedSource(parts[0] ?? "");
  if (src0) {
    const amount = parts[1] ? parseInt(parts[1], 10) : 1;
    if (Number.isNaN(amount) || amount < 1) {
      return {
        source: src0,
        amount: 1,
        targetName: "",
        error: "Amount must be a positive integer.",
      };
    }
    return { source: src0, amount, targetName: "" };
  }

  // target[=N]
  const eq = combined.indexOf("=");
  let targetName = combined;
  let amount = 1;
  if (eq >= 0) {
    targetName = combined.slice(0, eq).trim();
    amount = parseInt(combined.slice(eq + 1).trim(), 10);
    if (Number.isNaN(amount) || amount < 1) {
      return {
        source: null,
        amount: 1,
        targetName: "",
        error: "Amount must be a positive integer.",
      };
    }
  }
  return { source: null, amount, targetName };
}

export async function feedExec(u: IUrsamuSDK): Promise<void> {
  const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();
  const rest = u.util.stripSubs(u.cmd.args[1] ?? "").trim();
  const sheet = getSheet(u.me);

  if (!sheet || !isVampireSheet(sheet)) {
    u.send("Only vampires feed for Vitae.");
    return;
  }

  // Allow /animal style switch as source
  let sourceHint = "";
  let body = rest;
  if (
    sw === "animal" ||
    sw === "human" ||
    sw === "kindred"
  ) {
    sourceHint = sw;
    body = rest;
  } else if (sw && !rest) {
    body = sw;
  } else if (sw) {
    body = `${sw} ${rest}`.trim();
  }

  const parsed = parseFeedArgs(sourceHint, body);
  if (parsed.error) {
    u.send(parsed.error);
    return;
  }

  let source = parsed.source;
  let victim: CofdSheet | null = null;
  let victimId = "";
  let vesselLabel = source ?? "vessel";

  if (parsed.targetName) {
    const t = await u.util.target(
      u.me,
      parsed.targetName,
      true,
    );
    if (!t) {
      u.send(`No one matches '${parsed.targetName}'.`);
      return;
    }
    victim = getSheet(t);
    victimId = t.id;
    vesselLabel = u.util.displayName(t, u.me);
    if (!source) {
      source = victim && isVampireSheet(victim)
        ? "kindred"
        : "human";
    }
  }

  if (!source) {
    u.send(
      "Usage: +feed <animal|human|kindred> [N]  or  " +
        "+feed <player>[=N]",
    );
    return;
  }

  const r = applyFeed(
    sheet,
    parsed.amount,
    source,
    victim,
  );
  if (!r.ok || !r.predator) {
    u.send(r.reason ?? "Feeding failed.");
    return;
  }

  await persist(u, u.me.id, r.predator);
  if (r.victim && victimId) {
    await persist(u, victimId, r.victim);
  }

  const lines = [
    `%chFeeding%cn on %cy${vesselLabel}%cn (${source}):`,
    ...r.lines,
  ];
  if (r.breakingPointHint) {
    lines.push(
      "Consider +integrity/break for a violent feeding.",
    );
  }
  u.send(lines.join("\n"));
}
