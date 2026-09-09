// core/disciplineUse.ts -- List/find/activate disciplines and powers.

import type { IWoDChar, IDisciplineDef } from "./types.ts";
import { SplatRegistry } from "./registry.ts";
import type { IVtmSplatExt } from "./types.ts";
import { spendPool } from "./pools.ts";
import {
  kindredBlockMessage,
  isKindred,
  clearFrenzy,
  isFrenzied,
} from "./kindred.ts";
import { activateCelerity } from "./disciplineCombat.ts";
import {
  ACTIVE_POWERS,
  getPower,
  matchPower,
  pathDots,
  powersForDiscipline,
  powersKnown,
  discDots,
  type IPowerDef,
} from "../splats/vtm/data/powers.ts";
import { rollDice, type IDiceRoll } from "./dice.ts";
import { woundPenalty } from "./wounds.ts";
import { effectiveAttr } from "./attributes.ts";
import { applyDamage } from "./health.ts";
import { maybeEnterTorpor } from "./kindred.ts";
import { tremereDominatePenalty } from "./clanWeakness.ts";

const ATTRS = [
  "Strength", "Dexterity", "Stamina", "Charisma",
  "Manipulation", "Appearance", "Perception",
  "Intelligence", "Wits",
] as const;

export function listDisciplines(
  char: IWoDChar,
): Array<{ name: string; dots: number; def?: IDisciplineDef }> {
  const discs = char.disciplines ?? {};
  const ext = SplatRegistry.get("vtm")?.ext as IVtmSplatExt | undefined;
  const out: Array<{ name: string; dots: number; def?: IDisciplineDef }> = [];
  for (const [name, dots] of Object.entries(discs)) {
    if (typeof dots !== "number" || dots < 1) continue;
    const def = ext?.disciplines
      ? Object.values(ext.disciplines).find(
        (d) =>
          d.name.toLowerCase() === name.toLowerCase() ||
          d.id === name.toLowerCase(),
      )
      : undefined;
    out.push({ name: def?.name ?? name, dots, def });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export function findDiscipline(
  char: IWoDChar,
  raw: string,
): { name: string; dots: number; def?: IDisciplineDef } | null {
  const q = raw.toLowerCase().trim();
  if (!q) return null;
  for (const d of listDisciplines(char)) {
    if (
      d.name.toLowerCase() === q ||
      d.def?.id === q ||
      d.name.toLowerCase().startsWith(q)
    ) {
      return d;
    }
  }
  return null;
}

function attr(char: IWoDChar, name: string): number {
  return effectiveAttr(char, name);
}

/** Resolve "Charisma+Presence" or "Willpower" style pools. */
export function resolvePowerPool(
  char: IWoDChar,
  expr: string,
): { pool: number; label: string } {
  if (/^willpower$/i.test(expr.trim())) {
    const wp = Math.max(1, char.willpowerCurrent ?? char.willpower ?? 1);
    return { pool: wp, label: `Willpower(${wp})` };
  }
  const parts = expr.split("+").map((p) => p.trim());
  let pool = 0;
  const labels: string[] = [];
  for (const part of parts) {
    const aHit = ATTRS.find((a) => a.toLowerCase() === part.toLowerCase());
    if (aHit) {
      const v = attr(char, aHit);
      pool += v;
      labels.push(`${aHit}(${v})`);
      continue;
    }
    const d = discDots(char.disciplines, part);
    if (d > 0 || getPower(part) || findDiscipline(char, part)) {
      pool += d;
      labels.push(`${part}(${d})`);
      continue;
    }
    const abilKey = Object.keys(char.abilities ?? {}).find(
      (k) => k.toLowerCase() === part.toLowerCase(),
    );
    const ab = abilKey ? (char.abilities![abilKey] ?? 0) : 0;
    pool += ab;
    labels.push(`${part}(${ab})`);
  }
  pool = Math.max(1, pool - woundPenalty(char));
  return { pool, label: labels.join("+") };
}

function formatRoll(label: string, roll: IDiceRoll, diff: number): string {
  return (
    `${label} (${roll.pool}d vs ${diff}): ` +
    `[${roll.dice.join(" ")}] = ${roll.netSuccesses}` +
    `${roll.botch ? " BOTCH" : ""}`
  );
}

function willpowerPool(char: IWoDChar): number {
  return Math.max(1, char.willpowerCurrent ?? char.willpower ?? 1);
}

export interface IPowerUseResult {
  ok: boolean;
  message: string;
  power?: IPowerDef;
  bloodLeft?: number;
  rollLine?: string;
  resistLine?: string;
  pose?: string;
  name?: string;
  dots?: number;
  /** Target display handled by command when set. */
  needsTargetName?: string;
  opposedWon?: boolean;
  targetNotify?: string;
}

/**
 * Invoke a power. `raw` = "Command Alice" or "feral-claws" or "Celerity 2".
 * `target` optional pre-resolved defender for opposed powers.
 */
export function useDisciplinePower(
  char: IWoDChar,
  raw: string,
  opts: {
    bloodOverride?: number;
    target?: IWoDChar | null;
    targetName?: string;
    rng?: typeof rollDice;
  } = {},
): IPowerUseResult {
  const rng = opts.rng ?? rollDice;
  if (!isKindred(char)) {
    return { ok: false, message: "Only Kindred use Disciplines." };
  }
  const block = kindredBlockMessage(char, "invoke a Discipline");
  if (block) return { ok: false, message: block };

  const tokens = raw.trim().split(/\s+/);
  const head = tokens[0] ?? "";
  const maybeN = tokens[1] ? parseInt(tokens[1], 10) : NaN;

  if (/^celerity$/i.test(head)) {
    const n = Number.isFinite(maybeN) && maybeN > 0 ? maybeN : 1;
    const r = activateCelerity(char, n);
    if (!r.ok) return { ok: false, message: r.message };
    return {
      ok: true,
      message: r.message,
      bloodLeft: r.bloodLeft,
      pose: "moves in a blur of Celerity",
      power: getPower("celerity-burst"),
      name: "Celerity",
      dots: discDots(char.disciplines, "Celerity"),
    };
  }

  const matched = matchPower(raw.trim());
  if (!matched || matched.power.effect === "passive") {
    return fallbackDiscipline(char, raw, opts.bloodOverride);
  }
  const power = matched.power;
  const targetArg = matched.rest.trim();

  const dots = pathDots(char, power);
  if (dots < power.level) {
    const via = power.path ? ` (${power.path})` : "";
    return {
      ok: false,
      message:
        `${power.name} needs ${power.discipline} ${power.level}+${via} ` +
        `(you have ${dots}).`,
    };
  }

  if (power.needsTarget && !opts.target && !targetArg) {
    return {
      ok: false,
      message: `Usage: +discipline/use ${power.slug} <target>`,
      needsTargetName: targetArg || undefined,
    };
  }
  if (power.needsTarget && !opts.target && targetArg) {
    return {
      ok: false,
      message: `TARGET_NEEDED:${targetArg}`,
      needsTargetName: targetArg,
    };
  }

  const cost = opts.bloodOverride ?? power.bloodCost;
  if (cost > 0) {
    const spend = spendPool(char, "blood", cost);
    if (!spend.ok || spend.remaining === undefined) {
      return { ok: false, message: spend.message };
    }
    char.bloodPool = spend.remaining;
  }

  const bp = char.bloodPool ?? 0;
  const max = char.bloodMax ?? 0;
  const costNote = cost > 0
    ? ` (-${cost} Blood -> ${bp}/${max})`
    : "";
  const tName = opts.targetName ?? "the target";

  // -- Claws toggle -------------------------------------------------------
  if (power.effect === "claws") {
    const on = !char.feralWeapons;
    char.feralWeapons = on || undefined;
    return {
      ok: true,
      message: on
        ? `Feral Claws extend${costNote}. Brawl deals aggravated (+1).`
        : `Feral Claws retract${costNote}.`,
      power,
      bloodLeft: char.bloodPool,
      pose: on ? "extends black claws" : "retracts their claws",
      name: power.name,
      dots,
    };
  }

  // -- Toggle flags -------------------------------------------------------
  if (power.effect === "toggle" && power.toggleKey) {
    const key = power.toggleKey;
    const on = !char[key];
    // deno-lint-ignore no-explicit-any
    (char as any)[key] = on || undefined;
    return {
      ok: true,
      message: on
        ? `${power.name} active${costNote}. ${power.blurb}`
        : `${power.name} ends${costNote}.`,
      power,
      bloodLeft: char.bloodPool,
      pose: on
        ? `invokes ${power.name}`
        : `drops ${power.name}`,
      name: power.name,
      dots,
    };
  }

  // -- Shape (Protean / Obtenebration / etc.) -----------------------------
  if (power.effect === "shape" && power.shapeForm) {
    const form = power.shapeForm;
    const cur = char.proteanForm;
    if (cur === form) {
      char.proteanForm = undefined;
      if (power.flagKey && char.powerFlags) {
        const f = { ...char.powerFlags };
        delete f[power.flagKey];
        char.powerFlags = Object.keys(f).length ? f : undefined;
      }
      return {
        ok: true,
        message: `${power.name} ends${costNote}. You resume solid form.`,
        power,
        bloodLeft: char.bloodPool,
        pose: `leaves ${power.name}`,
        name: power.name,
        dots,
      };
    }
    char.proteanForm = form;
    if (power.flagKey) {
      char.powerFlags = {
        ...(char.powerFlags ?? {}),
        [power.flagKey]: power.flagValue ?? true,
      };
    }
    return {
      ok: true,
      message: `${power.name} -- form: ${form}${costNote}. ${power.blurb}`,
      power,
      bloodLeft: char.bloodPool,
      pose: `takes ${power.name}`,
      name: power.name,
      dots,
    };
  }

  // -- Flag ---------------------------------------------------------------
  if (power.effect === "flag" && power.flagKey) {
    char.powerFlags = {
      ...(char.powerFlags ?? {}),
      [power.flagKey]: power.flagValue ?? true,
    };
    return {
      ok: true,
      message: `You invoke %ch${power.name}%cn${costNote}. ${power.blurb}`,
      power,
      bloodLeft: char.bloodPool,
      pose: `invokes ${power.name}`,
      name: power.name,
      dots,
    };
  }

  // -- Shared opposed roll helper -----------------------------------------
  const runOpposed = (): {
    rollLine: string;
    resistLine?: string;
    won: boolean;
    atkFail: boolean;
  } | null => {
    const target = opts.target;
    if (!target || !power.pool) return null;
    const { pool, label } = resolvePowerPool(char, power.pool);
    const diff = power.difficulty ?? 6;
    const atk = rng(pool, diff);
    const rollLine = formatRoll(label, atk, diff);
    if (atk.botch || atk.netSuccesses <= 0) {
      return { rollLine, won: false, atkFail: true };
    }
    let resistLine: string | undefined;
    let won = true;
    if (power.resist === "willpower") {
      let wp = willpowerPool(target);
      if (/dominate/i.test(power.discipline)) {
        wp = Math.max(1, wp - tremereDominatePenalty(target, char));
      }
      const res = rng(wp, 6);
      resistLine = formatRoll(`WP resist`, res, 6);
      won = atk.netSuccesses > res.netSuccesses;
    }
    return { rollLine, resistLine, won, atkFail: false };
  };

  // -- Quell (end frenzy) -------------------------------------------------
  if (power.effect === "quell") {
    const opp = runOpposed();
    if (!opts.target) {
      return { ok: false, message: "No target for Quell the Beast." };
    }
    if (!opp) return { ok: false, message: "Opposed roll failed to init." };
    if (opp.atkFail || !opp.won) {
      return {
        ok: true,
        message: opp.atkFail
          ? `You invoke %ch${power.name}%cn${costNote} -- fails.`
          : `You invoke %ch${power.name}%cn on ${tName}${costNote}. They resist!`,
        power,
        bloodLeft: char.bloodPool,
        rollLine: opp.rollLine,
        resistLine: opp.resistLine,
        opposedWon: false,
        pose: `tries ${power.name} on ${tName}`,
        name: power.name,
        dots,
        targetNotify: `%cgYou resist ${power.name}.%cn`,
      };
    }
    let calmNote = "";
    if (isFrenzied(opts.target)) {
      Object.assign(opts.target, clearFrenzy(opts.target));
      calmNote = " Frenzy broken!";
    }
    return {
      ok: true,
      message:
        `You invoke %ch${power.name}%cn on ${tName}${costNote}.` +
        `${calmNote} ${power.blurb}`,
      power,
      bloodLeft: char.bloodPool,
      rollLine: opp.rollLine,
      resistLine: opp.resistLine,
      opposedWon: true,
      pose: `quells the Beast in ${tName}`,
      name: power.name,
      dots,
      targetNotify: `%cy${power.name}%cn calms your Beast.`,
    };
  }

  // -- Force blood --------------------------------------------------------
  if (power.effect === "force_blood") {
    const opp = runOpposed();
    if (!opts.target) {
      return { ok: false, message: "No target." };
    }
    if (!opp) {
      // No pool -- still try flat force if no resist needed
      return { ok: false, message: "Power needs a pool." };
    }
    if (opp.atkFail || !opp.won) {
      return {
        ok: true,
        message: `You invoke %ch${power.name}%cn${costNote} -- no effect.`,
        power,
        bloodLeft: char.bloodPool,
        rollLine: opp.rollLine,
        resistLine: opp.resistLine,
        opposedWon: false,
        name: power.name,
        dots,
        pose: `tries ${power.name} on ${tName}`,
        targetNotify: `%cgYou resist ${power.name}.%cn`,
      };
    }
    const n = power.forceBlood ?? 1;
    const tgt = opts.target;
    if (isKindred(tgt)) {
      const cur = tgt.bloodPool ?? 0;
      const take = Math.min(n, cur);
      tgt.bloodPool = cur - take;
      // Theft of Vitae: predator may gain the blood.
      if (/theft/i.test(power.slug)) {
        const max = char.bloodMax ?? 10;
        char.bloodPool = Math.min(max, (char.bloodPool ?? 0) + take);
      }
      return {
        ok: true,
        message:
          `You invoke %ch${power.name}%cn on ${tName}${costNote}. ` +
          `Forced ${take} Blood. ${power.blurb}`,
        power,
        bloodLeft: char.bloodPool,
        rollLine: opp.rollLine,
        resistLine: opp.resistLine,
        opposedWon: true,
        name: power.name,
        dots,
        pose: `wrenches vitae with ${power.name}`,
        targetNotify: `%cr${power.name}%cn forces ${take} Blood from you!`,
      };
    }
    return {
      ok: true,
      message:
        `You invoke %ch${power.name}%cn on ${tName}${costNote}. ` +
        `(Target has no Kindred blood pool.)`,
      power,
      bloodLeft: char.bloodPool,
      rollLine: opp.rollLine,
      resistLine: opp.resistLine,
      opposedWon: true,
      name: power.name,
      dots,
    };
  }

  // -- Damage -------------------------------------------------------------
  if (power.effect === "damage") {
    if (!opts.target && power.needsTarget) {
      return { ok: false, message: "No target for damage power." };
    }
    let rollLine: string | undefined;
    let resistLine: string | undefined;
    let won = true;
    if (power.pool && power.resist === "willpower" && opts.target) {
      const opp = runOpposed();
      if (opp) {
        rollLine = opp.rollLine;
        resistLine = opp.resistLine;
        won = !opp.atkFail && opp.won;
      }
    } else if (power.pool) {
      const { pool, label } = resolvePowerPool(char, power.pool);
      const diff = power.difficulty ?? 6;
      const roll = rng(pool, diff);
      rollLine = formatRoll(label, roll, diff);
      won = !roll.botch && roll.netSuccesses > 0;
    }
    if (!won) {
      return {
        ok: true,
        message: `You invoke %ch${power.name}%cn${costNote} -- misses.`,
        power,
        bloodLeft: char.bloodPool,
        rollLine,
        resistLine,
        opposedWon: false,
        name: power.name,
        dots,
        pose: `misses with ${power.name}`,
      };
    }
    let boxes = power.damageBoxes ?? 1;
    if (power.damageAttr && opts.target) {
      boxes += Math.max(0, effectiveAttr(char, power.damageAttr) - 1);
    }
    const dtype = power.damageType ?? "L";
    if (opts.target) {
      applyDamage(opts.target, dtype, boxes);
      if (isKindred(opts.target)) maybeEnterTorpor(opts.target);
    }
    return {
      ok: true,
      message:
        `You invoke %ch${power.name}%cn on ${tName}${costNote}. ` +
        `${boxes} ${dtype} damage. ${power.blurb}`,
      power,
      bloodLeft: char.bloodPool,
      rollLine,
      resistLine,
      opposedWon: true,
      name: power.name,
      dots,
      pose: `strikes with ${power.name}`,
      targetNotify: `%cr${power.name}%cn hits you for ${boxes} ${dtype}!`,
    };
  }

  // -- Opposed ------------------------------------------------------------
  if (power.effect === "opposed" && power.pool) {
    const opp = runOpposed();
    if (!opts.target || !opp) {
      return { ok: false, message: "No target for opposed power." };
    }
    if (opp.atkFail) {
      return {
        ok: true,
        message:
          `You invoke %ch${power.name}%cn${costNote} -- fails to take hold.`,
        power,
        bloodLeft: char.bloodPool,
        rollLine: opp.rollLine,
        pose: `tries ${power.name} on ${tName}`,
        name: power.name,
        dots,
        opposedWon: false,
        targetNotify:
          `${opts.targetName ?? "Someone"} tries ${power.name} on you -- fails.`,
      };
    }
    return {
      ok: true,
      message: opp.won
        ? `You invoke %ch${power.name}%cn on ${tName}${costNote}. ` +
          `They fail to resist. ${power.blurb}`
        : `You invoke %ch${power.name}%cn on ${tName}${costNote}. ` +
          `They resist!`,
      power,
      bloodLeft: char.bloodPool,
      rollLine: opp.rollLine,
      resistLine: opp.resistLine,
      pose: opp.won
        ? `forces ${power.name} on ${tName}`
        : `fails to bind ${tName} with ${power.name}`,
      name: power.name,
      dots,
      opposedWon: opp.won,
      targetNotify: opp.won
        ? `%cr${power.name}%cn takes hold on you!`
        : `%cgYou resist ${power.name}.%cn`,
    };
  }

  // -- Roll + pose / plain pose -------------------------------------------
  let rollLine: string | undefined;
  if (
    (power.effect === "roll_pose" || power.effect === "pose") &&
    power.pool
  ) {
    const { pool, label } = resolvePowerPool(char, power.pool);
    const diff = power.difficulty ?? 6;
    const roll = rng(pool, diff);
    rollLine = formatRoll(label, roll, diff);
  }
  if (power.flagKey) {
    char.powerFlags = {
      ...(char.powerFlags ?? {}),
      [power.flagKey]: power.flagValue ?? true,
    };
  }
  // Aura Perception: reveal diablerie stains.
  let extra = "";
  if (
    power.slug === "aura-perception" &&
    opts.target &&
    (opts.target.diablerieStains ?? 0) > 0
  ) {
    extra =
      ` Black veins in aura (diablerie x${opts.target.diablerieStains}).`;
  }

  return {
    ok: true,
    message:
      `You invoke %ch${power.name}%cn${costNote}. ${power.blurb}${extra}`,
    power,
    bloodLeft: char.bloodPool,
    rollLine,
    pose: targetArg || opts.targetName
      ? `invokes ${power.name} toward ${tName}`
      : `invokes ${power.name}`,
    name: power.name,
    dots,
  };
}

function fallbackDiscipline(
  char: IWoDChar,
  raw: string,
  bloodOverride?: number,
): IPowerUseResult {
  const hit = findDiscipline(char, raw);
  if (!hit) {
    return {
      ok: false,
      message:
        `Unknown power or Discipline "${raw}". ` +
        `Try +discipline/powers.`,
    };
  }
  if (/^(potence|fortitude)$/i.test(hit.name)) {
    return {
      ok: false,
      message:
        `${hit.name} is passive in combat (always on). ` +
        `Celerity: +discipline/use Celerity. ` +
        `Powers: +discipline/powers.`,
    };
  }
  const cost = bloodOverride ?? 1;
  const spend = spendPool(char, "blood", cost);
  if (!spend.ok || spend.remaining === undefined) {
    return { ok: false, message: spend.message };
  }
  char.bloodPool = spend.remaining;
  return {
    ok: true,
    message:
      `You invoke %ch${hit.name}%cn (${hit.dots}) ` +
      `(-${cost} Blood -> ${spend.remaining}/${char.bloodMax}).`,
    bloodLeft: spend.remaining,
    pose: `invokes ${hit.name}`,
    name: hit.name,
    dots: hit.dots,
  };
}

export function useDiscipline(
  char: IWoDChar,
  rawName: string,
  cost = 1,
): {
  ok: boolean;
  message: string;
  name?: string;
  dots?: number;
  bloodLeft?: number;
} {
  const r = useDisciplinePower(char, rawName, { bloodOverride: cost });
  return {
    ok: r.ok,
    message: r.message,
    name: r.name,
    dots: r.dots,
    bloodLeft: r.bloodLeft,
  };
}

export { powersKnown, powersForDiscipline, getPower, ACTIVE_POWERS, matchPower };
