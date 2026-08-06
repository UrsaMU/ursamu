/**
 * Chargen HTTP helpers — pure request handlers used by routes.ts.
 * Auth is already gated (userId non-null) before these run.
 */

import { dbojs } from "@ursamu/ursamu";
import {
  COFD_ATTRIBUTES,
  COFD_MERITS,
  COFD_MENTAL_SKILLS,
  COFD_PHYSICAL_SKILLS,
  COFD_SOCIAL_SKILLS,
  COFD_VIRTUE_NAMES,
  COFD_VICE_NAMES,
  CTL_SEEMINGS,
  CTL_COURTS,
  CTL_REGALIA,
  CTL_KITHS,
  kithsForSeeming,
  MENTAL_ATTRIBUTES,
  PHYSICAL_ATTRIBUTES,
  SOCIAL_ATTRIBUTES,
  VTR_CLANS,
  VTR_COVENANTS,
  VTR_DISCIPLINES,
  VTR_MASK_DIRGE,
} from "../dictionary/index.ts";
import {
  COFD_TEMPLATES,
  chargenTemplates,
} from "../gamelines/templates.ts";
import {
  initCgState,
  getStageName,
  maxStageFor,
  startingMeritDots,
  updateCgState,
  type CofdCgState,
} from "./state.ts";
import { validateCurrentStage } from "./validate.ts";
import {
  addContract,
  removeContract,
  contractStageProgress,
} from "./contracts.ts";
import { eligibleMerits } from "./list_eligible.ts";
import { submitCgDraft } from "./submit.ts";
import { approvePlayer } from "./approve_core.ts";
import { wipeCharacter } from "./wipe_core.ts";
import { formatSheet } from "../sheet/index.ts";

const STAFF = new Set([
  "superuser",
  "admin",
  "wizard",
  "builder",
  "staff",
  "storyteller",
]);

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

function isApproved(actor: Actor): boolean {
  const f = flagsOf(actor.flags);
  for (const x of f) {
    if (String(x).toLowerCase() === "approved") return true;
  }
  // Live sheet alone counts (flag write may lag)
  return liveSheetOf(actor) != null;
}

/**
 * dbojs.queryOne returns storage shape (flags string, data bag).
 * SDK hydrate() maps data → state; HTTP handlers must accept both.
 */
type Actor = {
  id: string;
  name?: string;
  flags?: unknown;
  state?: Record<string, unknown>;
  data?: Record<string, unknown>;
};

