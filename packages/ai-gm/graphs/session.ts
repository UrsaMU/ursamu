// ─── Session Summary Graph ────────────────────────────────────────────────────
//
// Generates an end-of-session recap: key events, NPC shifts, world changes,
// unresolved threads. Stores memories and optionally publishes a wiki recap.

import type { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { buildGraph, invokeGraph } from "./base.ts";
import type { IInjectOptions } from "../context/injector.ts";
import { buildInjectedPrompt } from "../context/injector.ts";
import { SESSION_SUMMARY_SYSTEM_SUFFIX } from "../prompts/templates.ts";
import type { IGMExchange, IGMSession } from "../schema.ts";

export function buildSessionGraph(model: ChatGoogleGenerativeAI) {
  return buildGraph(model);
}

export interface ISessionGraphInput {
  opts: IInjectOptions;
  session: IGMSession;
  exchanges: IGMExchange[];
  publishToWiki: boolean;
}

export function runSessionGraph(
  graph: ReturnType<typeof buildSessionGraph>,
  input: ISessionGraphInput,
): Promise<string> {
  const systemPrompt = buildInjectedPrompt({
    ...input.opts,
    graphSuffix: SESSION_SUMMARY_SYSTEM_SUFFIX,
  });

  const exchangeSummary = input.exchanges
    .map((e) => {
      const who = e.playerName ? `${e.playerName}: ` : "";
      return `[${e.type}] ${who}${e.input.slice(0, 100)}\n  -> ${
        e.output.slice(0, 200)
      }`;
    })
    .join("\n\n");

  const humanMsg = [
    `SESSION: ${input.session.label}`,
    `Opened by: ${input.session.openedByName}`,
    `Exchanges: ${input.exchanges.length}`,
    "",
    "EXCHANGE LOG:",
    exchangeSummary || "(no exchanges recorded)",
    "",
    "Tasks:",
    "1. Identify key events, NPC shifts, world changes, and unresolved threads.",
    "2. Store important facts as campaign memories (store_memory tool).",
    input.publishToWiki
      ? "3. Publish a session recap to the wiki using store_lore (category='sessions', slug based on session label)."
      : "3. Write the session summary as your output (staff will decide whether to publish).",
  ].join("\n");

  return invokeGraph(graph, systemPrompt, humanMsg);
}
