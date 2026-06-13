// ─── Move Graph ───────────────────────────────────────────────────────────────
//
// Adjudicates a completed PbtA move roll after the player has rolled dice.
// Applies outcome to fiction and fires mechanical effects via tools.

import type { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { buildGraph, invokeGraph } from "./base.ts";
import type { IInjectOptions } from "../context/injector.ts";
import { buildInjectedPrompt } from "../context/injector.ts";
import { MOVE_SYSTEM_SUFFIX } from "../prompts/templates.ts";

export function buildMoveGraph(model: ChatGoogleGenerativeAI) {
  return buildGraph(model);
}

export interface IMoveGraphInput {
  opts: IInjectOptions;
  moveName: string;
  stat: string;
  statValue: number;
  roll1: number;
  roll2: number;
  total: number;
  playerName: string;
  triggeringPose: string;
}

export function runMoveGraph(
  graph: ReturnType<typeof buildMoveGraph>,
  input: IMoveGraphInput,
): Promise<string> {
  const systemPrompt = buildInjectedPrompt({
    ...input.opts,
    graphSuffix: MOVE_SYSTEM_SUFFIX,
  });

  const outcome = input.total >= 10
    ? "10+ (full success)"
    : input.total >= 7
    ? "7-9 (partial success / cost)"
    : `6- (miss -- hard move incoming, ${input.playerName} marks XP)`;

  const humanMsg = [
    `Player: ${input.playerName}`,
    `Triggering action: ${input.triggeringPose}`,
    `Move: ${input.moveName}`,
    `Stat: ${input.stat} (${input.statValue > 0 ? "+" : ""}${input.statValue})`,
    `Roll: [${input.roll1}, ${input.roll2}] + ${input.statValue} = ${input.total}`,
    `Outcome: ${outcome}`,
    "",
    "Adjudicate this move result. Apply fiction and mechanics.",
  ].join("\n");

  return invokeGraph(graph, systemPrompt, humanMsg);
}
