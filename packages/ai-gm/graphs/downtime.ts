// ─── Downtime Graph ───────────────────────────────────────────────────────────
//
// Resolves all open downtime actions for players between sessions.
// Calls resolve_downtime_action for each and returns a summary narration.

import type { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { buildGraph, invokeGraph } from "./base.ts";
import type { IInjectOptions } from "../context/injector.ts";
import { buildInjectedPrompt } from "../context/injector.ts";
import { DOWNTIME_SYSTEM_SUFFIX } from "../prompts/templates.ts";
import type { IDowntimeAction } from "../context/loader.ts";

// Richer local shape — fields expected from the downtime plugin collection
interface IDowntimeActionFull {
  id: string;
  playerName: string;
  type: string;
  description: string;
  [key: string]: unknown;
}

export function buildDowntimeGraph(model: ChatGoogleGenerativeAI) {
  return buildGraph(model);
}

export interface IDowntimeGraphInput {
  opts: IInjectOptions;
  actions: IDowntimeAction[];
}

export function runDowntimeGraph(
  graph: ReturnType<typeof buildDowntimeGraph>,
  input: IDowntimeGraphInput,
): Promise<string> {
  if (!input.actions.length) {
    return Promise.resolve("No open downtime actions.");
  }

  const systemPrompt = buildInjectedPrompt({
    ...input.opts,
    graphSuffix: DOWNTIME_SYSTEM_SUFFIX,
  });

  const actionLines = (input.actions as unknown as IDowntimeActionFull[])
    .map((a) => `  [${a.id}] ${a.playerName}: [${a.type}] ${a.description}`)
    .join("\n");

  const humanMsg = [
    `There are ${input.actions.length} open downtime action(s) to resolve:`,
    "",
    actionLines,
    "",
    "Resolve each using the resolve_downtime_action tool.",
    "After all are resolved, write a brief summary of what happened across the city during downtime.",
  ].join("\n");

  return invokeGraph(graph, systemPrompt, humanMsg);
}
