// +aid command: First aid / Medicine roll.
//
// Pool: actor Dexterity + Medicine. Each success converts 1 lethal box to 1
// bashing box on the patient. If the patient has no lethal, successes remove
// bashing instead. Exceptional success (5+) also clears 1 bashing on top.
// Failure does nothing. Dramatic failure inflicts 1 lethal on the patient
// (botched field surgery).
//
// Once per scene per patient -- enforced via `aidedThisScene` boolean on the
// patient's sheet. Cleared by `+aid/reset <player>` (ST tool). Cross-actor
// aid requires canEdit; self-aid is always allowed.
//
// Sheets are read from `target.state.cofd` and written to `data.cofd`, the
// same convention used by +health / +condition / +vitae.

import type { IUrsamuSDK } from "@ursamu/ursamu";
import { executeRoll, type RollResult } from "../roller/index.ts";
import {
  refreshAdvantages,
  type CofdSheet,
  type HealthTrack,
} from "../stats/index.ts";
import { applyDamage, healthMax } from "../health/index.ts";

/** Tiny shape returned by resolveAid for pure testing without an SDK. */
export interface AidResolution {
  /** Updated health track after aid. */
  track: HealthTrack;
  /** Lethal boxes converted to bashing. */
  converted: number;
  /** Bashing boxes removed outright (no lethal left, or exceptional bonus). */
  bashingRemoved: number;
  /** Lethal boxes added by a dramatic failure. */
  lethalAdded: number;
  /** True when the roll was a dramatic failure. */
  dramaticFailure: boolean;
  /** True when 5+ successes triggered the exceptional bonus heal. */
  exceptional: boolean;
}

/**
 * Pure first-aid resolution. Splits cleanly from SDK plumbing for unit tests.
 *
 * @param track Patient's health track before aid.
 * @param max Patient's max health (stamina + size).
 * @param successes Successes rolled by the medic on Dex+Medicine.
 * @param exceptional True when successes >= 5.
 * @param dramaticFailure True when the medic rolled a chance-die 1.
 */
export function resolveAid(
  track: HealthTrack,
  max: number,
  successes: number,
  exceptional: boolean,
  dramaticFailure: boolean,
): AidResolution {
  const out: HealthTrack = {
    bashing: track.bashing,
    lethal: track.lethal,
    aggravated: track.aggravated,
  };

  // Dramatic failure: medic adds 1 lethal to the patient.
  if (dramaticFailure) {
    const next = applyDamage(out, 1, "lethal", max);
    return {
      track: next,
      converted: 0,
      bashingRemoved: 0,
      lethalAdded: 1,
      dramaticFailure: true,
      exceptional: false,
    };
  }

  let converted = 0;
  let bashingRemoved = 0;

  let remaining = Math.max(0, successes);
  // Each success: convert 1 lethal -> 1 bashing if any lethal; otherwise
  // remove 1 bashing.
  while (remaining > 0) {
    if (out.lethal > 0) {
      out.lethal -= 1;
      out.bashing += 1;
      converted += 1;
    } else if (out.bashing > 0) {
      out.bashing -= 1;
      bashingRemoved += 1;
    } else {
      break;
    }
    remaining -= 1;
  }

  // Exceptional bonus: also clear 1 bashing if any remains.
  if (exceptional && out.bashing > 0) {
    out.bashing -= 1;
    bashingRemoved += 1;
  }

  return {
    track: out,
    converted,
    bashingRemoved,
    lethalAdded: 0,
    dramaticFailure: false,
    exceptional,
  };
}

/** Parse the body of `+aid <target> [for <player>]` into {patientName}. */
export function parseAidArgs(rest: string): { patientName: string } {
  const trimmed = rest.trim();
  if (!trimmed) return { patientName: "" };
  // Support legacy "<patient>" or "<self> for <patient>" -- if " for " is
  // present we use the bit after it.
  const lower = trimmed.toLowerCase();
  const idx = lower.lastIndexOf(" for ");
  if (idx >= 0) {
    return { patientName: trimmed.slice(idx + 5).trim() };
  }
  return { patientName: trimmed };
}

