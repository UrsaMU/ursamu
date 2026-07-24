// +clash — Clash of Wills helper (CtL p.126).

import type { IUrsamuSDK } from "@ursamu/ursamu";
import {
  buildClashPools,
  resolveClashOutcome,
} from "../form/clash.ts";
import { executeRoll } from "../roller/index.ts";
import { getSheet } from "./hedge_helpers.ts";

/**
 * +clash <target> [reason]
 * Both sides roll Power+higher(Resolve,Composure).
 */
export async function clashExec(u: IUrsamuSDK): Promise<void> {
  const rest = u.util.stripSubs(u.cmd.args[1] ?? "").trim() ||
    u.util.stripSubs(u.cmd.args[0] ?? "").trim();

  if (!rest) {
    u.send("Usage: +clash <target> [reason]");
    u.send(
      "  Both roll Power Stat + higher of Resolve/Composure.",
    );
    return;
  }
  const parts = rest.split(/\s+/);
  const targetName = parts[0];
  const reason = parts.slice(1).join(" ");

  const aSheet = getSheet(u.me);
  if (!aSheet) {
    u.send("No character sheet.");
    return;
  }
  const t = await u.util.target(u.me, targetName, true);
  if (!t) {
    u.send(`No one matches '${targetName}'.`);
    return;
  }
  const dSheet = getSheet(t);
  if (!dSheet) {
    u.send("Target has no sheet for Clash of Wills.");
    return;
  }

  const pools = buildClashPools(aSheet, dSheet);
  const aRoll = executeRoll(pools.attackerPool);
  const dRoll = executeRoll(pools.defenderPool);
  const winner = resolveClashOutcome(
    aRoll.successes,
    dRoll.successes,
  );
  const aName = u.util.displayName(u.me, u.me);
  const dName = u.util.displayName(t, u.me);
  let outcome = "Tie — powers cancel; try again or ST.";
  if (winner === "attacker") {
    outcome = `%cg${aName}%cn wins the Clash.`;
  } else if (winner === "defender") {
    outcome = `%cg${dName}%cn wins the Clash.`;
  }

  const lines = [
    `Clash of Wills` +
      (reason ? `: ${reason.slice(0, 40)}` : ""),
    `  ${aName}: ${pools.attackerLabel} ` +
      `${pools.attackerPool}d → ${aRoll.successes}`,
    `  ${dName}: ${pools.defenderLabel} ` +
      `${pools.defenderPool}d → ${dRoll.successes}`,
    `  ${outcome}`,
  ];
  u.send(lines.join("\n"));
  try {
    u.send(lines.join("\n"), t.id);
  } catch {
    // optional
  }
  u.here?.broadcast?.(
    `Clash of Wills: ${aName} vs ${dName}.`,
  );
}
