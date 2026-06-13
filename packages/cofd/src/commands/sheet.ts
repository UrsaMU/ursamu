// +sheet and +sheet/set command implementations.

import type { IDBObj, IUrsamuSDK } from "@ursamu/ursamu";
import {
  defaultSheet,
  setTrait,
  validateTraitValue,
  type CofdSheet,
} from "../stats/index.ts";
import { COFD_SKILLS } from "../dictionary/index.ts";
import { formatSheet } from "../sheet/index.ts";

const SPECIALTY_NAME_MAX = 40;
const SPECIALTY_DESC_MAX = 80;

/** Staff gate: admin / builder / wizard flag on the actor. */
function isStaff(actor: IDBObj): boolean {
  const f = actor.flags as Set<string> | undefined;
  if (!f) return false;
  return f.has?.("admin") || f.has?.("builder") || f.has?.("wizard");
}

export async function sheetExec(u: IUrsamuSDK) {
  const targetName = (u.cmd.args[0] ?? "").trim();
  const target = targetName ? await u.util.target(u.me, targetName) : u.me;

  if (!target) {
    u.send(`Player '${targetName}' not found.`);
    return;
  }

  const sheet = target.state?.cofd as CofdSheet | undefined;
  if (!sheet) {
    u.send("That player does not have an approved character sheet yet.");
    return;
  }

  const formatted = await formatSheet(u.util.displayName(target, u.me), target.id, sheet, undefined, u);
  u.send(formatted);
}

