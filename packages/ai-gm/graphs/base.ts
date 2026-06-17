// ─── Shared LangGraph plumbing ────────────────────────────────────────────────
//
// All GM graphs share the same StateAnnotation, ToolNode, and graph skeleton.
// Each graph receives its full initial message list (system + human) at invoke
// time, so system prompts are built dynamically from live game state.

import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import type { BaseMessage } from "@langchain/core/messages";
import {
  AIMessage,
  HumanMessage,
  SystemMessage,
} from "@langchain/core/messages";
import type { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ALL_TOOLS } from "../tools.ts";

// ─── Shared state ─────────────────────────────────────────────────────────────

export const GMStateAnnotation = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (prev, next) => [...prev, ...next],
    default: () => [],
  }),
  output: Annotation<string>({
    reducer: (_prev, next) => next,
    default: () => "",
  }),
});

export type GMState = typeof GMStateAnnotation.State;

// ─── Tool node (shared across all graphs) ────────────────────────────────────

export const sharedToolNode = new ToolNode(ALL_TOOLS);

// ─── Routing ──────────────────────────────────────────────────────────────────

export function routeAfterAgent(state: GMState): "tools" | typeof END {
  const last = state.messages.at(-1);
  if (
    last instanceof AIMessage &&
    Array.isArray(last.tool_calls) &&
    last.tool_calls.length > 0
  ) {
    return "tools";
  }
  return END;
}

// ─── Output extraction node ───────────────────────────────────────────────────

export function extractOutputNode(state: GMState): Partial<GMState> {
  const last = state.messages.at(-1);
  if (!last) return {};
  const content = typeof last.content === "string"
    ? last.content
    : Array.isArray(last.content)
    ? (last.content as Array<{ type?: string; text?: string }>)
      .filter((p) => p.type === "text")
      .map((p) => p.text ?? "")
      .join("")
    : "";
  return { output: content };
}

// ─── Agent node factory ───────────────────────────────────────────────────────
//
// Returns a node function that simply invokes the model with all current
// messages. The system prompt is expected to already be in state.messages[0]
// as a SystemMessage when the graph is first invoked.

export function makeAgentNode(model: ChatGoogleGenerativeAI) {
  const bound = model.bindTools(ALL_TOOLS);
  return async (state: GMState): Promise<Partial<GMState>> => {
    const response = await bound.invoke(state.messages);
    return { messages: [response] };
  };
}

// ─── Graph factory ────────────────────────────────────────────────────────────

export function buildGraph(model: ChatGoogleGenerativeAI) {
  const agentNode = makeAgentNode(model);

  const graph = new StateGraph(GMStateAnnotation)
    .addNode("agent", agentNode)
    .addNode("tools", sharedToolNode)
    .addNode("extract_output", extractOutputNode)
    .addEdge(START, "agent")
    .addConditionalEdges("agent", routeAfterAgent, {
      tools: "tools",
      [END]: "extract_output",
    })
    .addEdge("tools", "agent")
    .addEdge("extract_output", END);

  return graph.compile();
}

export type CompiledGMGraph = ReturnType<typeof buildGraph>;

// ─── Invoke helper ────────────────────────────────────────────────────────────
//
// All specialised graphs call this with their system prompt + human message.
// Returns the final AI text output.

export async function invokeGraph(
  graph: CompiledGMGraph,
  systemPrompt: string,
  humanMessage: string,
): Promise<string> {
  const result = await graph.invoke({
    messages: [
      new SystemMessage(systemPrompt),
      new HumanMessage(humanMessage),
    ],
    output: "",
  });
  return (result as GMState).output ?? "";
}

export { AIMessage, HumanMessage, SystemMessage };
