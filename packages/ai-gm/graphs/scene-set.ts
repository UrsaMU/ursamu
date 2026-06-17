// ─── Scene Set Draft Graph ────────────────────────────────────────────────────
//
// Generates a GM narration draft from a player's scene-set description.
// The draft is paged privately to the staff member who posted the scene-set;
// they can edit and broadcast it with +gm/scene/publish.

import type { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { buildGraph, invokeGraph } from "./base.ts";
import type { IInjectOptions } from "../context/injector.ts";
import { buildInjectedPrompt } from "../context/injector.ts";
import { SCENE_SET_DRAFT_SYSTEM_SUFFIX } from "../prompts/templates.ts";

export function buildSceneSetGraph(model: ChatGoogleGenerativeAI) {
  return buildGraph(model);
}

export interface ISceneSetGraphInput {
  opts: IInjectOptions;
  actorName: string;
  /** The raw scene-set description text posted by the player. */
  description: string;
}

export function runSceneSetGraph(
  graph: ReturnType<typeof buildSceneSetGraph>,
  input: ISceneSetGraphInput,
): Promise<string> {
  const systemPrompt = buildInjectedPrompt({
    ...input.opts,
    graphSuffix: SCENE_SET_DRAFT_SYSTEM_SUFFIX,
  });

  const humanMsg = [
    `${input.actorName} has posted a scene-set description:`,
    "",
    input.description,
    "",
    "Write a GM narration draft suitable for broadcasting to the room.",
  ].join("\n");

  return invokeGraph(graph, systemPrompt, humanMsg);
}