export async function sheetSetExec(u: IUrsamuSDK) {
  // Real call path from addCmd pattern: args[0]="set" (switch),
  // args[1]="[target/]trait=value" or "specialty/skill=name".
  // Tests that pre-split into [lhs, rhs] are also supported as a fallback.
  let lhs = "";
  let rhs = "";
  const a0 = (u.cmd.args[0] ?? "").trim();
  // stripSubs first: trait names/values and specialty text get persisted to
  // the sheet and later echoed via +sheet output. Without this, a player can
  // plant %c color codes (or staff-channel tokens) in their own labels.
  const a1 = u.util.stripSubs(u.cmd.args[1] ?? "").trim();

  if (a0.toLowerCase() === "set" || a0.toLowerCase() === "") {
    // Real path: parse args[1] as "<lhs>=<rhs>".
    const eqIdx = a1.indexOf("=");
    if (eqIdx >= 0) {
      lhs = a1.slice(0, eqIdx).trim();
      rhs = a1.slice(eqIdx + 1).trim();
    } else {
      lhs = a1;
      rhs = "";
    }
  } else {
    // Legacy test path: args already split.
    lhs = a0;
    rhs = a1;
  }

  if (!lhs) {
    u.send("Usage: +sheet/set [<player>/]<trait>=<value> (or specialty/<skill>=<name>)");
    return;
  }
  // Empty rhs is meaningful: it resets a trait to default and clears
  // all specialties on a skill. Downstream handlers interpret it.

  let targetName = "";
  let trait = lhs;

  if (lhs.includes("/")) {
    const parts = lhs.split("/");
    // Check if it's "specialty/skill"
    if (parts[0].toLowerCase() === "specialty" || parts[0].toLowerCase() === "specialties") {
      trait = lhs;
    } else {
      targetName = parts[0].trim();
      trait = parts.slice(1).join("/").trim();
    }
  }

  const target = targetName ? await u.util.target(u.me, targetName) : u.me;
  if (!target) {
    u.send(`Player '${targetName}' not found.`);
    return;
  }

  // Authorization check
  if (!(await u.canEdit(u.me, target))) {
    u.send("Permission denied. You cannot modify that player's character sheet.");
    return;
  }

  // Check if target has a live sheet
  const hasLiveSheet = !!target.state?.cofd;
  if (!hasLiveSheet) {
    u.send("That player does not have an approved character sheet yet. Sheet modifications are blocked until character generation is completed via '+cg'.");
    return;
  }

  // Specialty handler -- supports "<name>" or "<name>: <description>".
  if (trait.toLowerCase().startsWith("specialty/")) {
    const skillName = trait.slice("specialty/".length).trim().toLowerCase();
    if (!(COFD_SKILLS as readonly string[]).includes(skillName)) {
      u.send(`Invalid skill name for specialty: '${skillName}'.`);
      return;
    }

    const raw = rhs.trim();
    const sheet = (target.state?.cofd as CofdSheet) || defaultSheet();
    if (!sheet.specialties) {
      sheet.specialties = {};
    }
    if (!sheet.specialties[skillName]) {
      sheet.specialties[skillName] = [];
    }
    if (!sheet.specialtyDescriptions) {
      sheet.specialtyDescriptions = {};
    }
    if (!sheet.specialtyDescriptions[skillName]) {
      sheet.specialtyDescriptions[skillName] = {};
    }

    if (!raw) {
      // Empty value resets the skill's specialty list (matches the trait
      // reset convention: `+sheet/set athletics=` -> reset Athletics).
      sheet.specialties[skillName] = [];
      sheet.specialtyDescriptions[skillName] = {};
      u.send(`Cleared all specialties for skill '${skillName}' on ${target.name}'s sheet.`);
      await u.db.modify(target.id, "$set", { "data.cofd": sheet });
      return;
    }

    // Split on first ": " -- name on the left, description on the right.
    let specName = raw;
    let specDesc = "";
    const sepIdx = raw.indexOf(": ");
    if (sepIdx >= 0) {
      specName = raw.slice(0, sepIdx).trim();
      specDesc = raw.slice(sepIdx + 2).trim();
    }

    if (!specName) {
      u.send("Specialty name is required (use 'name' or 'name: description').");
      return;
    }
    if (specName.length > SPECIALTY_NAME_MAX) {
      u.send(
        `Specialty name too long (max ${SPECIALTY_NAME_MAX} characters; got ${specName.length}).`,
      );
      return;
    }
    if (specDesc.length > SPECIALTY_DESC_MAX) {
      u.send(
        `Specialty description too long (max ${SPECIALTY_DESC_MAX} characters; got ${specDesc.length}).`,
      );
      return;
    }

    const list = sheet.specialties[skillName];
    const descs = sheet.specialtyDescriptions[skillName];
    if (!list.includes(specName)) {
      list.push(specName);
    }
    if (sepIdx >= 0) {
      // Explicit description provided: set or replace (empty string clears).
      if (specDesc) descs[specName] = specDesc;
      else delete descs[specName];
    }
    // Pure rename (no separator) preserves any existing description as-is.

    const descPart = descs[specName] ? ` (${descs[specName]})` : "";
    u.send(
      `Added specialty '${specName}'${descPart} to skill '${skillName}' on ${target.name}'s sheet.`,
    );

    await u.db.modify(target.id, "$set", { "data.cofd": sheet });
    return;
  }

  // Size: admin/builder gate (CoFD core: Size is set during chargen by the
  // Build/Frame merit, otherwise fixed at 5 for humans). Outside chargen
  // only staff may edit it.
  if (trait.toLowerCase() === "size" && !isStaff(u.me)) {
    u.send("Permission denied. Size can only be changed by staff (admin or builder).");
    return;
  }

  // Standard trait handler
  try {
    const sheet = (target.state?.cofd as CofdSheet) || defaultSheet();
    const validatedValue = validateTraitValue(trait, rhs, sheet);
    const updatedSheet = setTrait(sheet, trait, validatedValue);

    await u.db.modify(target.id, "$set", { "data.cofd": updatedSheet });
    u.send(`Set trait '${trait}' to '${validatedValue}' on ${target.name}'s sheet.`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    u.send(`Error: ${msg}`);
  }
}

/**
 * Resolve the WP-regen target. Self is always allowed; cross-player requires
 * canEdit (builder+) per the project's standard cross-edit gate.
 */
async function resolveRegenTarget(
  u: IUrsamuSDK,
  arg: string,
): Promise<IDBObj | null> {
  const name = u.util.stripSubs(arg ?? "").trim();
  // Allow "name = reason" or "name: reason" shorthand -- caller pre-splits.
  if (!name) return u.me;
  const t = await u.util.target(u.me, name);
  if (!t) {
    u.send(`Player '${name}' not found.`);
    return null;
  }
  if (t.id !== u.me.id && !(await u.canEdit(u.me, t))) {
    u.send("Permission denied. You cannot modify that player's character sheet.");
    return null;
  }
  return t;
}

/** Splits a `<target> = <reason>` argument; reason may also use `:` separator. */
function splitTargetReason(raw: string): { who: string; reason: string } {
  const s = raw.trim();
  // Prefer "=" then ": " as separators so the WP commands can both name a
  // target and capture a justification in one argument.
  let idx = s.indexOf("=");
  if (idx < 0) idx = s.indexOf(": ");
  if (idx < 0) return { who: s, reason: "" };
  const sepLen = s[idx] === "=" ? 1 : 2;
  return {
    who: s.slice(0, idx).trim(),
    reason: s.slice(idx + sepLen).trim(),
  };
}

/**
 * +sheet/virtue [<player>] [= <reason>]
 * Restores full Willpower when the character acts in line with their Virtue
 * during a meaningful scene. Self use is allowed; cross-player requires
 * canEdit (builder+ / staff).
 */
export async function sheetVirtueExec(u: IUrsamuSDK) {
  const raw = u.util.stripSubs(u.cmd.args[1] ?? "").trim();
  const { who, reason } = splitTargetReason(raw);
  const target = await resolveRegenTarget(u, who);
  if (!target) return;

  const sheet = target.state?.cofd as CofdSheet | undefined;
  if (!sheet) {
    u.send("That player does not have an approved character sheet yet.");
    return;
  }
  const max = sheet.advantages.willpowerMax;
  if (sheet.advantages.willpowerCurrent >= max) {
    u.send(`${target.name} already has full Willpower (${max}/${max}).`);
    return;
  }
  const updated: CofdSheet = {
    ...sheet,
    advantages: { ...sheet.advantages, willpowerCurrent: max },
  };
  await u.db.modify(target.id, "$set", { "data.cofd": updated });
  const tail = reason ? ` -- ${reason}` : "";
  u.send(`Virtue triggered: ${target.name}'s Willpower restored to ${max}/${max}${tail}.`);
}

/**
 * +sheet/vice [<player>] [= <reason>]
 * Indulging the character's Vice restores 1 Willpower. The "with a cost"
 * portion of the rule (a Condition or scene complication) is narrative and
 * handled out-of-band; this command only moves the WP track.
 */
export async function sheetViceExec(u: IUrsamuSDK) {
  const raw = u.util.stripSubs(u.cmd.args[1] ?? "").trim();
  const { who, reason } = splitTargetReason(raw);
  const target = await resolveRegenTarget(u, who);
  if (!target) return;

  const sheet = target.state?.cofd as CofdSheet | undefined;
  if (!sheet) {
    u.send("That player does not have an approved character sheet yet.");
    return;
  }
  const max = sheet.advantages.willpowerMax;
  const cur = sheet.advantages.willpowerCurrent;
  if (cur >= max) {
    u.send(`${target.name} already has full Willpower (${max}/${max}).`);
    return;
  }
  const next = Math.min(cur + 1, max);
  const updated: CofdSheet = {
    ...sheet,
    advantages: { ...sheet.advantages, willpowerCurrent: next },
  };
  await u.db.modify(target.id, "$set", { "data.cofd": updated });
  const tail = reason ? ` -- ${reason}` : "";
  u.send(`Vice indulged: ${target.name}'s Willpower is now ${next}/${max}${tail}.`);
}

/**
 * +sheet/rest [<player>] [= <reason>]
 * A full night's rest restores all Willpower. Same permission gate as the
 * other regen switches.
 */
export async function sheetRestExec(u: IUrsamuSDK) {
  const raw = u.util.stripSubs(u.cmd.args[1] ?? "").trim();
  const { who, reason } = splitTargetReason(raw);
  const target = await resolveRegenTarget(u, who);
  if (!target) return;

  const sheet = target.state?.cofd as CofdSheet | undefined;
  if (!sheet) {
    u.send("That player does not have an approved character sheet yet.");
    return;
  }
  const max = sheet.advantages.willpowerMax;
  if (sheet.advantages.willpowerCurrent >= max) {
    u.send(`${target.name} already has full Willpower (${max}/${max}).`);
    return;
  }
  const updated: CofdSheet = {
    ...sheet,
    advantages: { ...sheet.advantages, willpowerCurrent: max },
  };
  await u.db.modify(target.id, "$set", { "data.cofd": updated });
  const tail = reason ? ` -- ${reason}` : "";
  u.send(`Full rest: ${target.name}'s Willpower restored to ${max}/${max}${tail}.`);
}
