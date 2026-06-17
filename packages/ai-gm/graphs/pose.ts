// ─── Pose Graph ───────────────────────────────────────────────────────────────
//
// Adjudicates a completed round: all players have posed (or timeout fired).
// Uses the full injected context as system prompt and the round summary as input.

import type { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { buildGraph, invokeGraph } from "./base.ts";
import type { IInjectOptions } from "../context/injector.ts";
import { buildInjectedPrompt } from "../context/injector.ts";
import { POSE_SYSTEM_SUFFIX } from "../prompts/templates.ts";

export function buildPoseGraph(model: ChatGoogleGenerativeAI) {
  return buildGraph(model);
}

export interface IPoseGraphInput {
  opts: IInjectOptions;
  roundSummary: string;
}

export function runPoseGraph(
  graph: ReturnType<typeof buildPoseGraph>,
  input: IPoseGraphInput,
): Promise<string> {
  const systemPrompt = buildInjectedPrompt({
    ...input.opts,
    graphSuffix: POSE_SYSTEM_SUFFIX,
  });
  return invokeGraph(
    graph,
    systemPrompt,
    `ROUND SUMMARY:\n${input.roundSummary}\n\nAdjudicate this round.`,
  );
}
