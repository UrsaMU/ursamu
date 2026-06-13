// ─── Oracle Graph ─────────────────────────────────────────────────────────────
//
// Answers a yes/no question about the fiction using probability shading
// informed by chaos level and active fronts.

import type { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { buildGraph, invokeGraph } from "./base.ts";
import type { IInjectOptions } from "../context/injector.ts";
import { buildInjectedPrompt } from "../context/injector.ts";
import { ORACLE_SYSTEM_SUFFIX } from "../prompts/templates.ts";

export type OracleProbability =
  | "certain"
  | "very-likely"
  | "likely"
  | "50-50"
  | "unlikely"
  | "very-unlikely"
  | "impossible";

export function buildOracleGraph(model: ChatGoogleGenerativeAI) {
  return buildGraph(model);
}

export interface IOracleGraphInput {
  opts: IInjectOptions;
  question: string;
  probability: OracleProbability;
  playerName?: string;
}

export function runOracleGraph(
  graph: ReturnType<typeof buildOracleGraph>,
  input: IOracleGraphInput,
): Promise<string> {
  const systemPrompt = buildInjectedPrompt({
    ...input.opts,
    graphSuffix: ORACLE_SYSTEM_SUFFIX,
  });

  const who = input.playerName ? `${input.playerName} asks: ` : "";
  const humanMsg = `${who}${input.question}\n\n` +
    `Probability shade: ${input.probability}.\n` +
    `Answer with yes/no/and/but framing as appropriate. ` +
    `Fold the answer organically into the fiction -- do not break the fourth wall.`;

  return invokeGraph(graph, systemPrompt, humanMsg);
}
