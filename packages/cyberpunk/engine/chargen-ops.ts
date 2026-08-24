/**
 * Pure chargen mutations shared by HTTP and commands.
 */
import type {
  ChargenMethod,
  ChargenStage,
  ICPRCharacter,
  ICyberware,
  Role,
  StatKey,
} from "../db/schemas.ts";
import {
  buildNewCharacter,
  CHARGEN_POINTS,
  CHARGEN_STAT_MAX,
  CHARGEN_STAT_MIN,
  defaultSkills,
  recalcDerived,
} from "./character.ts";
import { LIFESTYLES } from "../data/lifestyles.ts";
import { WEAPONS } from "../data/weapons.ts";
import { ARMOR_CATALOG } from "../data/armor.ts";
import { ROLES } from "../data/roles.ts";
import { getSkill, BASIC_SKILLS } from "../data/skills.ts";
import {
  CAREER_SKILLS,
  d10,
  dN,
  LIFEPATH_FIELD_MAP,
  LIFEPATH_STAGES,
  METHODS,
  nextStage,
  prevStage,
  ROLE_WEAPON_SKILLS,
  STAGE_ORDER,
  STARTING_EB,
  STAT_KEYS,
} from "./chargen-constants.ts";
import {
  streetratSkills,
  streetratStatRow,
} from "../data/streetrat-templates.ts";
import {
  canInstallCyberware,
  catalogForChargen,
  chromeAvailability,
  effectiveHL,
  findInstalledCyber,
  pickFoundationId,
  syncSubdermalSp,
} from "./cyberware-install.ts";
import { getCyberware } from "../data/cyberware.ts";

/** CPR core: 86 skill points for Edgerunner & Complete Package. */
export const CHARGEN_SKILL_POINTS = 86;
/** Chargen cap before play (IP can go higher later). */
export const CHARGEN_SKILL_MAX = 6;
export const CHARGEN_SKILL_MIN = 2;

function skillMult(name: string): number {
  return getSkill(name)?.cost ?? 1;
}

function isBasicSkill(name: string): boolean {
  return BASIC_SKILLS.some((s) => s.name === name);
}

/** Points spent on skills (rank × cost mult). */
export function skillPointsSpent(
  skills: Record<string, number>,
  only?: readonly string[] | null,
): number {
  let spent = 0;
  for (const [name, rank] of Object.entries(skills)) {
    if (only && !only.includes(name)) continue;
    const r = Math.floor(Number(rank) || 0);
    if (r <= 0) continue;
    spent += r * skillMult(name);
  }
  return spent;
}

/**
 * Floor every Role-package skill at 2, keep other basics at 2,
 * recompute 86 − spent. Used on role pick and repair-on-load.
 */
export function seedRoleSkillsAtTwo(
  role: Role,
  method: ChargenMethod | null | undefined,
  existing?: Record<string, number>,
): {
  skills: Record<string, number>;
  pool: number;
} {
  const career = CAREER_SKILLS[role] ?? [];
  const skills: Record<string, number> = {
    ...defaultSkills(),
    ...(existing ?? {}),
  };

  if (method === "streetrat") {
    // Real templates — never floor-at-2 stub
    return {
      skills: applyStreetratSkills(role),
      pool: 0,
    };
  }

  if (method === "edgerunner") {
    // Role list starts at 2 (book min). Don't inherit stale 0s.
    for (const name of career) {
      const cur = Math.floor(Number(skills[name] ?? 0));
      skills[name] = cur >= CHARGEN_SKILL_MIN
        ? Math.min(cur, CHARGEN_SKILL_MAX)
        : CHARGEN_SKILL_MIN;
    }
    for (const name of Object.keys(skills)) {
      if (!career.includes(name) && !isBasicSkill(name)) {
        delete skills[name];
      }
    }
    const spent = skillPointsSpent(skills, career);
    return {
      skills,
      pool: Math.max(0, CHARGEN_SKILL_POINTS - spent),
    };
  }

  // complete — basics floor 2; other skills keep existing ranks
  for (const b of BASIC_SKILLS) {
    const cur = Math.floor(Number(skills[b.name] ?? 0));
    if (cur < CHARGEN_SKILL_MIN) skills[b.name] = CHARGEN_SKILL_MIN;
  }
  const spent = skillPointsSpent(skills, null);
  return {
    skills,
    pool: Math.max(0, CHARGEN_SKILL_POINTS - spent),
  };
}

/** @deprecated use seedRoleSkillsAtTwo */
function seedEdgerunnerSkills(role: Role): {
  skills: Record<string, number>;
  pool: number;
} {
  return seedRoleSkillsAtTwo(role, "edgerunner");
}

