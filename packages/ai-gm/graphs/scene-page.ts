// ─── Scene Page Graph ─────────────────────────────────────────────────────────
//
// Pages a player who just entered a watched room with the current scene
// description + a brief "so far in this scene" summary.

import type { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { buildGraph, invokeGraph } from "./base.ts";
import type { IInjectOptions } from "../context/injector.ts";
import { buildInjectedPrompt } from "../context/injector.ts";
import { SCENE_PAGE_SYSTEM_SUFFIX } from "../prompts/templates.ts";

export function buildScenePageGraph(model: ChatGoogleGenerativeAI) {
  return buildGraph(model);
}

export interface IScenePageGraphInput {
  opts: IInjectOptions;
  playerName: string;
  recentActivity: string; // brief log of what happened in this room recently
}

export function runScenePageGraph(
  graph: ReturnType<typeof buildScenePageGraph>,
  input: IScenePageGraphInput,
): Promise<string> {
  const systemPrompt = buildInjectedPrompt({
    ...input.opts,
    graphSuffix: SCENE_PAGE_SYSTEM_SUFFIX,
  });

  const humanMsg = [
    `${input.playerName} has just entered the room.`,
    "",
    "Recent activity in this room:",
    input.recentActivity || "(no recent activity)",
    "",
    "Page them with: (1) the current scene description, (2) a brief so-far summary.",
    "Address ${input.playerName} directly. Keep it tight: two short paragraphs max.",
  ].join("\n");

  return invokeGraph(graph, systemPrompt, humanMsg);
}
