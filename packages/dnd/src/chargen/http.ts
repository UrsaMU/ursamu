/**
 * Chargen + sheet HTTP helpers for /api/v1/dnd/*.
 */
import { dbojs } from "@ursamu/ursamu";
import {
  DND_ABILITIES,
  DND_SKILLS,
  SKILL_ABILITY_MAP,
  getAbilityMod,
  getProficiencyBonus,
  migrateSheet,
  type DndSheet,
} from "../stats/dnd_sheet.ts";
import {
  BACKGROUND_METADATA,
  CLASS_METADATA,
  ORIGIN_FEATS,
  SPECIES,
  SKILL_ENTRIES,
  spellBySlug,
  spellsByLevel,
} from "../data/catalog.ts";
import {
  initCgState,
  readCg,
  hasLiveSheet,
  isApprovedFlag,
  type DndCgState,
} from "./state.ts";
import { buildSheetFromCg } from "./build_sheet.ts";
import { submitCgDraft } from "./submit.ts";
import { approvePlayer } from "./approve_core.ts";
import { validateAbilityScores } from "./validate.ts";

const STAFF = new Set([
  "superuser",
  "admin",
  "wizard",
  "builder",
  "staff",
]);

type Actor = {
  id: string;
  name?: string;
  flags?: unknown;
  state?: Record<string, unknown>;
  data?: Record<string, unknown>;
};

function flagsOf(raw: unknown): Set<string> {
  if (raw instanceof Set) return raw as Set<string>;
  if (Array.isArray(raw)) return new Set(raw.map(String));
  return new Set(
    String(raw ?? "").split(/[,\s]+/).filter(Boolean),
  );
}

function isStaff(flags: Set<string>): boolean {
  for (const f of flags) {
    if (STAFF.has(f.toLowerCase())) return true;
  }
  return false;
}

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

