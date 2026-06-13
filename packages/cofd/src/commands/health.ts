// +health command: view, apply, and heal damage on a character's Health track.

import { divider, type IUrsamuSDK } from "@ursamu/ursamu";
import {
  applyDamage,
  healDamage,
  healthMax,
  woundPenalty,
  type DamageType,
} from "../health/index.ts";
import {
  refreshAdvantages,
  type CofdSheet,
  type HealthTrack,
} from "../stats/index.ts";

interface ParsedSwitch {
  action: "view" | "apply" | "heal";
  type: DamageType | "any";
  amount: number;
  error?: string;
}

/**
 * Parses a switch tail like `bash`, `bash5`, `heal`, `heal3`, `heal-lethal2`.
 * Returns `null` for empty (view) switch.
 */
function parseSwitch(sw: string): ParsedSwitch | null {
  if (!sw) return null;
  const m = sw.match(/^([a-z-]+?)(\d+)?$/i);
  if (!m) {
    return {
      action: "apply",
      type: "bashing",
      amount: 0,
      error: `Unknown switch '/${sw}'.`,
    };
  }
  const word = m[1].toLowerCase();
  const amount = m[2] ? parseInt(m[2], 10) : 1;

  switch (word) {
    case "bash":
    case "bashing":
      return { action: "apply", type: "bashing", amount };
    case "lethal":
      return { action: "apply", type: "lethal", amount };
    case "agg":
    case "aggravated":
      return { action: "apply", type: "aggravated", amount };
    case "heal":
      return { action: "heal", type: "any", amount };
    case "heal-bash":
    case "heal-bashing":
      return { action: "heal", type: "bashing", amount };
    case "heal-lethal":
      return { action: "heal", type: "lethal", amount };
    case "heal-agg":
    case "heal-aggravated":
      return { action: "heal", type: "aggravated", amount };
    default:
      return {
        action: "apply",
        type: "bashing",
        amount: 0,
        error: `Unknown switch '/${sw}'.`,
      };
  }
}

function renderTrack(track: HealthTrack, max: number): string {
  const boxes: string[] = [];
  let agg = track.aggravated;
  let leth = track.lethal;
  let bash = track.bashing;
  for (let i = 0; i < max; i++) {
    if (agg > 0) { boxes.push("[*]"); agg -= 1; }
    else if (leth > 0) { boxes.push("[X]"); leth -= 1; }
    else if (bash > 0) { boxes.push("[/]"); bash -= 1; }
    else { boxes.push("[ ]"); }
  }
  return boxes.join("");
}

function renderHealthSummary(name: string, track: HealthTrack, max: number): string {
  const wp = woundPenalty(track, max);
  const lines: string[] = [];
  lines.push(`  %chHealth (${name}):%cn ${renderTrack(track, max)}  (${max})`);
  lines.push(`  %chWound Penalty:%cn ${wp}`);
  return lines.join("\n");
}

export async function healthExec(u: IUrsamuSDK) {
  const swRaw = (u.cmd.args[0] ?? "").toLowerCase().trim();
  const rest = u.util.stripSubs(u.cmd.args[1] ?? "").trim();

  const targetName = rest;
  const target = targetName
    ? await u.util.target(u.me, targetName, true)
    : u.me;

  if (!target) {
    u.send(`Player '${targetName}' not found.`);
    return;
  }

  const sheetRaw = target.state?.cofd as CofdSheet | undefined;
  if (!sheetRaw) {
    u.send("That player does not have an approved character sheet yet.");
    return;
  }
  const sheet = refreshAdvantages({ ...sheetRaw });
  const max = healthMax(sheet);
  const current: HealthTrack = sheet.health ?? {
    bashing: 0,
    lethal: 0,
    aggravated: 0,
  };

  const parsed = parseSwitch(swRaw);

  // View-only: no switch.
  if (!parsed) {
    const lines: string[] = [];
    lines.push(await divider("H E A L T H"));
    lines.push(
      renderHealthSummary(u.util.displayName(target, u.me), current, max),
    );
    u.send(lines.join("\n"));
    return;
  }

  if (parsed.error) {
    u.send(`Error: ${parsed.error}`);
    return;
  }
  if (parsed.amount <= 0) {
    u.send("Error: Amount must be a positive integer.");
    return;
  }

  // Cross-player edits require canEdit; self-edits are always allowed for
  // connected players.
  const sameTarget = target.id === u.me.id;
  if (!sameTarget && !(await u.canEdit(u.me, target))) {
    u.send("Permission denied. You cannot modify that player's Health track.");
    return;
  }

  let newTrack: HealthTrack;
  let verb: string;
  if (parsed.action === "apply") {
    newTrack = applyDamage(current, parsed.amount, parsed.type as DamageType, max);
    verb = "Applied";
  } else {
    newTrack = healDamage(current, parsed.amount, parsed.type);
    verb = "Healed";
  }

  // Persist the new track. Spread to preserve every other sheet field.
  const updated: CofdSheet = { ...sheetRaw, health: newTrack };
  await u.db.modify(target.id, "$set", { "data.cofd": updated });

  // Confirmation + re-rendered summary.
  const typeLabel = parsed.type === "any" ? "damage" : parsed.type;
  const targetLabel = sameTarget ? "you" : u.util.displayName(target, u.me);
  u.send(
    `${verb} ${parsed.amount} ${typeLabel} ${parsed.action === "apply" ? "to" : "from"} ${targetLabel}.`,
  );

  const lines: string[] = [];
  lines.push(await divider("H E A L T H"));
  lines.push(
    renderHealthSummary(u.util.displayName(target, u.me), newTrack, max),
  );
  u.send(lines.join("\n"));
}
