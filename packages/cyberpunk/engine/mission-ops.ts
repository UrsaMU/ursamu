/**
 * Pure mission-run state ops for +run / AI-GM tools.
 * Persistence and NPC spawn stay in commands / tools.
 */
import type {
  IMissionObjective,
  IMissionRun,
  IMissionThreat,
  MissionRunStatus,
} from "../db/schemas.ts";
import {
  getMissionPack,
  MISSION_PACKS,
  type IMissionPack,
} from "../data/mission-packs.ts";

export type MissionOpResult =
  | { ok: true; run: IMissionRun; meta?: Record<string, unknown> }
  | { ok: false; error: string };

function ok(
  run: IMissionRun,
  meta?: Record<string, unknown>,
): MissionOpResult {
  return { ok: true, run, meta };
}

function fail(error: string): MissionOpResult {
  return { ok: false, error };
}

function newId(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 12);
}

export function listPacks(): readonly IMissionPack[] {
  return MISSION_PACKS;
}

export function formatMissionBlock(run: IMissionRun): string {
  const phase = run.phases[run.phaseIndex];
  const lines = [
    `MISSION: ${run.title}  [${run.status}]`,
    `PHASE ${run.phaseIndex + 1}/${run.phases.length}` +
      (phase ? ` — ${phase.title} (${phase.kind})` : ""),
    `HEAT: ${run.heat.ticks}/${run.heat.max}`,
    `PAYOUT: ${run.payoutEb} eb (crew ${run.crewIds.length})`,
    "OBJECTIVES:",
  ];
  for (const o of run.objectives) {
    const mark = o.done ? "x" : " ";
    const opt = o.optional ? " (optional)" : "";
    lines.push(`  [${mark}] ${o.text}${opt}`);
  }
  if (run.threats.length) {
    lines.push("THREATS:");
    for (const t of run.threats) {
      lines.push(`  - ${t.name} (${t.archetype}) [${t.status}]`);
    }
  }
  if (phase?.onEnter) {
    lines.push(`GM CUE: ${phase.onEnter}`);
  }
  if (phase?.scene) {
    lines.push(`SCENE BEAT:\n${phase.scene}`);
  }
  return lines.join("\n");
}

