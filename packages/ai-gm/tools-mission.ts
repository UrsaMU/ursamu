/**
 * Mission-run tools for AI-GM (CPR +run).
 * Reads/writes DBO cpr.runs; payouts via dbojs.
 */
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { DBO, dbojs } from "@ursamu/mush";
import type { IMissionRun } from "../cyberpunk/db/schemas.ts";
import {
  advancePhase,
  allRequiredDone,
  completeObjective,
  completeRun,
  formatMissionBlock,
  markThreatDown,
  payoutShare,
  tickHeat,
} from "../cyberpunk/engine/mission-ops.ts";

const runDB = new DBO<IMissionRun>("cpr.runs");

function bare(id: string): string {
  return String(id ?? "").replace(/^#/, "").trim();
}

async function loadActive(roomId: string): Promise<IMissionRun | null> {
  const rid = bare(roomId);
  const all = await runDB.all();
  return all.find((r) =>
    bare(r.roomId) === rid &&
    (r.status === "briefing" || r.status === "active" ||
      r.status === "combat")
  ) ?? null;
}

async function save(run: IMissionRun): Promise<void> {
  const ex = await runDB.queryOne({ id: run.id });
  if (ex) await runDB.modify({ id: run.id }, "$set", { ...run });
  else await runDB.create(run);
}

export const get_mission = new DynamicStructuredTool({
  name: "get_mission",
  description:
    "Get the active AI-GM mission run in a room (objectives, phase, heat).",
  schema: z.object({
    roomId: z.string().describe("Room id where the crew is playing"),
  }),
  func: async ({ roomId }) => {
    const run = await loadActive(roomId);
    if (!run) return "No active mission in this room.";
    return formatMissionBlock(run);
  },
});

export const complete_objective = new DynamicStructuredTool({
  name: "complete_objective",
  description:
    "Mark a mission objective done (by id or text fragment).",
  schema: z.object({
    roomId: z.string(),
    objectiveId: z.string().describe("Objective id or text fragment"),
  }),
  func: async ({ roomId, objectiveId }) => {
    const run = await loadActive(roomId);
    if (!run) return "No active mission.";
    const res = completeObjective(run, objectiveId);
    if (!res.ok) return `Error: ${res.error}`;
    await save(res.run);
    const extra = res.meta?.allRequiredDone
      ? "\nAll required objectives done — call complete_mission."
      : "";
    return formatMissionBlock(res.run) + extra;
  },
});

export const advance_mission_phase = new DynamicStructuredTool({
  name: "advance_mission_phase",
  description:
    "Advance the mission to the next phase (new scene; may need spawns).",
  schema: z.object({
    roomId: z.string(),
  }),
  func: async ({ roomId }) => {
    const run = await loadActive(roomId);
    if (!run) return "No active mission.";
    const res = advancePhase(run);
    if (!res.ok) return `Error: ${res.error}`;
    await save(res.run);
    const spawn = (res.meta?.spawn as string[] | undefined) ?? [];
    const spawnNote = spawn.length
      ? `\nSPAWN NEEDED (tell players or staff): ${spawn.join(", ")}. ` +
        `Ask them to +init when violence starts. ` +
        `(Staff: +run/advance also spawns.)`
      : "";
    return formatMissionBlock(res.run) + spawnNote +
      `\nSCENE:\n${res.meta?.scene ?? ""}`;
  },
});

export const tick_mission_heat = new DynamicStructuredTool({
  name: "tick_mission_heat",
  description:
    "Raise mission heat/alarm (escalation). Max heat fails the run.",
  schema: z.object({
    roomId: z.string(),
    amount: z.number().int().min(1).max(3).optional(),
  }),
  func: async ({ roomId, amount }) => {
    const run = await loadActive(roomId);
    if (!run) return "No active mission.";
    const res = tickHeat(run, amount ?? 1);
    if (!res.ok) return `Error: ${res.error}`;
    await save(res.run);
    if (res.meta?.heatMaxed) {
      return "HEAT MAXED — mission FAILED. Narrate the blowback.";
    }
    return formatMissionBlock(res.run);
  },
});

export const mark_threat_down = new DynamicStructuredTool({
  name: "mark_threat_down",
  description: "Mark a mission NPC threat as down/defeated.",
  schema: z.object({
    roomId: z.string(),
    npcIdOrName: z.string(),
  }),
  func: async ({ roomId, npcIdOrName }) => {
    const run = await loadActive(roomId);
    if (!run) return "No active mission.";
    const res = markThreatDown(run, npcIdOrName);
    if (!res.ok) return `Error: ${res.error}`;
    await save(res.run);
    return formatMissionBlock(res.run);
  },
});

export const complete_mission = new DynamicStructuredTool({
  name: "complete_mission",
  description:
    "Complete the mission and pay the crew (required objectives must be done).",
  schema: z.object({
    roomId: z.string(),
  }),
  func: async ({ roomId }) => {
    const run0 = await loadActive(roomId);
    if (!run0) return "No active mission.";
    if (!allRequiredDone(run0)) {
      return "Cannot complete — required objectives remain:\n" +
        formatMissionBlock(run0);
    }
    const res = completeRun(run0);
    if (!res.ok) return `Error: ${res.error}`;
    const run = res.run;
    await save(run);
    const share = payoutShare(run);

    for (const cid of run.crewIds) {
      let rows = await dbojs.query({ id: cid });
      if (!rows[0]) rows = await dbojs.query({ id: `#${cid}` });
      const pl = rows[0];
      if (!pl) continue;
      // deno-lint-ignore no-explicit-any
      const data = (pl as any).data ?? {};
      // deno-lint-ignore no-explicit-any
      const state = (pl as any).state ?? {};
      const cpr = data.cpr ?? state.cpr ?? {};
      const eb = Math.floor(Number(cpr.eurodollars ?? 0)) + share;
      const rep = Math.floor(Number(cpr.reputation ?? 0)) + 1;
      // Prefer data.cpr (canonical web/in-game)
      if (data.cpr) {
        await dbojs.modify({ id: pl.id }, "$set", {
          "data.cpr.eurodollars": eb,
          "data.cpr.reputation": rep,
        });
      } else {
        await dbojs.modify({ id: pl.id }, "$set", {
          "state.cpr.eurodollars": eb,
          "state.cpr.reputation": rep,
        });
      }
    }

    return (
      `MISSION COMPLETE: ${run.title}. ` +
      `Paid ${share} eb +1 rep to each of ${run.crewIds.length} crew. ` +
      `Narrate the payoff beat — do not pose for the PCs.`
    );
  },
});

export const MISSION_TOOLS = [
  get_mission,
  complete_objective,
  advance_mission_phase,
  tick_mission_heat,
  mark_threat_down,
  complete_mission,
];