async function loadActor(userId: string): Promise<Actor | null> {
  const bare = String(userId ?? "").replace(/^#/, "").trim();
  if (!bare) return null;
  let row = await dbojs.queryOne({ id: bare });
  if (!row) row = await dbojs.queryOne({ id: `#${bare}` });
  if (!row) return null;
  return row as unknown as Actor;
}

async function saveCg(
  userId: string,
  cg: DndCgState,
): Promise<void> {
  await dbojs.modify({ id: userId }, "$set", {
    "data.dnd_cg": cg,
  });
}

function liveSheetOf(actor: Actor): DndSheet | null {
  const d = actor.data?.dnd;
  if (d && typeof d === "object") return migrateSheet(d);
  const s = actor.state?.dnd;
  if (s && typeof s === "object") return migrateSheet(s);
  return null;
}

function actorName(actor: Actor): string {
  return String(
    actor.name ||
      actor.data?.name ||
      actor.state?.name ||
      "Character",
  );
}

function isCaster(cg: DndCgState): boolean {
  return !!CLASS_METADATA[cg.class.toLowerCase()]?.spellcasting;
}

function maxStageFor(cg: DndCgState): number {
  return isCaster(cg) ? 8 : 7;
}

function stageName(stage: number, caster: boolean): string {
  const gear = caster ? 7 : 6;
  const review = caster ? 8 : 7;
  const names: Record<number, string> = {
    1: "Class",
    2: "Origin",
    3: "Abilities",
    4: "Skills",
    5: "Feats",
    6: caster ? "Spells" : "Gear",
    [gear]: "Gear",
    [review]: "Review",
  };
  if (caster && stage === 6) return "Spells";
  return names[stage] ?? `Stage ${stage}`;
}

function stageLabels(max: number, caster: boolean) {
  const out = [];
  for (let s = 1; s <= max; s++) {
    out.push({
      stage: s,
      name: stageName(s, caster),
      short: stageName(s, caster),
    });
  }
  return out;
}

function validateStage(
  cg: DndCgState,
): { valid: boolean; error?: string } {
  const st = cg.stage;
  if (st === 1 && !cg.class) {
    return { valid: false, error: "Choose a class." };
  }
  if (st === 2 && (!cg.species || !cg.background)) {
    return {
      valid: false,
      error: "Choose species and background.",
    };
  }
  if (st === 3) {
    return validateAbilityScores(cg.abilities);
  }
  if (st === 4) {
    const need = CLASS_METADATA[cg.class.toLowerCase()]
      ?.skillCount ?? 0;
    if (cg.chosenSkills.length < need) {
      return {
        valid: false,
        error: `Choose ${need} class skills.`,
      };
    }
  }
  if (st === 5) {
    const max = cg.species.toLowerCase() === "human" ? 2 : 1;
    if (cg.chosenFeats.length < max) {
      return {
        valid: false,
        error: `Choose ${max} origin feat(s).`,
      };
    }
  }
  return { valid: true };
}

function publicState(cg: DndCgState) {
  const caster = isCaster(cg);
  const max = maxStageFor(cg);
  const val = validateStage(cg);
  const pending = cg.pendingSheet ?? null;
  return {
    started: true,
    stage: cg.stage,
    maxStage: max,
    stageName: stageName(cg.stage, caster),
    stages: stageLabels(max, caster),
    draft: cg,
    sheet: pending,
    isSubmitted: !!cg.isSubmitted,
    isApproved: false,
    submittedJob: cg.submittedJob ?? null,
    canAdvance: val.valid,
    validationError: val.valid ? null : (val.error ?? "Invalid"),
    system: "dnd",
  };
}

function stripMush(s: string): string {
  return String(s ?? "")
    .replace(/%r/gi, "\n")
    .replace(/%t/gi, "\t")
    .replace(/%b/gi, " ")
    .replace(/%c[a-zA-Z]/gi, "")
    .replace(/<#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})>/g, "")
    .replace(/%[nN]/g, "")
    // deno-lint-ignore no-control-regex
    .replace(/\u001b\[[0-9;]*m/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function sheetText(name: string, sheet: DndSheet): string {
  const s = migrateSheet(sheet);
  const prof = getProficiencyBonus(s.level);
  const mod = (ab: (typeof DND_ABILITIES)[number]) => {
    const m = getAbilityMod(s.abilities[ab] ?? 10);
    return m >= 0 ? `+${m}` : `${m}`;
  };
  const abs = DND_ABILITIES.map((a) => {
    const v = s.abilities[a] ?? 10;
    return `${a.slice(0, 3).toUpperCase()} ${v} (${mod(a)})`;
  }).join("  ");
  const saves = (s.savingThrowProficiency ?? [])
    .map((a) => a.slice(0, 3).toUpperCase())
    .join(", ") || "—";
  const skills = DND_SKILLS
    .filter((sk) => s.skillProficiency[sk] !== "none")
    .map((sk) => {
      const ab = SKILL_ABILITY_MAP[sk];
      const m = getAbilityMod(s.abilities[ab] ?? 10);
      const mult = s.skillProficiency[sk] === "expert" ? 2 : 1;
      const t = m + prof * mult;
      const sign = t >= 0 ? `+${t}` : `${t}`;
      return `${sk.replace(/_/g, " ")} ${sign}`;
    })
    .join(", ") || "—";
  const slots = Object.keys(s.spellSlotsMax ?? {})
    .map(Number)
    .filter((n) => (s.spellSlotsMax[n] ?? 0) > 0)
    .sort((a, b) => a - b)
    .map((n) =>
      `L${n} ${s.spellSlotsCurrent[n] ?? 0}/` +
        `${s.spellSlotsMax[n]}`
    )
    .join("  ");
  return stripMush([
    name,
    `${s.class}${s.subclass ? ` (${s.subclass})` : ""} ` +
      `Lv ${s.level} · ${s.species} · ${s.background}`,
    `HP ${s.hp.current}/${s.hp.max}` +
      (s.hp.temp ? ` (+${s.hp.temp} temp)` : "") +
      `  AC ${s.ac}  Speed ${s.speed} ft  Prof +${prof}`,
    `Init ${mod("dexterity")}  HD ${s.hitDice.current}/` +
      `${s.hitDice.max}  XP ${s.xp}  Gold ${s.gold} gp`,
    abs,
    `Saves: ${saves}`,
    `Skills: ${skills}`,
    `Feats: ${s.feats.join(", ") || "—"}`,
    s.spells.length
      ? `Spells: ${
        s.spells.map((x) => x.replace(/_/g, " ")).join(", ")
      }`
      : "",
    slots ? `Slots: ${slots}` : "",
    s.equipment?.length
      ? `Gear: ${s.equipment.join(", ")}`
      : "",
  ].filter(Boolean).join("\n"));
}

/** GET /api/v1/dnd/meta — discovery for site FE. */
export function meta(): Response {
  return json({
    ok: true,
    system: "dnd",
    name: "D&D 5e/2024",
    chargenApi: "/api/v1/dnd/chargen",
    sheetApi: "/api/v1/dnd/sheet",
  });
}

/** GET /api/v1/dnd/chargen/options?topic=[&class=] */
export function chargenOptions(
  topic: string,
  query: Record<string, string> = {},
): Response {
  const t = topic.toLowerCase().trim();
  if (t === "classes" || t === "class") {
    return json({
      ok: true,
      topic: "classes",
      items: Object.entries(CLASS_METADATA).map(([slug, c]) => ({
        slug,
        name: c.name ?? slug,
        hitDie: c.hitDie,
        skillCount: c.skillCount,
        skillOptions: c.skillOptions ?? [],
        spellcasting: !!c.spellcasting,
        startingGold: c.startingGold,
      })),
    });
  }
  if (t === "backgrounds" || t === "background") {
    return json({
      ok: true,
      topic: "backgrounds",
      items: Object.entries(BACKGROUND_METADATA).map(
        ([slug, b]) => ({
          slug,
          name: b.name ?? slug,
          skills: b.skills,
          feat: b.feat,
          fixedIncreases: b.fixedIncreases ?? {},
        }),
      ),
    });
  }
  if (t === "species" || t === "specieses") {
    return json({
      ok: true,
      topic: "species",
      items: SPECIES.map((s) => ({
        slug: s.slug,
        name: s.name,
      })),
    });
  }
  if (t === "feats" || t === "feat") {
    return json({
      ok: true,
      topic: "feats",
      items: ORIGIN_FEATS.map((slug) => ({
        slug,
        name: slug.split("_").map((w) =>
          w.charAt(0).toUpperCase() + w.slice(1)
        ).join(" "),
      })),
    });
  }
  if (t === "skills" || t === "skill") {
    const clsSlug = String(query.class || "").toLowerCase();
    const cls = clsSlug ? CLASS_METADATA[clsSlug] : null;
    if (cls?.skillOptions?.length) {
      const bySlug = Object.fromEntries(
        SKILL_ENTRIES.map((s) => [s.slug, s]),
      );
      return json({
        ok: true,
        topic: "skills",
        class: clsSlug,
        skillCount: cls.skillCount,
        items: cls.skillOptions.map((slug) => ({
          slug,
          name: bySlug[slug]?.name ??
            slug.split("_").map((w) =>
              w.charAt(0).toUpperCase() + w.slice(1)
            ).join(" "),
        })),
      });
    }
    return json({
      ok: true,
      topic: "skills",
      items: SKILL_ENTRIES.map((s) => ({
        slug: s.slug,
        name: s.name,
      })),
    });
  }
  if (t === "spells" || t === "spell") {
    const clsSlug = String(query.class || "").toLowerCase();
    const cls = clsSlug ? CLASS_METADATA[clsSlug] : null;
    const opts = cls?.spellcasting?.spellOptions ?? [];
    if (opts.length) {
      return json({
        ok: true,
        topic: "spells",
        class: clsSlug,
        items: opts.map((slug) => {
          const sp = spellBySlug(slug);
          return {
            slug,
            name: sp?.name ?? slug,
            level: sp?.level ?? 0,
            school: sp?.school ?? "",
          };
        }),
      });
    }
    // Fallback: cantrips + L1 for FE browsing
    const items = [
      ...spellsByLevel(0),
      ...spellsByLevel(1),
    ].map((sp) => ({
      slug: sp.slug,
      name: sp.name,
      level: sp.level,
      school: sp.school,
    }));
    return json({ ok: true, topic: "spells", items });
  }
  return json({
    ok: true,
    topics: [
      "classes",
      "backgrounds",
      "species",
      "feats",
      "skills",
      "spells",
    ],
  });
}

/** GET /api/v1/dnd/chargen */
export async function getChargen(
  userId: string,
): Promise<Response> {
  const actor = await loadActor(userId);
  if (!actor) return json({ error: "Forbidden" }, 403);

  const live = liveSheetOf(actor);
  const approved = isApprovedFlag(actor) ||
    (live != null && !readCg(actor)?.isSubmitted);
  const cg = readCg(actor);
  const staff = isStaff(flagsOf(actor.flags));

  if (live && (isApprovedFlag(actor) || !cg)) {
    const name = actorName(actor);
    return json({
      ok: true,
      approved: true,
      isApproved: true,
      closed: true,
      started: true,
      system: "dnd",
      sheet: live,
      sheetText: sheetText(name, live),
      name,
      isStaff: staff,
      canWipe: staff,
    });
  }

  if (!cg) {
    return json({
      ok: true,
      started: false,
      system: "dnd",
      isStaff: staff,
      canWipe: false,
      stages: stageLabels(7, false),
    });
  }

  return json({
    ok: true,
    isStaff: staff,
    canWipe: staff,
    ...publicState(cg),
  });
}

/** POST /api/v1/dnd/chargen/start */
export async function startChargen(
  userId: string,
  body: { reset?: boolean },
): Promise<Response> {
  const actor = await loadActor(userId);
  if (!actor) return json({ error: "Forbidden" }, 403);

  if (
    hasLiveSheet(actor) && isApprovedFlag(actor) && !body.reset
  ) {
    return json({
      error: "Already approved. Staff must +unapprove first.",
    }, 409);
  }

  const cg = initCgState();
  await saveCg(userId, cg);
  return json({ ok: true, ...publicState(cg) });
}

/** POST /api/v1/dnd/chargen/set */
export async function setChargenTrait(
  userId: string,
  body: { trait?: string; value?: string },
): Promise<Response> {
  const actor = await loadActor(userId);
  if (!actor) return json({ error: "Forbidden" }, 403);
  let cg = readCg(actor);
  if (!cg) return json({ error: "Start chargen first." }, 400);
  if (cg.isSubmitted) {
    return json({
      error: "Draft submitted — wait for staff or +deny.",
    }, 409);
  }

  const trait = String(body.trait ?? "").toLowerCase().trim();
  const value = String(body.value ?? "").trim();
  if (!trait) return json({ error: "trait required" }, 400);

  // Mirror +cg/set essentials
  if (trait === "class") {
    if (!CLASS_METADATA[value.toLowerCase()]) {
      return json({ error: `Unknown class: ${value}` }, 400);
    }
    cg = { ...cg, class: value };
  } else if (trait === "species") {
    cg = { ...cg, species: value };
  } else if (trait === "background") {
    const bg = BACKGROUND_METADATA[value.toLowerCase()];
    if (!bg) {
      return json({ error: `Unknown background: ${value}` }, 400);
    }
    cg = {
      ...cg,
      background: value,
      abilityIncreases: { ...bg.fixedIncreases },
    };
  } else if (DND_ABILITIES.includes(trait as never)) {
    const n = parseInt(value, 10);
    if (isNaN(n)) return json({ error: "bad score" }, 400);
    cg = {
      ...cg,
      abilities: { ...cg.abilities, [trait]: n },
    };
  } else if (trait === "skill") {
    const sk = value.toLowerCase().replace(/\s+/g, "_");
    const set = new Set(cg.chosenSkills);
    if (set.has(sk as never)) set.delete(sk as never);
    else set.add(sk as never);
    cg = { ...cg, chosenSkills: [...set] as never };
  } else if (trait === "feat") {
    const f = value.toLowerCase().replace(/\s+/g, "_")
      .replace(/[()]/g, "");
    const set = new Set(cg.chosenFeats);
    if (set.has(f)) set.delete(f);
    else set.add(f);
    cg = { ...cg, chosenFeats: [...set] };
  } else if (trait === "spell") {
    const sp = value.toLowerCase().replace(/\s+/g, "_");
    const set = new Set(cg.chosenSpells);
    if (set.has(sp)) set.delete(sp);
    else set.add(sp);
    cg = { ...cg, chosenSpells: [...set] };
  } else if (trait === "gear" || trait === "startinggear") {
    const g = value.toLowerCase() === "gold" ? "gold" : "equipment";
    cg = { ...cg, startingGear: g };
  } else {
    return json({ error: `Unknown trait: ${trait}` }, 400);
  }

  await saveCg(userId, cg);
  return json({ ok: true, ...publicState(cg) });
}

/** POST /api/v1/dnd/chargen/next | /back */
export async function stepChargen(
  userId: string,
  dir: "next" | "back",
): Promise<Response> {
  const actor = await loadActor(userId);
  if (!actor) return json({ error: "Forbidden" }, 403);
  let cg = readCg(actor);
  if (!cg) return json({ error: "Start chargen first." }, 400);
  if (cg.isSubmitted) {
    return json({ error: "Draft already submitted." }, 409);
  }

  if (dir === "back") {
    if (cg.stage > 1) cg = { ...cg, stage: cg.stage - 1 };
  } else {
    const val = validateStage(cg);
    if (!val.valid) {
      return json({
        ok: false,
        error: val.error,
        ...publicState(cg),
      }, 400);
    }
    const max = maxStageFor(cg);
    if (cg.stage < max) {
      cg = { ...cg, stage: cg.stage + 1 };
    }
  }

  await saveCg(userId, cg);
  return json({ ok: true, ...publicState(cg) });
}

/** POST /api/v1/dnd/chargen/submit */
export async function submitChargen(
  userId: string,
): Promise<Response> {
  const actor = await loadActor(userId);
  if (!actor) return json({ error: "Forbidden" }, 403);
  const cg = readCg(actor);
  if (!cg) return json({ error: "Start chargen first." }, 400);

  const max = maxStageFor(cg);
  if (cg.stage < max) {
    return json({
      error: "Finish all stages before submit.",
      stage: cg.stage,
      maxStage: max,
    }, 400);
  }

  const result = await submitCgDraft({
    actorId: userId,
    actorName: actorName(actor),
    cg,
  });
  if (!result.ok) {
    return json({
      error: result.error,
      alreadyPending: result.alreadyPending,
      jobNumber: result.jobNumber,
    }, result.alreadyPending ? 409 : 400);
  }

  await saveCg(userId, result.cg);
  return json({
    ok: true,
    jobNumber: result.jobNumber,
    resubmit: result.resubmit,
    ...publicState(result.cg),
  });
}

/** GET /api/v1/dnd/sheet */
export async function getSheet(
  userId: string,
): Promise<Response> {
  const actor = await loadActor(userId);
  if (!actor) return json({ error: "Forbidden" }, 403);
  const live = liveSheetOf(actor);
  if (!live) {
    return json({
      ok: false,
      error: "No live sheet. Complete chargen first.",
    }, 404);
  }
  const name = actorName(actor);
  return json({
    ok: true,
    system: "dnd",
    approved: isApprovedFlag(actor),
    name,
    sheet: live,
    sheetText: sheetText(name, live),
  });
}

/** POST /api/v1/dnd/approve — staff */
export async function approveHttp(
  userId: string,
  body: { playerId?: string; notes?: string },
): Promise<Response> {
  const staff = await loadActor(userId);
  if (!staff || !isStaff(flagsOf(staff.flags))) {
    return json({ error: "Forbidden" }, 403);
  }
  const playerId = String(body.playerId ?? "").replace(/^#/, "");
  if (!playerId) {
    return json({ error: "playerId required" }, 400);
  }
  const result = await approvePlayer({
    playerId,
    staffId: userId,
    staffName: actorName(staff),
    notes: body.notes ?? "",
    completeJob: true,
  });
  if (!result.ok) {
    return json({ error: result.error }, 400);
  }
  return json({
    ok: true,
    name: result.name,
    already: result.already,
    job: result.job,
  });
}