export function startRun(opts: {
  packId: string;
  roomId: string;
  crewIds: string[];
  crewNames: string[];
  startedById: string;
  startedByName: string;
  sessionId?: string;
}): MissionOpResult {
  const packId = opts.packId === "random"
    ? MISSION_PACKS[Math.floor(Math.random() * MISSION_PACKS.length)]!
      .id
    : opts.packId;
  const pack = getMissionPack(packId);
  if (!pack) {
    return fail(
      `Unknown pack "${opts.packId}". Try: ` +
        MISSION_PACKS.map((p) => p.id).join(", "),
    );
  }
  if (!opts.roomId) return fail("No room");
  if (!opts.crewIds.length) {
    return fail("No crew in room (need chargen-complete players)");
  }

  const objectives: IMissionObjective[] = pack.objectives.map((o) => ({
    ...o,
    done: false,
  }));

  const run: IMissionRun = {
    id: newId(),
    roomId: String(opts.roomId).replace(/^#/, ""),
    sessionId: opts.sessionId,
    templateId: pack.id,
    title: pack.title,
    status: "briefing",
    phaseIndex: 0,
    phases: pack.phases.map((p) => ({ ...p })),
    objectives,
    crewIds: opts.crewIds.map((id) => String(id).replace(/^#/, "")),
    crewNames: [...opts.crewNames],
    threats: [],
    heat: { ticks: 0, max: pack.heatMax },
    payoutEb: pack.payoutEb,
    startedAt: Date.now(),
    brief: pack.brief,
    startedById: opts.startedById,
    startedByName: opts.startedByName,
  };

  return ok(run, {
    packId: pack.id,
    spawn: pack.phases[0]?.spawn ?? [],
    scene: pack.phases[0]?.scene ?? "",
  });
}

export function activateRun(run: IMissionRun): MissionOpResult {
  if (run.status !== "briefing" && run.status !== "active") {
    return fail(`Cannot activate from status ${run.status}`);
  }
  return ok({ ...run, status: "active" });
}

export function completeObjective(
  run: IMissionRun,
  objectiveId: string,
): MissionOpResult {
  if (run.status === "complete" || run.status === "failed" ||
    run.status === "aborted") {
    return fail("Run already finished");
  }
  const id = objectiveId.toLowerCase().trim();
  let found = false;
  const objectives = run.objectives.map((o) => {
    if (
      o.id === id || o.id.startsWith(id) ||
      o.text.toLowerCase().includes(id)
    ) {
      found = true;
      return { ...o, done: true };
    }
    return o;
  });
  if (!found) return fail(`No objective matching "${objectiveId}"`);
  let next = { ...run, objectives, status: "active" as MissionRunStatus };
  next = maybeAutoPhase(next);
  return ok(next, { allRequiredDone: allRequiredDone(next) });
}

export function allRequiredDone(run: IMissionRun): boolean {
  return run.objectives
    .filter((o) => !o.optional)
    .every((o) => o.done);
}

function maybeAutoPhase(run: IMissionRun): IMissionRun {
  // Mark phase_reach objectives when on last phase
  if (run.phaseIndex >= run.phases.length - 1) {
    const objectives = run.objectives.map((o) =>
      o.auto === "phase_reach" ? { ...o, done: true } : o
    );
    return { ...run, objectives };
  }
  return run;
}

export function advancePhase(run: IMissionRun): MissionOpResult {
  if (run.status === "complete" || run.status === "failed" ||
    run.status === "aborted") {
    return fail("Run already finished");
  }
  if (run.phaseIndex >= run.phases.length - 1) {
    return fail("Already on final phase — complete objectives");
  }
  const phaseIndex = run.phaseIndex + 1;
  const phase = run.phases[phaseIndex]!;
  let status: MissionRunStatus = "active";
  if (phase.kind === "combat") status = "combat";

  let next: IMissionRun = {
    ...run,
    phaseIndex,
    status,
  };
  next = maybeAutoPhase(next);
  return ok(next, {
    spawn: phase.spawn ?? [],
    scene: phase.scene,
    kind: phase.kind,
    title: phase.title,
    onEnter: phase.onEnter,
  });
}

export function setThreats(
  run: IMissionRun,
  threats: IMissionThreat[],
): MissionOpResult {
  return ok({ ...run, threats: [...threats] });
}

export function markThreatDown(
  run: IMissionRun,
  npcIdOrName: string,
): MissionOpResult {
  const key = npcIdOrName.toLowerCase().trim().replace(/^#/, "");
  let hit = false;
  const threats = run.threats.map((t) => {
    if (
      t.npcId.replace(/^#/, "") === key ||
      t.name.toLowerCase() === key ||
      t.npcId.toLowerCase().startsWith(key)
    ) {
      hit = true;
      return { ...t, status: "down" as const };
    }
    return t;
  });
  if (!hit) return fail(`No threat matching "${npcIdOrName}"`);

  let next: IMissionRun = { ...run, threats };
  const live = threats.filter((t) => t.status !== "down");
  if (!live.length) {
    const objectives = next.objectives.map((o) =>
      o.auto === "threats_clear" ? { ...o, done: true } : o
    );
    next = { ...next, objectives };
  }
  return ok(next, { threatsRemaining: live.length });
}

export function tickHeat(
  run: IMissionRun,
  amount = 1,
): MissionOpResult {
  const ticks = Math.min(
    run.heat.max,
    run.heat.ticks + Math.max(0, Math.floor(amount)),
  );
  const next = {
    ...run,
    heat: { ...run.heat, ticks },
  };
  if (ticks >= run.heat.max) {
    return ok(
      { ...next, status: "failed", completedAt: Date.now() },
      { heatMaxed: true },
    );
  }
  return ok(next, { heat: ticks });
}

export function completeRun(run: IMissionRun): MissionOpResult {
  if (run.status === "complete") return fail("Already complete");
  if (run.status === "aborted" || run.status === "failed") {
    return fail(`Cannot complete from ${run.status}`);
  }
  if (!allRequiredDone(run)) {
    const open = run.objectives
      .filter((o) => !o.optional && !o.done)
      .map((o) => o.text);
    return fail(
      "Required objectives remain: " + open.join("; "),
    );
  }
  const share = Math.floor(
    run.payoutEb / Math.max(1, run.crewIds.length),
  );
  return ok(
    {
      ...run,
      status: "complete",
      completedAt: Date.now(),
    },
    {
      payoutEb: run.payoutEb,
      shareEb: share,
      crewIds: run.crewIds,
    },
  );
}

export function abortRun(run: IMissionRun): MissionOpResult {
  if (run.status === "complete") return fail("Already complete");
  return ok({
    ...run,
    status: "aborted",
    completedAt: Date.now(),
  });
}

export function failRun(run: IMissionRun, reason?: string): MissionOpResult {
  return ok(
    {
      ...run,
      status: "failed",
      completedAt: Date.now(),
    },
    { reason },
  );
}

/** Share EB each crew member gets on success. */
export function payoutShare(run: IMissionRun): number {
  return Math.floor(run.payoutEb / Math.max(1, run.crewIds.length));
}
