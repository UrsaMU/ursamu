// ─── Pose Graph ───────────────────────────────────────────────────────────────
//
// Adjudicates a completed round: all players have posed (or timeout fired).
// Uses the full injected context as system prompt and the round summary as input.

import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { DBO } from "@ursamu/mush";
import { buildGraph, invokeGraph } from "./base.ts";
import type { IInjectOptions } from "../context/injector.ts";
import { buildInjectedPrompt } from "../context/injector.ts";
import { poseSuffixFor } from "../prompts/templates.ts";
import { formatMissionBlock } from "../../cyberpunk/engine/mission-ops.ts";
import type { IMissionRun } from "../../cyberpunk/db/schemas.ts";

const runDB = new DBO<IMissionRun>("cpr.runs");

async function missionBlockForRoom(roomId: string): Promise<string> {
  const rid = String(roomId ?? "").replace(/^#/, "");
  try {
    const all = await runDB.all();
    const run = all.find((r) =>
      String(r.roomId).replace(/^#/, "") === rid &&
      (r.status === "briefing" || r.status === "active" ||
        r.status === "combat")
    );
    if (!run) return "";
    return formatMissionBlock(run);
  } catch {
    return "";
  }
}

export function buildPoseGraph(model: BaseChatModel) {
  return buildGraph(model);
}

export interface IPoseGraphInput {
  opts: IInjectOptions;
  roundSummary: string;
}

export async function runPoseGraph(
  graph: ReturnType<typeof buildPoseGraph>,
  input: IPoseGraphInput,
): Promise<string> {
  const roomMatch = /Room:\s*(\S+)/i.exec(input.roundSummary);
  const rid = input.opts.roomId ||
    roomMatch?.[1] ||
    input.opts.roomCtx?.scene?.roomId ||
    input.opts.roomCtx?.scene?.id ||
    "";

  const sysId = String(input.opts.system?.id ?? "");
  const mission = sysId === "utopia"
    ? ""
    : (rid ? await missionBlockForRoom(rid) : "");
  const suffix = poseSuffixFor(sysId, !!mission);

  const systemPrompt = buildInjectedPrompt({
    ...input.opts,
    graphSuffix: suffix,
  });

  // Put sheet + scene in the HUMAN message so the model cannot
  // "miss" them buried in a long system prompt.
  const scene = input.opts.roomCtx?.scene;
  const sceneBlock = scene
    ? `SCENE: ${scene.title ?? ""}\n${scene.description ?? ""}`
    : "SCENE: (establish Night City detail from fiction)";
  const sheets = (input.opts.roomCtx?.playersInRoom ?? [])
    .map((c) => {
      if (input.opts.system.formatCharacterContext) {
        try {
          return input.opts.system.formatCharacterContext(c);
        } catch {
          /* fall through */
        }
      }
      const d = (c.data ?? {}) as Record<string, unknown>;
      return [
        `CHARACTER: ${c.name} (${c.playbook ?? d.role ?? "?"})`,
        `  playerId=${c.playerId}`,
        d.stats ? `  stats=${JSON.stringify(d.stats)}` : "",
        d.skills
          ? `  skills=${
            JSON.stringify(
              Object.fromEntries(
                Object.entries(d.skills as Record<string, number>)
                  .filter(([, r]) => Number(r) >= 3)
                  .slice(0, 12),
              ),
            )
          }`
          : "",
        d.hp ? `  hp=${JSON.stringify(d.hp)} wound=${d.woundState}` : "",
        d.eurodollars != null ? `  eb=${d.eurodollars}` : "",
        Array.isArray(d.cyberware) && d.cyberware.length
          ? `  chrome=${(d.cyberware as string[]).slice(0, 8).join(", ")}`
          : "",
      ].filter(Boolean).join("\n");
    })
    .join("\n\n");

  const human =
    (mission ? `${mission}\n\n` : "") +
    `${sceneBlock}\n\n` +
    `ACTIVE EDGERUNNERS (authoritative — do not claim missing):\n` +
    `${sheets || "(no sheets resolved — narrate from names in round)"}\n\n` +
    `ROUND SUMMARY (player-declared actions only — do not add PC acts):\n` +
    `${input.roundSummary}\n\n` +
    `Adjudicate NOW. Never pose for the players. Narrate world/NPC ` +
    `reaction only, then leave the next choice to them. ` +
    (mission
      ? `Drive the MISSION forward with tools when needed. `
      : "") +
    `If a check is needed: [OOC: roll STAT + Skill vs DV N]. ` +
    `Do not re-describe the whole room if the mission/scene block is set.`;

  return invokeGraph(graph, systemPrompt, human);
}