/** Complete: basics at 2 count against the 86 pool. */
function seedCompleteSkills(): {
  skills: Record<string, number>;
  pool: number;
} {
  return seedRoleSkillsAtTwo("solo", "complete");
}
import {
  mergeLifepath,
  resolveLifepathStage,
  rollEnemiesBundle,
  rollFriendsBundle,
  rollLifepathEntry,
} from "./chargen-lifepath.ts";

export type OpResult =
  | { ok: true; draft: ICPRCharacter; meta?: Record<string, unknown> }
  | { ok: false; error: string; status?: number };

/** Min printable chars for concept / background notes. */
export const CONCEPT_NOTES_MIN = 80;
export const CONCEPT_NOTES_MAX = 4000;

function fail(error: string, status = 400): OpResult {
  return { ok: false, error, status };
}

function ok(
  draft: ICPRCharacter,
  meta?: Record<string, unknown>,
): OpResult {
  return { ok: true, draft, meta };
}

/** True when play commands may run. */
export function isPlayReady(cpr: ICPRCharacter | null | undefined): boolean {
  if (!cpr) return false;
  if (cpr.chargenComplete) return true;
  return cpr.chargenStatus === "approved";
}

/** Block chargen edits when locked. */
export function chargenEditBlocked(
  cpr: ICPRCharacter,
): string | null {
  if (cpr.chargenComplete || cpr.chargenStatus === "approved") {
    return "Already complete";
  }
  if (cpr.chargenStatus === "pending") {
    return "Pending staff review — cannot edit until " +
      "approved or rejected";
  }
  return null;
}

