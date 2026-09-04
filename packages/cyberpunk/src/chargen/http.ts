/**
 * HTTP handlers for /api/v1/cpr/* chargen and sheet.
 */
import { dbojs, rewriteStatePaths } from "@ursamu/mush";
import type { ICPRCharacter } from "../../db/schemas.ts";
import { buildNewCharacter } from "../../engine/character.ts";
import { ROLES } from "../../data/roles.ts";
import { LIFESTYLES } from "../../data/lifestyles.ts";
import { SKILLS } from "../../data/skills.ts";
import {
  CAREER_SKILLS,
  METHODS,
  STAGE_ORDER,
  STAT_KEYS,
} from "../../engine/chargen-constants.ts";
import { lifepathTableRows } from "../../engine/chargen-lifepath.ts";
import {
  addGear,
  applyConceptNotes,
  applyLifepathField,
  applyLifestyle,
  applyMethod,
  applyRole,
  applySkill,
  applySkillsBatch,
  applyStage,
  applyStat,
  approveDraft,
  CONCEPT_NOTES_MIN,
  ensureRoleSkillFloors,
  installChrome,
  listChromeCatalog,
  listGearCatalog,
  rejectDraft,
  removeChrome,
  removeGear,
  rollLifepath,
  stepDraft,
  submitDraft,
  type OpResult,
} from "../../engine/chargen-ops.ts";
import { openCgenJob } from "./cgen_job.ts";
import { completeCgenJob } from "./complete_cgen_job.ts";
import { emitChargenComplete } from "../../engine/emitters.ts";
import { wipeCharacter } from "./wipe_core.ts";

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

function unauthorized(): Response {
  return json({ error: "Unauthorized" }, 401);
}

function flagsHas(flags: unknown, name: string): boolean {
  if (flags instanceof Set) return flags.has(name);
  if (typeof flags === "string") {
    return flags.split(/\s+/).includes(name);
  }
  if (Array.isArray(flags)) return flags.includes(name);
  return false;
}