async function loadActor(userId: string): Promise<Actor | null> {
  const bare = String(userId ?? "").replace(/^#/, "").trim();
  if (!bare) return null;
  let row = await dbojs.queryOne({ id: bare });
  if (!row) row = await dbojs.queryOne({ id: `#${bare}` });
  if (!row) row = await dbojs.queryOne({ id: userId });
  if (!row) return null;
  return row as unknown as Actor;
}

/** Player bag: hydrated `state` or raw KV `data`. */
function playerBag(actor: Actor): Record<string, unknown> {
  const s = actor.state && typeof actor.state === "object"
    ? actor.state
    : null;
  const d = actor.data && typeof actor.data === "object"
    ? actor.data
    : null;
  // Prefer the bag that actually holds chargen draft
  if (s && s.cofd_cg != null) return s;
  if (d && d.cofd_cg != null) return d;
  // Live sheet may only live on one side
  if (s && s.cofd != null) return s;
  if (d && d.cofd != null) return d;
  return s || d || {};
}

function readCg(actor: Actor): CofdCgState | null {
  // Check data and state directly — do not prefer wrong bag
  const d = actor.data?.cofd_cg;
  if (d && typeof d === "object") return d as CofdCgState;
  const s = actor.state?.cofd_cg;
  if (s && typeof s === "object") return s as CofdCgState;
  return null;
}

/** Sheet for options filtering (merits eligibility). */
export async function chargenSheetForUser(
  userId: string,
): Promise<CofdCgState["sheet"] | null> {
  const actor = await loadActor(userId);
  if (!actor) return null;
  const cg = readCg(actor);
  return cg?.sheet ?? null;
}

async function saveCg(
  userId: string,
  cg: CofdCgState,
): Promise<void> {
  // Storage path is data.* (same as +cg / u.db.modify)
  await dbojs.modify({ id: userId }, "$set", {
    "data.cofd_cg": cg,
  });
}

function stageLabels(max: number): { stage: number; name: string; short: string }[] {
  const shorts: Record<number, string> = {
    1: "Concept",
    2: "Template",
    3: "Detail",
    4: "Attrs",
    5: "Skills",
    6: "Merits",
    7: "Powers",
    8: "Gifts",
  };
  const out = [];
  for (let s = 1; s <= max; s++) {
    out.push({
      stage: s,
      name: getStageName(s),
      short: shorts[s] ?? `Stage ${s}`,
    });
  }
  return out;
}

function meritDotsSpent(sheet: CofdCgState["sheet"]): number {
  const m = sheet.merits || {};
  let n = 0;
  for (const k of Object.keys(m)) n += Number(m[k]) || 0;
  return n;
}

function publicState(cg: CofdCgState) {
  const max = maxStageFor(cg.sheet.template);
  const val = validateCurrentStage(cg);
  const budget = startingMeritDots(cg.sheet.template);
  const spent = meritDotsSpent(cg.sheet);
  return {
    // FE gate: missing `started` was treated as "Begin chargen"
    // after every /set /next /back — looked like a full restart.
    started: true,
    stage: cg.stage,
    maxStage: max,
    stageName: getStageName(cg.stage),
    stages: stageLabels(max),
    sheet: cg.sheet,
    isSubmitted: !!cg.isSubmitted,
    isApproved: !!cg.isApproved,
    submittedJob: cg.submittedJob ?? null,
    canAdvance: val.valid,
    validationError: val.valid ? null : (val.error ?? "Invalid"),
    templateMeta: templateMeta(cg.sheet.template),
    meritBudget: budget,
    meritSpent: spent,
    meritRemaining: Math.max(0, budget - spent),
  };
}

function templateMeta(key: string) {
  const t = COFD_TEMPLATES[key.toLowerCase().trim()];
  if (!t) {
    return {
      key: "mortal",
      name: "Mortal",
      customFields: [] as string[],
    };
  }
  return {
    key: t.key,
    name: t.name,
    customFields: [...t.customFields],
    moralityName: t.moralityName,
    powerStatName: t.powerStatName,
  };
}

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

function liveSheetOf(
  actor: Actor,
): CofdCgState["sheet"] | null {
  // Read live sheet from data or state — never miss because
  // playerBag preferred leftover cofd_cg.
  const d = actor.data?.cofd;
  if (d && typeof d === "object") {
    return d as CofdCgState["sheet"];
  }
  const s = actor.state?.cofd;
  if (s && typeof s === "object") {
    return s as CofdCgState["sheet"];
  }
  return null;
}

async function sheetPayload(
  actor: Actor,
  live: CofdCgState["sheet"],
  approved: boolean,
): Promise<Record<string, unknown>> {
  const name = String(
    actor.name ||
      (actor.data?.name as string) ||
      (actor.state?.name as string) ||
      "Character",
  );
  let text = "";
  try {
    text = stripMushForWeb(
      await formatSheet(name, String(actor.id), live),
    );
  } catch {
    text = "";
  }
  const staff = isStaff(flagsOf(actor.flags));
  return {
    ok: true,
    approved: true,
    isApproved: true,
    closed: true,
    started: true,
    sheet: live,
    sheetText: text,
    name,
    isStaff: staff,
    // Staff (or unapproved self via draft path) may full-wipe.
    canWipe: staff,
    reason: approved
      ? "Character approved — live sheet."
      : "Live sheet.",
  };
}

function stripMushForWeb(s: string): string {
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

/** GET /api/v1/cofd/chargen — draft session, or live sheet if approved. */
export async function getChargen(
  userId: string,
): Promise<Response> {
  const actor = await loadActor(userId);
  if (!actor) return json({ error: "Forbidden" }, 403);

  const live = liveSheetOf(actor);
  const flagApproved = (() => {
    for (const x of flagsOf(actor.flags)) {
      if (String(x).toLowerCase() === "approved") return true;
    }
    return false;
  })();
  const approved = flagApproved || live != null;
  const cg = readCg(actor);
  const staff = isStaff(flagsOf(actor.flags));

  // Character tab: any live sheet for approved PCs wins over draft.
  // Staff keep draft only when NOT approved (testing chargen).
  if (live && (flagApproved || !staff || !cg)) {
    return json(await sheetPayload(actor, live, approved));
  }

  const staffFlag = isStaff(flagsOf(actor.flags));
  if (!cg) {
    return json({
      ok: true,
      started: false,
      isStaff: staffFlag,
      canWipe: false,
      stages: stageLabels(6),
      templates: chargenTemplates().map((t) => ({
        key: t.key,
        name: t.name,
      })),
    });
  }

  return json({
    ok: true,
    started: true,
    isStaff: staffFlag,
    canWipe: staffFlag,
    ...publicState(cg),
  });
}

/** GET /api/v1/cofd/sheet — own live sheet (JSON + plain text). */
export async function getSheet(
  userId: string,
): Promise<Response> {
  const actor = await loadActor(userId);
  if (!actor) return json({ error: "Forbidden" }, 403);
  const live = liveSheetOf(actor);
  if (!live) {
    return json({
      ok: false,
      error: "No live sheet. Finish chargen first.",
    }, 404);
  }
  const name = String(
    actor.name ||
      (playerBag(actor).name as string) ||
      "Character",
  );
  let text = "";
  try {
    text = stripMushForWeb(
      await formatSheet(name, actor.id, live),
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    text = `(sheet render failed: ${msg})`;
  }
  return json({
    ok: true,
    approved: isApproved(actor),
    name,
    sheet: live,
    sheetText: text,
  });
}

/**
 * POST /api/v1/cofd/approve — staff approve a player (or by job).
 * Body: { playerId?: string, jobNumber?: number, notes?: string }
 */
/** Pull sheet JSON from a CGEN job description snapshot. */
function sheetFromJobDescription(
  desc: unknown,
): CofdCgState["sheet"] | null {
  const text = String(desc ?? "");
  const m = text.match(/```json\s*([\s\S]*?)```/i);
  if (!m) return null;
  try {
    const parsed = JSON.parse(m[1]!);
    if (parsed && typeof parsed === "object" && parsed.template) {
      return parsed as CofdCgState["sheet"];
    }
  } catch {
    /* ignore */
  }
  return null;
}

export async function approveHttp(
  staffId: string,
  body: {
    playerId?: string;
    jobNumber?: number | string;
    notes?: string;
  },
): Promise<Response> {
  const staff = await loadActor(staffId);
  if (!staff) return json({ error: "Forbidden" }, 403);
  if (!isStaff(flagsOf(staff.flags))) {
    return json({ error: "Staff only." }, 403);
  }

  let playerId = String(body.playerId ?? "").replace(/^#/, "")
    .trim();
  let sheetOverride: CofdCgState["sheet"] | null = null;
  let jobNum: number | null = body.jobNumber != null
    ? Number(body.jobNumber)
    : null;

  try {
    const { jobs, jobArchive } = await import("@ursamu/jobs");
    const want = jobNum;
    let job = null as
      | { submittedBy?: string; description?: string; number?: number }
      | null;
    if (want != null && !Number.isNaN(want)) {
      const all = await jobs.find({});
      job = all.find((j) => Number(j.number) === want) ?? null;
      if (!job) {
        try {
          const arch = await jobArchive.find({});
          job = arch.find((j) => Number(j.number) === want) ??
            null;
        } catch {
          /* no archive */
        }
      }
    }
    if (job) {
      if (!playerId) {
        playerId = String(job.submittedBy ?? "").replace(
          /^#/,
          "",
        );
      }
      sheetOverride = sheetFromJobDescription(job.description);
      if (job.number != null) jobNum = Number(job.number);
    }
  } catch {
    /* ignore */
  }

  if (!playerId) {
    return json({
      error: "playerId or jobNumber required",
    }, 400);
  }

  const staffName = String(
    staff.name ||
      (playerBag(staff).name as string) ||
      "Staff",
  );
  const result = await approvePlayer({
    playerId,
    staffId,
    staffName,
    notes: String(body.notes ?? ""),
    completeJob: true,
    sheetOverride,
  });
  if (!result.ok) {
    return json({ error: result.error }, 400);
  }
  return json({
    ok: true,
    already: result.already,
    name: result.name,
    dormId: result.dormId,
    jobNumber: result.job?.number ?? jobNum,
  });
}

/** POST /api/v1/cofd/chargen/start — begin or soft-reset draft. */
export async function startChargen(
  userId: string,
  body: { reset?: boolean } = {},
): Promise<Response> {
  const actor = await loadActor(userId);
  if (!actor) return json({ error: "Forbidden" }, 403);
  const staff = isStaff(flagsOf(actor.flags));

  if (isApproved(actor) && !staff) {
    return json({
      error: "Character already approved.",
    }, 403);
  }

  // reset:true = full wipe; staff only (web Wipe button).
  if (body.reset) {
    if (!staff) {
      return json({
        error: "Permission denied. Staff only.",
      }, 403);
    }
    const name = String(
      actor.name ||
        (actor.data?.name as string) ||
        (actor.state?.name as string) ||
        "You",
    );
    await wipeCharacter({
      playerId: userId,
      staffId: userId,
      staffName: name,
      startDraft: true,
      notify: false,
    });
    const cg = initCgState();
    await saveCg(userId, cg);
    return json({
      ok: true,
      started: true,
      wiped: true,
      isStaff: true,
      canWipe: true,
      ...publicState(cg),
    });
  }

  if (!readCg(actor)) {
    const cg = initCgState();
    await saveCg(userId, cg);
    return json({
      ok: true,
      started: true,
      isStaff: staff,
      canWipe: staff,
      ...publicState(cg),
    });
  }

  const cg = readCg(actor)!;
  return json({
    ok: true,
    started: true,
    isStaff: staff,
    canWipe: staff,
    ...publicState(cg),
  });
}

/**
 * POST /api/v1/cofd/chargen/wipe — full character wipe (+cg/wipe).
 * Staff only. Body: { playerId?: string, reason?: string }
 * Reason required when wiping another player.
 */
export async function wipeChargen(
  userId: string,
  body: { playerId?: string; reason?: string } = {},
): Promise<Response> {
  const actor = await loadActor(userId);
  if (!actor) return json({ error: "Forbidden" }, 403);
  const staff = isStaff(flagsOf(actor.flags));

  if (!staff) {
    return json({
      error: "Permission denied. Staff only.",
    }, 403);
  }

  const bare = (id: string) =>
    String(id ?? "").replace(/^#/, "").trim();
  const selfId = bare(userId);
  const targetId = bare(body.playerId || userId) || selfId;
  const self = targetId === selfId;
  const reason = String(body.reason ?? "").trim();

  if (!self && !reason) {
    return json({
      error:
        "A reason is required when wiping another player.",
    }, 400);
  }

  const staffName = String(
    actor.name ||
      (actor.data?.name as string) ||
      (actor.state?.name as string) ||
      "Staff",
  );

  const result = await wipeCharacter({
    playerId: targetId,
    staffId: userId,
    staffName,
    reason: reason || undefined,
    startDraft: true,
    notify: !self,
  });

  if (!result.ok) {
    // Nothing to wipe — still seed own draft if self.
    if (self) {
      const cg = initCgState();
      await saveCg(userId, cg);
      return json({
        ok: true,
        started: true,
        wiped: true,
        isStaff: true,
        canWipe: true,
        ...publicState(cg),
      });
    }
    return json({ error: result.error }, 400);
  }

  if (self) {
    const fresh = await loadActor(userId);
    let cg = fresh ? readCg(fresh) : null;
    if (!cg) {
      cg = initCgState();
      await saveCg(userId, cg);
    }
    return json({
      ok: true,
      started: true,
      wiped: true,
      name: result.name,
      hadLive: result.hadLive,
      hadDraft: result.hadDraft,
      wasApproved: result.wasApproved,
      isStaff: true,
      canWipe: true,
      ...publicState(cg),
    });
  }

  return json({
    ok: true,
    wiped: true,
    name: result.name,
    hadLive: result.hadLive,
    hadDraft: result.hadDraft,
    wasApproved: result.wasApproved,
    jobNumber: result.job?.number ?? null,
  });
}

/** POST /api/v1/cofd/chargen/set — { trait, value }. */
export async function setChargenTrait(
  userId: string,
  body: { trait?: string; value?: string },
): Promise<Response> {
  const actor = await loadActor(userId);
  if (!actor) return json({ error: "Forbidden" }, 403);
  if (isApproved(actor) && !isStaff(flagsOf(actor.flags))) {
    return json({ error: "Chargen closed." }, 403);
  }

  let cg = readCg(actor);
  if (!cg) {
    cg = initCgState();
  }
  if (cg.isSubmitted) {
    return json({
      error: "Application pending review. Contact staff to reopen.",
    }, 409);
  }

  const trait = String(body.trait ?? "").trim();
  const value = String(body.value ?? "").trim();
  if (!trait) return json({ error: "trait required" }, 400);

  try {
    cg = updateCgState(cg, trait, value);
    await saveCg(userId, cg);
    return json({ ok: true, ...publicState(cg) });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg }, 400);
  }
}

/** POST /api/v1/cofd/chargen/next | /back */
export async function stepChargen(
  userId: string,
  dir: "next" | "back",
): Promise<Response> {
  const actor = await loadActor(userId);
  if (!actor) return json({ error: "Forbidden" }, 403);
  if (isApproved(actor) && !isStaff(flagsOf(actor.flags))) {
    return json({ error: "Chargen closed." }, 403);
  }

  let cg = readCg(actor);
  if (!cg) return json({ error: "Start chargen first." }, 400);
  if (cg.isSubmitted && dir === "next") {
    return json({
      error: "Already submitted for review.",
      ...publicState(cg),
    }, 409);
  }

  if (dir === "back") {
    if (cg.stage <= 1) {
      return json({ error: "Already at first stage." }, 400);
    }
    cg = { ...cg, stage: cg.stage - 1 };
    await saveCg(userId, cg);
    return json({ ok: true, ...publicState(cg) });
  }

  const val = validateCurrentStage(cg);
  if (!val.valid) {
    return json({
      error: val.error ?? "Stage incomplete",
      ...publicState(cg),
    }, 400);
  }

  const max = maxStageFor(cg.sheet.template);
  if (cg.stage >= max) {
    // Finish button → same as +cg/submit on final stage.
    return await submitChargen(userId);
  }

  cg = { ...cg, stage: cg.stage + 1 };
  await saveCg(userId, cg);
  return json({ ok: true, ...publicState(cg) });
}

/**
 * POST /api/v1/cofd/chargen/submit
 * Validate final stage and open/refresh CGEN job.
 */
export async function submitChargen(
  userId: string,
): Promise<Response> {
  const actor = await loadActor(userId);
  if (!actor) return json({ error: "Forbidden" }, 403);
  if (isApproved(actor) && !isStaff(flagsOf(actor.flags))) {
    return json({ error: "Chargen closed." }, 403);
  }

  let cg = readCg(actor);
  if (!cg) return json({ error: "Start chargen first." }, 400);

  const max = maxStageFor(cg.sheet.template);
  if (cg.stage < max) {
    return json({
      error:
        `Finish the last stage first (on stage ${cg.stage} ` +
        `of ${max}).`,
      ...publicState(cg),
    }, 400);
  }

  const val = validateCurrentStage(cg);
  if (!val.valid) {
    return json({
      error: val.error ?? "Stage incomplete",
      ...publicState(cg),
    }, 400);
  }

  const name = String(
    actor.name ||
      (playerBag(actor).name as string) ||
      "Unknown",
  );

  const result = await submitCgDraft({
    actorId: actor.id,
    actorName: name,
    cg,
  });

  if (!result.ok) {
    return json({
      error: result.error,
      alreadyPending: !!result.alreadyPending,
      submittedJob: result.jobNumber ?? null,
      ...publicState(cg),
    }, result.alreadyPending ? 409 : 400);
  }

  cg = result.cg;
  await saveCg(userId, cg);
  return json({
    ok: true,
    submitted: true,
    resubmit: result.resubmit,
    jobNumber: result.jobNumber,
    ...publicState(cg),
  });
}

/** POST /api/v1/cofd/chargen/contract — add/remove CtL contract. */
export async function contractChargen(
  userId: string,
  body: { action?: string; name?: string },
): Promise<Response> {
  const actor = await loadActor(userId);
  if (!actor) return json({ error: "Forbidden" }, 403);
  let cg = readCg(actor);
  if (!cg) return json({ error: "Start chargen first." }, 400);

  const name = String(body.name ?? "").trim();
  if (!name) return json({ error: "name required" }, 400);
  const action = String(body.action ?? "add").toLowerCase();

  try {
    cg = action === "remove"
      ? removeContract(cg, name)
      : addContract(cg, name);
    await saveCg(userId, cg);
    const prog = contractStageProgress(cg.sheet);
    return json({
      ok: true,
      progress: prog,
      ...publicState(cg),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg }, 400);
  }
}

function meritOptionItems(
  list: typeof COFD_MERITS,
) {
  return list.map((m) => ({
    key: m.key,
    name: m.name,
    category: m.category,
    /** Valid ratings at purchase — chargen cost = chosen dots. */
    allowedDots: [...m.allowedDots],
    /** Min cost if buying at lowest legal rating. */
    minCost: m.allowedDots.length
      ? Math.min(...m.allowedDots)
      : 1,
    instanced: m.instanced === true,
    prereqs: [...(m.prereqs ?? [])],
  }));
}

/** GET /api/v1/cofd/chargen/options?topic= */
export async function chargenOptions(
  topicRaw: string,
  seeming?: string,
  opts?: { sheet?: CofdCgState["sheet"] | null },
): Promise<Response> {
  const topic = topicRaw.toLowerCase().trim();

  if (topic === "merits") {
    const sheet = opts?.sheet;
    const list = sheet
      ? eligibleMerits(sheet)
      : COFD_MERITS;
    return json({
      ok: true,
      topic,
      budget: sheet
        ? startingMeritDots(sheet.template)
        : 7,
      items: meritOptionItems(list),
    });
  }

  if (topic === "virtues") {
    return json({
      ok: true,
      topic,
      items: COFD_VIRTUE_NAMES.map((n) => ({ name: n })),
    });
  }
  if (topic === "vices") {
    return json({
      ok: true,
      topic,
      items: COFD_VICE_NAMES.map((n) => ({ name: n })),
    });
  }
  if (topic === "templates") {
    return json({
      ok: true,
      topic,
      items: chargenTemplates().map((t) => ({
        key: t.key,
        name: t.name,
      })),
    });
  }
  if (topic === "seemings") {
    return json({
      ok: true,
      topic,
      items: CTL_SEEMINGS.map((s) => ({
        name: s.name,
        favoredRegalia: s.favoredRegalia,
        blessing: s.blessing,
        curse: s.curse,
        description: s.description,
      })),
    });
  }
  if (topic === "courts") {
    return json({
      ok: true,
      topic,
      items: CTL_COURTS.map((c) => ({
        name: c.name,
        emotion: c.emotion,
        mantleNotes: c.mantleNotes,
        description: c.description,
      })),
    });
  }
  if (topic === "regalia" || topic === "favored") {
    return json({
      ok: true,
      topic,
      items: CTL_REGALIA.map((r) => ({
        name: r.name,
        favoredBy: r.favoredBy,
        description: r.description,
      })),
    });
  }
  if (topic === "kiths") {
    const list = seeming
      ? kithsForSeeming(seeming)
      : CTL_KITHS;
    return json({
      ok: true,
      topic,
      items: list.map((k) => ({
        name: k.name,
        seeming: k.seeming ?? "",
        blessing: k.blessing,
        description: k.description,
      })),
    });
  }
  if (topic === "attributes") {
    return json({
      ok: true,
      topic,
      mental: [...MENTAL_ATTRIBUTES],
      physical: [...PHYSICAL_ATTRIBUTES],
      social: [...SOCIAL_ATTRIBUTES],
      all: [...COFD_ATTRIBUTES],
    });
  }
  if (topic === "skills") {
    return json({
      ok: true,
      topic,
      mental: [...COFD_MENTAL_SKILLS],
      physical: [...COFD_PHYSICAL_SKILLS],
      social: [...COFD_SOCIAL_SKILLS],
    });
  }

  if (topic === "clans") {
    return json({
      ok: true,
      topic,
      items: VTR_CLANS.map((c) => ({
        name: c.name,
        disciplines: [...c.disciplines],
        bane: c.bane,
        description: c.description,
      })),
    });
  }
  if (topic === "covenants") {
    return json({
      ok: true,
      topic,
      items: VTR_COVENANTS.map((c) => ({
        name: c.name,
        mechanic: c.mechanic,
        description: c.description,
      })),
    });
  }
  if (
    topic === "disciplines" ||
    topic === "discipline" ||
    topic === "powers" ||
    topic === "power"
  ) {
    return json({
      ok: true,
      topic: "disciplines",
      items: VTR_DISCIPLINES.map((d) => ({
        name: d.name,
        summary: d.summary,
        inClanFor: [...d.inClanFor],
        key: d.name.toLowerCase(),
      })),
    });
  }
  if (
    topic === "masks" ||
    topic === "dirges" ||
    topic === "mask" ||
    topic === "dirge"
  ) {
    return json({
      ok: true,
      topic,
      items: VTR_MASK_DIRGE.map((a) => ({
        name: a.name,
        description: a.description,
      })),
    });
  }

  return json({ error: `Unknown topic: ${topic}` }, 404);
}