function normalizeNotes(raw: string): string {
  return String(raw ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

export function applyMethod(
  cpr: ICPRCharacter,
  methodRaw: string,
): OpResult {
  const blocked = chargenEditBlocked(cpr);
  if (blocked) return fail(blocked, 409);
  const method = methodRaw.toLowerCase() as ChargenMethod;
  if (!METHODS.includes(method)) {
    return fail("Invalid method. Use streetrat, edgerunner, or complete");
  }
  let next: ICPRCharacter = {
    ...cpr,
    chargenMethod: method,
    chargenStatPool: method === "complete" ? CHARGEN_POINTS : 0,
    chargenSkillPool: CHARGEN_SKILL_POINTS,
    chargenStage: "role_select",
  };
  // Complete Package spends from all-2s base (matches +chargen init)
  if (method === "complete") {
    const stats = { ...next.stats };
    for (const k of STAT_KEYS) stats[k] = CHARGEN_STAT_MIN;
    stats.empBase = CHARGEN_STAT_MIN;
    next = recalcDerived({ ...next, stats });
  }
  return ok(next);
}

/**
 * Street Rat STATs — roll 1d10 (or designate 1–10) and copy the
 * Role template row. Cannot rearrange.
 * Starting EB = 500 (kit is free; pocket money only).
 */
export function applyStreetratStats(
  base: ICPRCharacter,
  role: Role,
  roll?: number,
): ICPRCharacter {
  const n = roll != null && roll >= 1 && roll <= 10
    ? Math.floor(roll)
    : d10();
  const row = streetratStatRow(role, n);
  const stats = {
    ...base.stats,
    ...row,
    empBase: row.emp,
  };
  return recalcDerived({
    ...base,
    stats,
    chargenStatPool: 0,
    eurodollars: STARTING_EB.streetrat,
  });
}

/** Street Rat skills — fixed Role template ranks (not all 2s). */
export function applyStreetratSkills(
  role: Role,
): Record<string, number> {
  return streetratSkills(role);
}

/** Map lifepath language name → skill slug at rank 4. */
export function culturalLanguageSkill(
  languageName: string,
): string | null {
  const raw = String(languageName ?? "").trim().toLowerCase();
  if (!raw) return null;
  const slug = "language_" +
    raw.replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  if (!slug || slug === "language_") return null;
  // Streetslang is already on the template — don't overwrite
  if (slug === "language_streetslang") return null;
  return slug;
}

/** Edgerunner: roll each STAT 2–8 (fast & dirty). Kit free + 500eb. */
function applyEdgerunnerStats(
  base: ICPRCharacter,
): ICPRCharacter {
  const stats = { ...base.stats };
  for (const k of STAT_KEYS) {
    // Bias toward competent street runners (3–8)
    const v = Math.min(8, Math.max(3, 2 + dN(6)));
    stats[k] = v;
  }
  stats.empBase = stats.emp;
  return recalcDerived({
    ...base,
    stats,
    chargenStatPool: 0,
    eurodollars: STARTING_EB.edgerunner,
  });
}

export function applyRole(
  cpr: ICPRCharacter,
  roleRaw: string,
  opts: { streetratRoll?: number } = {},
): OpResult {
  const _blk = chargenEditBlocked(cpr);
  if (_blk) return fail(_blk, 409);
  const role = roleRaw.toLowerCase() as Role;
  if (!ROLES.some((r) => r.name === role)) {
    return fail("Invalid role");
  }
  const base = buildNewCharacter(role);
  let next: ICPRCharacter = {
    ...base,
    ...cpr,
    role,
    roleRank: 4,
    chargenStage: "lifepath_cultural",
    chargenMethod: cpr.chargenMethod,
    chargenStatPool: cpr.chargenStatPool,
    chargenSkillPool: cpr.chargenSkillPool ?? CHARGEN_SKILL_POINTS,
    lifepath: cpr.lifepath ?? {},
  };
  if (cpr.chargenMethod === "streetrat") {
    next = applyStreetratStats(next, role, opts.streetratRoll);
    next = {
      ...next,
      skills: applyStreetratSkills(role),
      chargenSkillPool: 0,
    };
  } else if (cpr.chargenMethod === "edgerunner") {
    next = applyEdgerunnerStats(next);
    // Fresh floors at 2 — ignore prior draft ranks on role change
    const seeded = seedRoleSkillsAtTwo(role, "edgerunner");
    next = {
      ...next,
      skills: seeded.skills,
      chargenSkillPool: seeded.pool,
    };
  } else if (cpr.chargenMethod === "complete") {
    const seeded = seedRoleSkillsAtTwo(role, "complete");
    next = {
      ...next,
      chargenStatPool: cpr.chargenStatPool ?? CHARGEN_POINTS,
      // 2,550eb shop budget (fashion 800eb is separate later)
      eurodollars: STARTING_EB.complete,
      skills: seeded.skills,
      chargenSkillPool: seeded.pool,
    };
  } else {
    // Method not set yet — still floor Role package at 2
    const seeded = seedRoleSkillsAtTwo(role, "edgerunner");
    next = {
      ...next,
      skills: seeded.skills,
      chargenSkillPool: seeded.pool,
    };
  }
  return ok(next);
}

/**
 * If Role skills are missing / at 0 (old drafts), floor them at 2
 * and refresh the skill pool. No-op when already valid.
 */
export function ensureRoleSkillFloors(
  cpr: ICPRCharacter,
): ICPRCharacter {
  if (
    cpr.chargenComplete ||
    cpr.chargenStatus === "approved" ||
    cpr.chargenStatus === "pending"
  ) {
    return cpr;
  }
  const method = cpr.chargenMethod;
  if (!cpr.role) return cpr;
  const career = CAREER_SKILLS[cpr.role] ?? [];
  if (!career.length) return cpr;

  // Street Rat: apply full template if package missing / all-2 stub
  if (method === "streetrat") {
    const tpl = streetratSkills(cpr.role);
    let needsTpl = false;
    for (const name of career) {
      const r = Math.floor(Number(cpr.skills?.[name] ?? 0));
      if (r < CHARGEN_SKILL_MIN) {
        needsTpl = true;
        break;
      }
    }
    // Detect all-career-at-2 stub from prior builds
    if (!needsTpl) {
      let above = 0;
      let atTwo = 0;
      for (const name of career) {
        const r = Math.floor(Number(cpr.skills?.[name] ?? 0));
        const want = Math.floor(Number(tpl[name] ?? 2));
        if (want > 2 && r === 2) atTwo++;
        if (r > 2) above++;
      }
      if (atTwo >= 5 && above === 0) needsTpl = true;
    }
    if (needsTpl) {
      return {
        ...cpr,
        skills: applyStreetratSkills(cpr.role),
        chargenSkillPool: 0,
      };
    }
    if (cpr.chargenSkillPool !== 0) {
      return { ...cpr, chargenSkillPool: 0 };
    }
    return cpr;
  }

  const needs = method === "edgerunner" || method === "complete";
  if (!needs) return cpr;

  let dirty = false;
  if (method === "edgerunner") {
    for (const name of career) {
      const r = Math.floor(Number(cpr.skills?.[name] ?? 0));
      if (r < CHARGEN_SKILL_MIN) {
        dirty = true;
        break;
      }
    }
  } else {
    for (const b of BASIC_SKILLS) {
      const r = Math.floor(Number(cpr.skills?.[b.name] ?? 0));
      if (r < CHARGEN_SKILL_MIN) {
        dirty = true;
        break;
      }
    }
  }
  if (!dirty) {
    const billable = method === "edgerunner" ? career : null;
    const spent = skillPointsSpent(cpr.skills ?? {}, billable);
    const pool = Math.max(0, CHARGEN_SKILL_POINTS - spent);
    if (cpr.chargenSkillPool === pool) return cpr;
    return { ...cpr, chargenSkillPool: pool };
  }

  const seeded = seedRoleSkillsAtTwo(
    cpr.role,
    method,
    cpr.skills,
  );
  return {
    ...cpr,
    skills: seeded.skills,
    chargenSkillPool: seeded.pool,
  };
}

export function applyStat(
  cpr: ICPRCharacter,
  statRaw: string,
  value: number,
): OpResult {
  const _blk = chargenEditBlocked(cpr);
  if (_blk) return fail(_blk, 409);
  const stat = statRaw.toLowerCase() as StatKey;
  const n = Math.floor(Number(value));
  if (!STAT_KEYS.includes(stat) || n < CHARGEN_STAT_MIN ||
    n > CHARGEN_STAT_MAX) {
    return fail("Invalid stat (2–8)");
  }
  if (cpr.chargenMethod === "streetrat") {
    return fail("Streetrat stats are preset — cannot change");
  }
  if (cpr.chargenMethod === "complete") {
    const oldV = cpr.stats[stat] ?? CHARGEN_STAT_MIN;
    const delta = n - oldV;
    const pool = cpr.chargenStatPool ?? 0;
    if (pool - delta < 0) {
      return fail(`Not enough points (need ${delta}, have ${pool})`);
    }
    const stats = { ...cpr.stats, [stat]: n };
    if (stat === "emp") stats.empBase = n;
    return ok(recalcDerived({
      ...cpr,
      stats,
      chargenStatPool: pool - delta,
    }));
  }
  // edgerunner: allow tweak within 2–8
  const stats = { ...cpr.stats, [stat]: n };
  if (stat === "emp") stats.empBase = n;
  return ok(recalcDerived({ ...cpr, stats }));
}

export function applySkill(
  cpr: ICPRCharacter,
  skillRaw: string,
  value: number,
): OpResult {
  const _blk = chargenEditBlocked(cpr);
  if (_blk) return fail(_blk, 409);
  const method = cpr.chargenMethod;
  if (method === "streetrat") {
    return fail("Streetrat skills are preset — cannot change");
  }

  const skill = skillRaw.toLowerCase().trim().replace(/ /g, "_");
  const n = Math.floor(Number(value));
  if (!skill || n < 0 || n > 10) return fail("Invalid skill");

  const def = getSkill(skill);
  if (!def && method === "complete") {
    // Allow unknown slug only if already present
    if (cpr.skills[skill] == null) return fail("Unknown skill");
  }

  const career = CAREER_SKILLS[cpr.role] ?? [];
  if (method === "edgerunner") {
    if (!career.includes(skill)) {
      return fail(
        "Edgerunner may only raise Role skills (★ list)",
      );
    }
    // Allow any 0–6 while editing; UI marks out-of-range as
    // invalid until every Role skill sits in 2–6.
    if (n < 0 || n > CHARGEN_SKILL_MAX) {
      return fail(`Skill rank must be 0–${CHARGEN_SKILL_MAX}`);
    }
  } else {
    // complete package — same soft floor; basics flagged invalid <2
    if (n > CHARGEN_SKILL_MAX) {
      return fail(`Chargen max skill is ${CHARGEN_SKILL_MAX}`);
    }
    if (n < 0) return fail("Invalid skill rank");
  }

  // Always derive pool from 86 − spent (book total cost).
  // Avoids drift from optimistic UI / partial batches.
  const nextSkills = { ...cpr.skills, [skill]: n };
  const billable = method === "edgerunner" ? career : null;
  const spent = skillPointsSpent(nextSkills, billable);
  const pool = CHARGEN_SKILL_POINTS - spent;
  if (pool < 0) {
    const oldSpent = skillPointsSpent(cpr.skills, billable);
    return fail(
      `Not enough skill points (need ${
        spent - oldSpent
      }, have ${Math.max(0, CHARGEN_SKILL_POINTS - oldSpent)})`,
    );
  }

  return ok({
    ...cpr,
    skills: nextSkills,
    chargenSkillPool: pool,
  }, {
    skillValid: isSkillRankValid(method, skill, n),
    skillsValid: skillsMeetChargenRules(method, cpr.role, nextSkills),
    spent,
    pool,
  });
}

/**
 * Apply several skill ranks in one shot (web stepper debounce).
 * `ranks` is skill → absolute rank.
 */
export function applySkillsBatch(
  cpr: ICPRCharacter,
  ranks: Record<string, number>,
): OpResult {
  const _blk = chargenEditBlocked(cpr);
  if (_blk) return fail(_blk, 409);
  let cur = cpr;
  for (const [skill, value] of Object.entries(ranks)) {
    const res = applySkill(cur, skill, value);
    if (!res.ok) return res;
    cur = res.draft;
  }
  return ok(cur, {
    skillsValid: skillsMeetChargenRules(
      cur.chargenMethod,
      cur.role,
      cur.skills,
    ),
  });
}

/** Rank is in the final legal band (for UI “invalid until fixed”). */
export function isSkillRankValid(
  method: ChargenMethod | null | undefined,
  skill: string,
  rank: number,
): boolean {
  const r = Math.floor(Number(rank) || 0);
  if (r < 0 || r > CHARGEN_SKILL_MAX) return false;
  if (method === "edgerunner") {
    return r >= CHARGEN_SKILL_MIN && r <= CHARGEN_SKILL_MAX;
  }
  if (method === "complete") {
    if (isBasicSkill(skill)) return r >= CHARGEN_SKILL_MIN;
    return true;
  }
  return true;
}

/** Every Role/basic skill that must be in-range is in-range. */
export function skillsMeetChargenRules(
  method: ChargenMethod | null | undefined,
  role: Role,
  skills: Record<string, number>,
): boolean {
  if (method === "streetrat" || !method) return true;
  if (method === "edgerunner") {
    const career = CAREER_SKILLS[role] ?? [];
    for (const name of career) {
      const r = Math.floor(Number(skills[name] ?? 0));
      if (r < CHARGEN_SKILL_MIN || r > CHARGEN_SKILL_MAX) {
        return false;
      }
    }
    return true;
  }
  // complete — basics ≥ 2
  for (const b of BASIC_SKILLS) {
    const r = Math.floor(Number(skills[b.name] ?? 0));
    if (r < CHARGEN_SKILL_MIN) return false;
  }
  return true;
}

export function applyLifestyle(
  cpr: ICPRCharacter,
  tierRaw: string,
): OpResult {
  const _blk = chargenEditBlocked(cpr);
  if (_blk) return fail(_blk, 409);
  const tier = tierRaw.toLowerCase().trim().replace(/ /g, "_");
  const ls = LIFESTYLES.find((l) => l.name === tier);
  if (!ls) return fail("Invalid lifestyle");
  // Book: first month of starting housing/lifestyle is free.
  // Do NOT overwrite starting EB (500 kit-cash or 2550 shop budget).
  return ok({
    ...cpr,
    lifestyle: {
      tier,
      nextDueDate: Date.now() + 30 * 24 * 3600_000,
    },
    chargenStage: "cyberware",
  });
}

export function applyLifepathField(
  cpr: ICPRCharacter,
  fieldRaw: string,
  value: string,
): OpResult {
  const _blk = chargenEditBlocked(cpr);
  if (_blk) return fail(_blk, 409);
  const key = fieldRaw.toLowerCase().trim().replace(/ /g, "_");
  const mapped = LIFEPATH_FIELD_MAP[key];
  if (!mapped) {
    return fail(
      `Unknown lifepath field. Valid: ${
        Object.keys(LIFEPATH_FIELD_MAP).join(", ")
      }`,
    );
  }
  if (!String(value ?? "").trim()) return fail("Value required");
  return ok({
    ...cpr,
    lifepath: {
      ...cpr.lifepath,
      [mapped]: String(value).trim(),
    },
  });
}

export function applyStage(
  cpr: ICPRCharacter,
  stageRaw: string,
): OpResult {
  const _blk = chargenEditBlocked(cpr);
  if (_blk) return fail(_blk, 409);
  const st = stageRaw as ChargenStage;
  if (!STAGE_ORDER.includes(st)) return fail("Invalid stage");
  return ok({ ...cpr, chargenStage: st });
}

export function stepDraft(
  cpr: ICPRCharacter,
  dir: "next" | "back",
): OpResult {
  const _blk = chargenEditBlocked(cpr);
  if (_blk) return fail(_blk, 409);
  const cur = (cpr.chargenStage ?? "method") as ChargenStage;
  const stage = dir === "next" ? nextStage(cur) : prevStage(cur);
  return ok({ ...cpr, chargenStage: stage });
}

export function rollLifepath(
  cpr: ICPRCharacter,
  opts: {
    stage?: string;
    n?: number;
    reroll?: boolean;
  } = {},
): OpResult {
  const _blk = chargenEditBlocked(cpr);
  if (_blk) return fail(_blk, 409);
  const stage = resolveLifepathStage(
    opts.stage ?? "",
    cpr.chargenStage,
  );
  if (!stage || !LIFEPATH_STAGES.has(stage)) {
    return fail("Not a lifepath stage");
  }
  const role = cpr.role ?? "solo";

  if (stage === "lifepath_friends") {
    const b = rollFriendsBundle();
    return ok({
      ...cpr,
      lifepath: { ...cpr.lifepath, ...b.patch },
      chargenStage: stage,
    }, { roll: "bundle", count: b.count, friends: b.friends });
  }
  if (stage === "lifepath_enemies") {
    const b = rollEnemiesBundle();
    return ok({
      ...cpr,
      lifepath: { ...cpr.lifepath, ...b.patch },
    }, { roll: "bundle", count: b.count, enemies: b.enemies });
  }

  const maxRoll = stage === "lifepath_role" ? 6 : 10;
  const designated = opts.n != null ? Math.floor(Number(opts.n)) : 0;
  if (designated && (designated < 1 || designated > maxRoll)) {
    return fail(`Roll must be 1–${maxRoll}`);
  }
  const n = designated || (stage === "lifepath_role" ? dN(6) : d10());
  const crisis = stage === "lifepath_family" &&
    !!cpr.lifepath?.familyBackground;
  const result = rollLifepathEntry(stage, n, role, crisis);
  const lifepath = mergeLifepath(cpr.lifepath ?? {}, result.patch);
  let skills = cpr.skills ?? {};
  // Cultural origin grants Language (pick) at rank 4 — book p.86
  if (stage === "lifepath_cultural") {
    const langName = String(
      (result.patch as { language?: string }).language ?? "",
    );
    const slug = culturalLanguageSkill(langName);
    if (slug) {
      skills = {
        ...skills,
        [slug]: Math.max(Number(skills[slug] ?? 0), 4),
      };
    }
  }
  return ok({
    ...cpr,
    lifepath,
    skills,
    chargenStage: stage,
  }, {
    roll: result.roll,
    rolls: result.rolls,
    summary: result.summary,
    crisis,
  });
}

export function installChrome(
  cpr: ICPRCharacter,
  nameRaw: string,
): OpResult {
  const _blk = chargenEditBlocked(cpr);
  if (_blk) return fail(_blk, 409);
  if (cpr.chargenStage !== "cyberware") {
    return fail("Not at cyberware stage");
  }
  const check = canInstallCyberware(cpr, nameRaw);
  if (!check.ok) return fail(check.error);
  const { def, hl } = check;
  const itemName = def.name;
  const installed = [...(cpr.cyberware ?? [])];
  const id = `cg_${itemName}_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
  const piece: ICyberware = {
    id,
    name: itemName,
    category: def.category as ICyberware["category"],
    hl,
    installType: def.installType,
    installedAt: Date.now(),
    slots: def.optionSlots,
    slotCost: def.slotCost,
  };
  if (def.requiresFoundation) {
    piece.installedIn = pickFoundationId(cpr, def.requiresFoundation);
  }
  const withPiece = {
    ...cpr,
    cyberware: [...installed, piece],
    humanityLoss: (cpr.humanityLoss ?? 0) + hl,
  };
  const next = recalcDerived({
    ...withPiece,
    subdermalArmorSp: syncSubdermalSp(withPiece),
  });
  return ok(next, {
    installed: itemName,
    hl,
    needs: def.requiresFoundation ?? null,
  });
}

export function removeChrome(
  cpr: ICPRCharacter,
  nameRaw: string,
): OpResult {
  const _blk = chargenEditBlocked(cpr);
  if (_blk) return fail(_blk, 409);
  const installed = [...(cpr.cyberware ?? [])];
  const hit = findInstalledCyber(installed, nameRaw);

  // Orphan SP pool (piece missing but combat still using SP)
  if (!hit) {
    const slug = String(nameRaw ?? "")
      .toLowerCase()
      .trim()
      .replace(/[\s\-]+/g, "_");
    const isSub = slug === "subdermal_armor" ||
      slug === "skin_weave" ||
      slug.includes("subdermal");
    if (isSub && (cpr.subdermalArmorSp ?? 0) > 0) {
      return ok(recalcDerived({
        ...cpr,
        subdermalArmorSp: 0,
      }), {
        removed: slug || "subdermal",
        refundHL: 0,
        clearedOrphanSp: true,
      });
    }
    const have = installed.map((c) => c.name).slice(0, 12);
    return fail(
      have.length
        ? `Not installed (have: ${have.join(", ")})`
        : "Not installed",
    );
  }

  const target = hit.piece;
  const itemName = target.name;

  // Drop this piece + options mounted on its id
  const dropIds = new Set<string>([target.id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const p of installed) {
      if (
        p.installedIn && dropIds.has(p.installedIn) &&
        !dropIds.has(p.id)
      ) {
        dropIds.add(p.id);
        changed = true;
      }
    }
  }
  // If this was the last foundation of its type, strip orphan options
  const stillHaveFoundation = installed.some((c) =>
    c.name === itemName && !dropIds.has(c.id)
  );
  if (!stillHaveFoundation) {
    for (const p of installed) {
      const d = getCyberware(p.name);
      if (d?.requiresFoundation === itemName) dropIds.add(p.id);
    }
  }

  const nextList = installed.filter((c) => !dropIds.has(c.id));
  const refund = installed
    .filter((c) => dropIds.has(c.id))
    .reduce((s, c) => s + (c.hl ?? 0), 0);

  // Full refund; if no chrome left, zero residual HL so EMP recovers
  let newHL = Math.max(0, (cpr.humanityLoss ?? 0) - refund);
  if (nextList.length === 0) newHL = 0;

  const draft = {
    ...cpr,
    cyberware: nextList,
    humanityLoss: newHL,
  };
  return ok(recalcDerived({
    ...draft,
    subdermalArmorSp: syncSubdermalSp(draft),
  }), { removed: itemName, refundHL: refund });
}

export function addGear(
  cpr: ICPRCharacter,
  nameRaw: string,
): OpResult {
  const _blk = chargenEditBlocked(cpr);
  if (_blk) return fail(_blk, 409);
  if (cpr.chargenStage !== "equipment") {
    return fail("Not at equipment stage");
  }
  const itemName = nameRaw.toLowerCase().trim().replace(/ /g, "_");
  const wDef = WEAPONS.find((w) => w.name === itemName);
  const aDef = ARMOR_CATALOG.find((a) => a.name === itemName);
  if (!wDef && !aDef) return fail("Unknown item");
  const cost = wDef?.costEb ?? aDef!.costEb;
  const budget = cpr.eurodollars ?? 0;
  if (cost > budget) return fail("Not enough eddies");
  const roleData = { ...(cpr.roleData ?? {}) };
  const loadout = [
    ...((roleData.startingGear as string[] | undefined) ?? []),
  ];
  if (loadout.includes(itemName)) return fail("Already in loadout");
  loadout.push(itemName);
  roleData.startingGear = loadout;
  return ok({
    ...cpr,
    roleData,
    eurodollars: budget - cost,
  }, { added: itemName, cost });
}

export function removeGear(
  cpr: ICPRCharacter,
  nameRaw: string,
): OpResult {
  const _blk = chargenEditBlocked(cpr);
  if (_blk) return fail(_blk, 409);
  const itemName = nameRaw.toLowerCase().trim().replace(/ /g, "_");
  const roleData = { ...(cpr.roleData ?? {}) };
  const loadout = [
    ...((roleData.startingGear as string[] | undefined) ?? []),
  ];
  if (!loadout.includes(itemName)) return fail("Not in loadout");
  const wDef = WEAPONS.find((w) => w.name === itemName);
  const aDef = ARMOR_CATALOG.find((a) => a.name === itemName);
  const refund = wDef?.costEb ?? aDef?.costEb ?? 0;
  roleData.startingGear = loadout.filter((n) => n !== itemName);
  return ok({
    ...cpr,
    roleData,
    eurodollars: (cpr.eurodollars ?? 0) + refund,
  }, { removed: itemName, refund });
}

export function listChromeCatalog(cpr?: ICPRCharacter) {
  return catalogForChargen().map((c) => {
    const hl = effectiveHL(c);
    const avail = cpr
      ? chromeAvailability(cpr, c)
      : { canInstall: true, hl };
    return {
      name: c.name,
      category: c.category,
      hl,
      hlRoll: c.hlRoll ?? null,
      installType: c.installType,
      priceCategory: c.priceCategory,
      requiresFoundation: c.requiresFoundation ?? null,
      optionSlots: c.optionSlots ?? null,
      slotCost: c.slotCost ?? (c.requiresFoundation ? 1 : 0),
      paired: !!c.paired,
      allowMultiple: !!c.allowMultiple,
      canInstall: avail.canInstall,
      blockedReason: avail.canInstall ? null : (avail.reason ?? null),
      description: c.description,
    };
  });
}

/** Starting-kit browse ceiling — full street catalog is the market. */
const CHARGEN_GEAR_MAX_EB = 2000;

export function listGearCatalog(cpr: ICPRCharacter) {
  const budget = cpr.eurodollars ?? 0;
  const role = (cpr.role ?? "solo") as Role;
  const skills = ROLE_WEAPON_SKILLS[role] ?? ["handgun"];
  const loadout =
    ((cpr.roleData as Record<string, unknown>)?.startingGear as
      | string[]
      | undefined) ?? [];

  const costOf = (name: string): number => {
    const w = WEAPONS.find((x) => x.name === name);
    if (w) return w.costEb;
    const a = ARMOR_CATALOG.find((x) => x.name === name);
    return a?.costEb ?? 0;
  };
  const spent = loadout.reduce((s, n) => s + costOf(n), 0);

  const weapons = WEAPONS
    .filter((w) =>
      loadout.includes(w.name) || w.costEb <= CHARGEN_GEAR_MAX_EB
    )
    .map((w) => ({
      name: w.name,
      kind: "weapon" as const,
      weaponType: w.type,
      damage: w.damage,
      rof: w.rof,
      hands: w.hands,
      skill: w.skill,
      costEb: w.costEb,
      concealable: !!w.concealable,
      description: w.description,
      suggested: skills.includes(w.skill),
      owned: loadout.includes(w.name),
      affordable: w.costEb <= budget || loadout.includes(w.name),
    }))
    .sort((a, b) => {
      if (a.suggested !== b.suggested) return a.suggested ? -1 : 1;
      if (a.costEb !== b.costEb) return a.costEb - b.costEb;
      return a.name.localeCompare(b.name);
    });

  const armor = ARMOR_CATALOG
    .filter((a) =>
      loadout.includes(a.name) || a.costEb <= CHARGEN_GEAR_MAX_EB
    )
    .map((a) => ({
      name: a.name,
      kind: "armor" as const,
      sp: a.sp,
      penalty: a.penalty,
      locations: a.locations,
      costEb: a.costEb,
      concealable: !!a.concealable,
      description: a.description,
      suggested: a.costEb <= 100 && a.locations.includes("body"),
      owned: loadout.includes(a.name),
      affordable: a.costEb <= budget || loadout.includes(a.name),
    }))
    .sort((a, b) => {
      if (a.costEb !== b.costEb) return a.costEb - b.costEb;
      return a.name.localeCompare(b.name);
    });

  return {
    budget,
    spent,
    loadout,
    roleSkills: skills,
    weapons,
    armor,
  };
}

/** Save freeform concept / background notes (draft only). */
export function applyConceptNotes(
  cpr: ICPRCharacter,
  notesRaw: string,
): OpResult {
  const blocked = chargenEditBlocked(cpr);
  if (blocked) return fail(blocked, 409);
  const notes = normalizeNotes(notesRaw);
  if (notes.length > CONCEPT_NOTES_MAX) {
    return fail(
      `Notes too long (max ${CONCEPT_NOTES_MAX} characters)`,
    );
  }
  return ok({
    ...cpr,
    conceptNotes: notes,
    chargenStatus: cpr.chargenStatus === "rejected"
      ? "draft"
      : (cpr.chargenStatus ?? "draft"),
  }, { length: notes.length });
}

/**
 * Player submit for staff review. Does NOT unlock play.
 * Requires role + concept notes (≥ CONCEPT_NOTES_MIN).
 */
export function submitDraft(
  cpr: ICPRCharacter,
  notesRaw?: string,
): OpResult {
  if (cpr.chargenComplete || cpr.chargenStatus === "approved") {
    return ok(cpr, { already: true });
  }
  if (cpr.chargenStatus === "pending") {
    return fail("Already pending staff review", 409);
  }
  if (!cpr.role) return fail("Role required");
  if (!cpr.chargenMethod) return fail("Method required");

  let notes = normalizeNotes(
    notesRaw != null ? notesRaw : (cpr.conceptNotes ?? ""),
  );
  if (notes.length < CONCEPT_NOTES_MIN) {
    return fail(
      `Concept notes required (at least ${CONCEPT_NOTES_MIN} ` +
        `characters — who is this edgerunner?)`,
    );
  }
  if (notes.length > CONCEPT_NOTES_MAX) {
    return fail(
      `Notes too long (max ${CONCEPT_NOTES_MAX} characters)`,
    );
  }

  return ok({
    ...cpr,
    conceptNotes: notes,
    chargenStatus: "pending",
    chargenStage: "review",
    chargenComplete: false,
    chargenRejectReason: "",
    eurodollars: Math.max(0, Math.floor(Number(cpr.eurodollars) || 0)),
  }, { pending: true });
}

/** Staff approve — unlocks play (chargenComplete). */
export function approveDraft(cpr: ICPRCharacter): OpResult {
  if (cpr.chargenComplete || cpr.chargenStatus === "approved") {
    return ok(cpr, { already: true });
  }
  if (!cpr.role) return fail("Role required");
  const notes = normalizeNotes(cpr.conceptNotes ?? "");
  if (notes.length < CONCEPT_NOTES_MIN) {
    return fail(
      "Cannot approve — concept notes missing or too short",
    );
  }
  return ok({
    ...cpr,
    conceptNotes: notes,
    chargenStatus: "approved",
    chargenComplete: true,
    chargenStage: "complete",
    chargenRejectReason: "",
    eurodollars: Math.max(0, Math.floor(Number(cpr.eurodollars) || 0)),
  }, { approved: true });
}

/** Staff reject — back to draft for edits. */
export function rejectDraft(
  cpr: ICPRCharacter,
  reasonRaw = "",
): OpResult {
  if (cpr.chargenComplete || cpr.chargenStatus === "approved") {
    return fail("Already approved — use admin reset to reopen", 409);
  }
  const reason = normalizeNotes(reasonRaw).slice(0, 500);
  return ok({
    ...cpr,
    chargenStatus: "rejected",
    chargenComplete: false,
    chargenStage: "review",
    chargenRejectReason: reason,
  }, { rejected: true, reason });
}

/**
 * @deprecated Use submitDraft (pending) + approveDraft.
 * Kept as alias so older callers still compile — maps to submit.
 */
export function finalizeDraft(
  cpr: ICPRCharacter,
  notesRaw?: string,
): OpResult {
  return submitDraft(cpr, notesRaw);
}

// silence unused d10 if tree-shaken — used by edgerunner path via dN
void d10;