export async function aidExec(u: IUrsamuSDK) {
  const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();
  const rest = u.util.stripSubs(u.cmd.args[1] ?? "").trim();

  // ---- /reset switch (ST helper) -------------------------------------
  if (sw === "reset") {
    const name = rest;
    const target = name
      ? await u.util.target(u.me, name, true)
      : u.me;
    if (!target) {
      u.send(`Player '${name}' not found.`);
      return;
    }
    const sheetRaw = target.state?.cofd as CofdSheet | undefined;
    if (!sheetRaw) {
      u.send("That player does not have an approved character sheet yet.");
      return;
    }
    const sameTarget = target.id === u.me.id;
    if (!sameTarget && !(await u.canEdit(u.me, target))) {
      u.send("Permission denied. You cannot reset that player's aid lock.");
      return;
    }
    const updated: CofdSheet = { ...sheetRaw, aidedThisScene: false } as
      CofdSheet & { aidedThisScene: boolean };
    await u.db.modify(target.id, "$set", { "data.cofd": updated });
    u.send(`Aid lock cleared on ${u.util.displayName(target, u.me)}.`);
    return;
  }

  if (sw && sw !== "") {
    u.send(`Unknown switch '/${sw}'. See help +aid.`);
    return;
  }

  // ---- Resolve patient ------------------------------------------------
  const { patientName } = parseAidArgs(rest);
  const target = patientName
    ? await u.util.target(u.me, patientName, true)
    : u.me;
  if (!target) {
    u.send(`Player '${patientName}' not found.`);
    return;
  }

  // ---- Medic sheet ----------------------------------------------------
  const medicRaw = u.me.state?.cofd as CofdSheet | undefined;
  if (!medicRaw) {
    u.send("You do not have an approved character sheet yet.");
    return;
  }
  const medicSheet = refreshAdvantages({ ...medicRaw });

  // ---- Patient sheet --------------------------------------------------
  const patientRaw = target.state?.cofd as CofdSheet | undefined;
  if (!patientRaw) {
    u.send("That player does not have an approved character sheet yet.");
    return;
  }
  const patientSheet = refreshAdvantages({ ...patientRaw });

  // ---- Permission gate (cross-actor) ----------------------------------
  const sameTarget = target.id === u.me.id;
  if (!sameTarget && !(await u.canEdit(u.me, target))) {
    u.send("Permission denied. You cannot apply aid to that player.");
    return;
  }

  // ---- Scene-cap ------------------------------------------------------
  const aided = (patientSheet as CofdSheet & { aidedThisScene?: boolean })
    .aidedThisScene === true;
  if (aided) {
    u.send(
      `${u.util.displayName(target, u.me)} has already received aid this scene.`,
    );
    return;
  }

  // ---- Patient must have something to heal ---------------------------
  const track: HealthTrack = patientSheet.health ?? {
    bashing: 0,
    lethal: 0,
    aggravated: 0,
  };
  if (track.bashing + track.lethal === 0) {
    u.send(
      `${u.util.displayName(target, u.me)} has no bashing or lethal damage to treat.`,
    );
    return;
  }

  // ---- Build pool and roll -------------------------------------------
  const dex = medicSheet.attributes?.dexterity ?? 1;
  const medicine = medicSheet.skills?.medicine ?? 0;
  // Untrained Mental penalty when Medicine = 0.
  const untrained = medicine === 0 ? -3 : 0;
  // Wound penalty applies to ALL rolls, not just combat (CoFD core p.130).
  const woundPenaltyDice = patientSelfPenalty(medicSheet);
  const pool = dex + medicine + untrained - woundPenaltyDice;
  const result: RollResult = executeRoll(Math.max(0, pool));

  const max = healthMax(patientSheet);
  const resolution = resolveAid(
    track,
    max,
    result.successes,
    result.exceptional,
    result.dramaticFailure,
  );

  // ---- Persist updated patient sheet ---------------------------------
  const updatedPatient: CofdSheet & { aidedThisScene?: boolean } = {
    ...patientRaw,
    health: resolution.track,
    aidedThisScene: true,
  };
  await u.db.modify(target.id, "$set", { "data.cofd": updatedPatient });

  // ---- Output --------------------------------------------------------
  const medicName = u.me.name ?? "Unknown";
  const patientName2 = target.name ?? "Unknown";
  const diceStr = result.rolls.join(" ");
  const poolDesc = untrained < 0
    ? `Dex(${dex})+Med(0,-3 untrained)`
    : `Dex(${dex})+Med(${medicine})`;
  const woundNote = woundPenaltyDice > 0 ? ` [-${woundPenaltyDice} wound]` : "";
  const finalPool = Math.max(0, pool);

  let outcome: string;
  if (result.dramaticFailure) {
    outcome = `%crDRAMATIC FAILURE%cn -- ${patientName2} takes 1 additional lethal.`;
  } else if (result.successes === 0) {
    outcome = "no successes -- no progress.";
  } else {
    const parts: string[] = [];
    if (resolution.converted > 0) {
      parts.push(`${resolution.converted} lethal -> bashing`);
    }
    if (resolution.bashingRemoved > 0) {
      parts.push(`${resolution.bashingRemoved} bashing cleared`);
    }
    if (result.exceptional) parts.push("exceptional");
    outcome = `${result.successes} success${result.successes === 1 ? "" : "es"}: ` +
      (parts.length > 0 ? parts.join(", ") : "no boxes to heal");
  }

  u.broadcast(
    `%cgAID>>%cn ${medicName} renders first aid to ${patientName2}: ${outcome}`,
  );
  u.send(
    `%cgROLL DETAIL:%cn ${poolDesc}=${finalPool}d${woundNote} (${diceStr})`,
  );

  if (!sameTarget) {
    u.send(`${medicName} treated your wounds.`, target.id);
  }
}

/**
 * Convenience: positive wound-penalty magnitude (0..3) for the medic's own
 * sheet -- the medic's own wounds penalise their Medicine roll. Pulled out
 * so we can call it without importing sheetWoundPenalty twice.
 */
function patientSelfPenalty(sheet: CofdSheet): number {
  const track = sheet.health ?? { bashing: 0, lethal: 0, aggravated: 0 };
  const stam = sheet.attributes?.stamina ?? 1;
  const size = sheet.advantages?.size ?? 5;
  const max = stam + size;
  if (max < 3) return 0;
  const filled = track.bashing + track.lethal + track.aggravated;
  if (filled >= max) return 3;
  if (filled >= max - 1) return 2;
  if (filled >= max - 2) return 1;
  return 0;
}
