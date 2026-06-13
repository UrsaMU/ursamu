// ─── World Event Graph ────────────────────────────────────────────────────────
//
// Generates off-screen world activity between sessions. Reviews fronts, clocks,
// NPC states, and player consequences. Proposes events as jobs for staff review
// before they become canon.

import type { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { buildGraph, invokeGraph } from "./base.ts";
import type { IInjectOptions } from "../context/injector.ts";
import { buildInjectedPrompt } from "../context/injector.ts";
import { WORLD_EVENT_SYSTEM_SUFFIX } from "../prompts/templates.ts";

export function buildWorldEventGraph(model: ChatGoogleGenerativeAI) {
  return buildGraph(model);
}

export interface IWorldEventGraphInput {
  opts: IInjectOptions;
  /** Human-readable context about the time gap (e.g. "3 days since last session"). */
  timePassed: string;
  /** Any staff notes to guide the generation. */
  staffNotes?: string;
}

export function runWorldEventGraph(
  graph: ReturnType<typeof buildWorldEventGraph>,
  input: IWorldEventGraphInput,
): Promise<string> {
  const systemPrompt = buildInjectedPrompt({
    ...input.opts,
    graphSuffix: WORLD_EVENT_SYSTEM_SUFFIX,
  });

  const humanMsg = [
    `Time elapsed since last session: ${input.timePassed}`,
    input.staffNotes ? `Staff notes: ${input.staffNotes}` : "",
    "",
    "Review the active fronts, doom clocks, NPC states, and recent player choices.",
    "Determine what the world has been doing while the players were away.",
    "For each significant world event, use create_job to propose it for staff approval.",
    "Do NOT make catastrophic or irreversible changes without a job approval.",
    "Summarize your proposals as the final output.",
  ]
    .filter(Boolean)
    .join("\n");

  return invokeGraph(graph, systemPrompt, humanMsg);
}