// deno-lint-ignore no-explicit-any
async function loadPlayer(userId: string): Promise<any | null> {
  const bare = String(userId ?? "").replace(/^#/, "").trim();
  if (!bare) return null;
  let rows = await dbojs.query({ id: bare });
  if (!rows[0]) rows = await dbojs.query({ id: `#${bare}` });
  const player = rows[0] ?? null;
  if (player) await migrateOrphanCpr(player);
  return player;
}

/**
 * In-game hydrate maps me.state ← obj.data. SDK writes rewrite
 * state.* → data.*. Web must use the same storage key (data.cpr)
 * or sheets never meet +chargen / +sheet.
 */
// deno-lint-ignore no-explicit-any
function cprOf(obj: any): ICPRCharacter | undefined {
  const fromData = obj?.data?.cpr as ICPRCharacter | undefined;
  const raw = fromData ??
    (obj?.state?.cpr as ICPRCharacter | undefined);
  if (!raw) return undefined;
  return ensureRoleSkillFloors(raw);
}

// deno-lint-ignore no-explicit-any
function playerName(obj: any): string {
  return String(
    obj?.data?.name ?? obj?.data?.moniker ?? obj?.name ?? "Unknown",
  );
}

/** Move orphan state.cpr → data.cpr once (web ↔ in-game bridge). */
// deno-lint-ignore no-explicit-any
async function migrateOrphanCpr(obj: any): Promise<void> {
  const orphan = obj?.state?.cpr as ICPRCharacter | undefined;
  const canonical = obj?.data?.cpr as ICPRCharacter | undefined;
  if (!orphan) return;
  if (canonical) {
    // Prefer in-game data; drop orphan web fork
    await dbojs.modify({ id: String(obj.id) }, "$unset", {
      "state.cpr": "",
    });
    // deno-lint-ignore no-explicit-any
    if (obj.state) delete (obj.state as any).cpr;
    return;
  }
  await dbojs.modify(
    { id: String(obj.id) },
    "$set",
    rewriteStatePaths({ "state.cpr": orphan }) as Record<
      string,
      unknown
    >,
  );
  await dbojs.modify({ id: String(obj.id) }, "$unset", {
    "state.cpr": "",
  });
  // Reflect in-memory for this request
  // deno-lint-ignore no-explicit-any
  if (!obj.data) obj.data = {};
  obj.data.cpr = orphan;
  // deno-lint-ignore no-explicit-any
  if (obj.state) delete (obj.state as any).cpr;
}

async function saveDraft(
  playerId: string,
  draft: ICPRCharacter,
): Promise<void> {
  // Same path rewrite as createNativeSDK db.modify
  await dbojs.modify(
    { id: playerId },
    "$set",
    rewriteStatePaths({ "state.cpr": draft }) as Record<
      string,
      unknown
    >,
  );
  // Clear any leftover top-level fork
  await dbojs.modify({ id: playerId }, "$unset", {
    "state.cpr": "",
  });
}

function fromOp(res: OpResult): Response {
  if (!res.ok) {
    return json({ error: res.error }, res.status ?? 400);
  }
  return json({
    ok: true,
    draft: res.draft,
    ...(res.meta ?? {}),
  });
}

export function meta(): Response {
  return json({
    system: "cpr",
    name: "Cyberpunk RED",
    version: "1.0.0",
    roles: ROLES.map((r) => r.name),
    methods: METHODS,
    stages: STAGE_ORDER,
  });
}

export function chargenOptions(
  topic: string,
  q: Record<string, string>,
): Response {
  const t = topic.toLowerCase().trim();
  if (t === "roles" || t === "role") {
    return json({
      topic: "roles",
      items: ROLES.map((r) => ({
        slug: r.name,
        name: r.displayName,
        ability: r.abilityName,
      })),
    });
  }
  if (t === "methods" || t === "method") {
    return json({
      topic: "methods",
      items: [
        {
          slug: "streetrat",
          name: "Street Rat",
          blurb: "Fast presets by role.",
        },
        {
          slug: "edgerunner",
          name: "Edgerunner",
          blurb: "Fast & dirty per-STAT rolls.",
        },
        {
          slug: "complete",
          name: "Complete Package",
          blurb: "Full 62-point buy.",
        },
      ],
    });
  }
  if (t === "stages" || t === "stage") {
    return json({ topic: "stages", items: STAGE_ORDER });
  }
  if (t === "stats" || t === "stat") {
    return json({ topic: "stats", items: STAT_KEYS });
  }
  if (t === "lifestyles" || t === "lifestyle") {
    return json({
      topic: "lifestyles",
      items: LIFESTYLES.map((l) => ({
        slug: l.name,
        name: l.displayName,
        costEb: l.monthlyCostEb,
      })),
    });
  }
  if (t === "skills" || t === "skill") {
    const role = (q.role ?? "solo").toLowerCase();
    const career = CAREER_SKILLS[role as keyof typeof CAREER_SKILLS] ??
      [];
    return json({
      topic: "skills",
      career,
      points: 86,
      items: SKILLS.map((s) => ({
        slug: s.name,
        name: s.name,
        stat: s.stat,
        basic: s.basic,
        cost: s.cost,
        career: career.includes(s.name),
      })),
    });
  }
  if (t === "lifepath" || t === "lifepath_table") {
    const stage = (q.stage ?? "lifepath_cultural").toLowerCase();
    const role = (q.role ?? "solo").toLowerCase();
    const crisis = q.crisis === "1" || q.crisis === "true";
    return json({
      topic: "lifepath",
      stage,
      crisis,
      items: lifepathTableRows(
        // deno-lint-ignore no-explicit-any
        stage as any,
        // deno-lint-ignore no-explicit-any
        role as any,
        { crisis },
      ),
    });
  }
  if (t === "chrome" || t === "cyberware") {
    return json({
      topic: "chrome",
      items: listChromeCatalog(),
      categories: [
        "fashionware", "neuralware", "chipware", "cyberoptics",
        "cyberaudio", "internal", "external", "cyberlimb",
        "borgware",
      ],
    });
  }
  return json({
    topic: t || "catalog",
    topics: [
      "roles", "methods", "stages", "stats", "skills",
      "lifestyles", "lifepath", "chrome",
    ],
  });
}

export async function getSheet(userId: string): Promise<Response> {
  const player = await loadPlayer(userId);
  if (!player) return json({ error: "Not found" }, 404);
  const cpr = cprOf(player);
  if (!cpr) return json({ error: "No CPR sheet" }, 404);
  return json({
    id: player.id,
    name: playerName(player),
    sheet: cpr,
  });
}

export async function getChargen(userId: string): Promise<Response> {
  const player = await loadPlayer(userId);
  if (!player) return json({ error: "Not found" }, 404);
  const cpr = cprOf(player);
  // Persist floor repair so Next/set see the same draft
  if (cpr && player) {
    const raw = (player.data?.cpr ?? player.state?.cpr) as
      | ICPRCharacter
      | undefined;
    if (
      raw &&
      (JSON.stringify(raw.skills) !== JSON.stringify(cpr.skills) ||
        raw.chargenSkillPool !== cpr.chargenSkillPool)
    ) {
      await saveDraft(String(player.id), cpr);
    }
  }
  const status = cpr?.chargenStatus ??
    (cpr?.chargenComplete ? "approved" : "draft");
  return json({
    id: player.id,
    name: playerName(player),
    draft: cpr ?? null,
    complete: !!cpr?.chargenComplete,
    status,
    pending: status === "pending",
    notesMin: CONCEPT_NOTES_MIN,
    stage: cpr?.chargenStage ?? null,
    stages: STAGE_ORDER,
  });
}

export async function startChargen(
  userId: string,
  body: unknown,
): Promise<Response> {
  const player = await loadPlayer(userId);
  if (!player) return json({ error: "Not found" }, 404);
  const existing = cprOf(player);
  if (existing?.chargenComplete || existing?.chargenStatus === "approved") {
    return json({ error: "Already complete" }, 409);
  }
  if (existing?.chargenStatus === "pending") {
    return json({
      error: "Pending staff review — cannot restart",
    }, 409);
  }
  // deno-lint-ignore no-explicit-any
  const role = String((body as any)?.role ?? "solo")
    .toLowerCase();
  // deno-lint-ignore no-explicit-any
  const draft = buildNewCharacter(role as any);
  await saveDraft(String(player.id), draft);
  return json({ ok: true, draft });
}

export async function setChargenTrait(
  userId: string,
  body: unknown,
): Promise<Response> {
  const player = await loadPlayer(userId);
  if (!player) return json({ error: "Not found" }, 404);
  const cpr = cprOf(player);
  if (!cpr) return json({ error: "No draft" }, 404);
  // deno-lint-ignore no-explicit-any
  const b = (body ?? {}) as any;
  const field = String(b.field ?? b.key ?? "").toLowerCase();
  const value = b.value;

  let res: OpResult;
  if (field === "method" || field === "chargenmethod") {
    res = applyMethod(cpr, String(value ?? ""));
  } else if (field === "role") {
    res = applyRole(cpr, String(value ?? ""));
  } else if (field === "stat" || field === "stats") {
    res = applyStat(
      cpr,
      String(b.stat ?? b.name ?? ""),
      Number(value),
    );
  } else if (field === "skills" && value && typeof value === "object") {
    // Batch: { handgun: 4, stealth: 2 } — one request for many clicks
    res = applySkillsBatch(
      cpr,
      value as Record<string, number>,
    );
  } else if (field === "skill" || field === "skills") {
    res = applySkill(
      cpr,
      String(b.skill ?? b.name ?? ""),
      Number(value),
    );
  } else if (field === "lifestyle") {
    res = applyLifestyle(cpr, String(value ?? ""));
  } else if (field === "lifepath" || field === "lp") {
    res = applyLifepathField(
      cpr,
      String(b.lpField ?? b.name ?? ""),
      String(value ?? ""),
    );
  } else if (field === "stage") {
    res = applyStage(cpr, String(value ?? ""));
  } else if (field === "chrome" || field === "cyberware") {
    const act = String(b.action ?? "install").toLowerCase();
    res = act === "remove"
      ? removeChrome(cpr, String(value ?? ""))
      : installChrome(cpr, String(value ?? ""));
  } else if (field === "gear" || field === "equipment") {
    const act = String(b.action ?? "add").toLowerCase();
    res = act === "remove"
      ? removeGear(cpr, String(value ?? ""))
      : addGear(cpr, String(value ?? ""));
  } else if (
    field === "notes" || field === "concept" ||
    field === "conceptnotes" || field === "background"
  ) {
    res = applyConceptNotes(cpr, String(value ?? ""));
  } else {
    return json({
      error: "Unknown field",
      fields: [
        "method", "role", "stat", "skill", "lifestyle",
        "lifepath", "stage", "chrome", "gear", "notes",
      ],
    }, 400);
  }

  if (!res.ok) return fromOp(res);
  await saveDraft(String(player.id), res.draft);
  return fromOp(res);
}

export async function rollChargen(
  userId: string,
  body: unknown,
): Promise<Response> {
  const player = await loadPlayer(userId);
  if (!player) return json({ error: "Not found" }, 404);
  const cpr = cprOf(player);
  if (!cpr) return json({ error: "No draft" }, 404);
  // deno-lint-ignore no-explicit-any
  const b = (body ?? {}) as any;
  const res = rollLifepath(cpr, {
    stage: b.stage != null ? String(b.stage) : undefined,
    n: b.n != null ? Number(b.n) : undefined,
    reroll: !!b.reroll,
  });
  if (!res.ok) return fromOp(res);
  await saveDraft(String(player.id), res.draft);
  return fromOp(res);
}

export async function gearCatalogHttp(
  userId: string,
): Promise<Response> {
  const player = await loadPlayer(userId);
  if (!player) return json({ error: "Not found" }, 404);
  const cpr = cprOf(player);
  if (!cpr) return json({ error: "No draft" }, 404);
  return json({ ok: true, ...listGearCatalog(cpr) });
}

export async function stepChargen(
  userId: string,
  dir: "next" | "back",
): Promise<Response> {
  const player = await loadPlayer(userId);
  if (!player) return json({ error: "Not found" }, 404);
  const cpr = cprOf(player);
  if (!cpr) return json({ error: "No draft" }, 404);
  const res = stepDraft(cpr, dir);
  if (!res.ok) return fromOp(res);
  await saveDraft(String(player.id), res.draft);
  return fromOp(res);
}

export async function submitChargen(
  userId: string,
  body?: unknown,
): Promise<Response> {
  const player = await loadPlayer(userId);
  if (!player) return json({ error: "Not found" }, 404);
  const cpr = cprOf(player);
  if (!cpr) return json({ error: "No draft" }, 404);
  // deno-lint-ignore no-explicit-any
  const b = (body ?? {}) as any;
  const notes = b.notes != null
    ? String(b.notes)
    : b.conceptNotes != null
    ? String(b.conceptNotes)
    : undefined;
  const res = submitDraft(cpr, notes);
  if (!res.ok) return fromOp(res);
  await saveDraft(String(player.id), res.draft);
  let jobNumber: number | undefined;
  if (res.meta?.pending) {
    const jobRes = await openCgenJob({
      actorId: String(player.id),
      actorName: playerName(player),
      cpr: res.draft,
    });
    if ("number" in jobRes) jobNumber = jobRes.number;
  }
  return json({
    ok: true,
    sheet: res.draft,
    draft: res.draft,
    status: res.draft.chargenStatus ?? "pending",
    pending: true,
    complete: false,
    jobNumber,
    already: !!res.meta?.already,
  });
}

export async function approveHttp(
  userId: string | null,
  body: unknown,
): Promise<Response> {
  if (!userId) return unauthorized();
  const staff = await loadPlayer(userId);
  if (!staff) return unauthorized();
  const flags = staff.flags;
  const isStaff = flagsHas(flags, "admin") ||
    flagsHas(flags, "wizard") ||
    flagsHas(flags, "superuser");
  if (!isStaff) return json({ error: "Forbidden" }, 403);

  // deno-lint-ignore no-explicit-any
  const b = (body ?? {}) as any;
  let targetId = String(b.playerId ?? b.target ?? "").replace(
    /^#/,
    "",
  );
  const jobNumber = b.jobNumber != null ? b.jobNumber : null;

  // Resolve player from CGEN job when only jobNumber is sent.
  if (!targetId && jobNumber != null) {
    try {
      const { jobs } = await import("@ursamu/jobs");
      const all = await jobs.find({});
      const job = all.find((j) =>
        Number(j.number) === Number(jobNumber)
      );
      if (job?.submittedBy) {
        targetId = String(job.submittedBy).replace(/^#/, "");
      }
    } catch {
      /* ignore */
    }
  }

  if (!targetId) {
    return json({ error: "playerId or jobNumber required" }, 400);
  }
  const target = await loadPlayer(targetId);
  if (!target) return json({ error: "Player not found" }, 404);
  const cpr = cprOf(target);
  if (!cpr) return json({ error: "No CPR draft" }, 404);

  const action = String(b.action ?? "approve").toLowerCase();
  const already = !!(
    cpr.chargenComplete || cpr.chargenStatus === "approved"
  );
  const res = action === "reject"
    ? rejectDraft(cpr, String(b.reason ?? ""))
    : approveDraft(cpr);
  if (!res.ok) return fromOp(res);
  await saveDraft(String(target.id), res.draft);

  const pname = playerName(target);
  if (action !== "reject" && !already) {
    try {
      await emitChargenComplete(
        targetId,
        pname,
        res.draft.role,
        res.draft.chargenMethod ?? "complete",
      );
    } catch (e: unknown) {
      console.error("[cpr] approve emit:", e);
    }
  }

  let jobTouch: { number: number | null; completed: boolean } = {
    number: jobNumber != null ? Number(jobNumber) : null,
    completed: false,
  };
  if (action !== "reject") {
    jobTouch = await completeCgenJob({
      jobNumber,
      playerId: targetId,
      staffId: userId,
      staffName: playerName(staff),
      notes: String(b.notes ?? ""),
    });
  }

  return json({
    ok: true,
    already,
    name: pname,
    sheet: res.draft,
    status: res.draft.chargenStatus,
    complete: !!res.draft.chargenComplete,
    jobNumber: jobTouch.number,
    job: jobTouch,
  });
}

/** Staff wipe — draft or approved sheet. Wizard+. */
export async function wipeHttp(
  userId: string | null,
  body: unknown,
): Promise<Response> {
  if (!userId) return unauthorized();
  const staff = await loadPlayer(userId);
  if (!staff) return unauthorized();
  const flags = staff.flags;
  const isStaff = flagsHas(flags, "wizard") ||
    flagsHas(flags, "superuser") ||
    flagsHas(flags, "admin");
  if (!isStaff) return json({ error: "Wizard+ only" }, 403);

  // deno-lint-ignore no-explicit-any
  const b = (body ?? {}) as any;
  const targetId = String(b.playerId ?? b.target ?? "")
    .replace(/^#/, "")
    .trim();
  if (!targetId) {
    return json({ error: "playerId required" }, 400);
  }

  const res = await wipeCharacter({
    playerId: targetId,
    staffName: playerName(staff),
    reason: String(b.reason ?? "").trim() || undefined,
  });
  if (!res.ok) {
    return json({ error: res.error }, 404);
  }
  return json({
    ok: true,
    name: res.name,
    hadSheet: res.hadSheet,
    wasApproved: res.wasApproved,
  });
}
