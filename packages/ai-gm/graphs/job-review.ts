// ─── Job Review Graph ─────────────────────────────────────────────────────────
//
// Reviews a pending staff job and either approves, rejects, or flags it for
// human attention. Used when staff delegate a job decision to the GM agent.

import type { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { buildGraph, invokeGraph } from "./base.ts";
import type { IInjectOptions } from "../context/injector.ts";
import { buildInjectedPrompt } from "../context/injector.ts";
import { JOB_REVIEW_SYSTEM_SUFFIX } from "../prompts/templates.ts";

export function buildJobReviewGraph(model: ChatGoogleGenerativeAI) {
  return buildGraph(model);
}

export interface IJobReviewGraphInput {
  opts: IInjectOptions;
  jobId: string;
  jobNumber: number;
  title: string;
  body: string;
  submitterName: string;
  category: string;
}

export function runJobReviewGraph(
  graph: ReturnType<typeof buildJobReviewGraph>,
  input: IJobReviewGraphInput,
): Promise<string> {
  const systemPrompt = buildInjectedPrompt({
    ...input.opts,
    graphSuffix: JOB_REVIEW_SYSTEM_SUFFIX,
  });

  const humanMsg = [
    `JOB #${input.jobNumber}: ${input.title}`,
    `Submitted by: ${input.submitterName}`,
    `Category: ${input.category}`,
    "",
    input.body,
    "",
    "Review this job. Use approve_job or reject_job tool with your reasoning.",
    "If more information is needed, use create_job to file a follow-up question.",
  ].join("\n");

  return invokeGraph(graph, systemPrompt, humanMsg);
}
