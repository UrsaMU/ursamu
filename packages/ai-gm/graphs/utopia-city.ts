import type { BaseChatModel } from
  "@langchain/core/language_models/chat_models";
import { buildGraph, invokeGraph } from "./base.ts";
import type { IInjectOptions } from "../context/injector.ts";
import { buildInjectedPrompt } from "../context/injector.ts";
import {
  type CityNarrationKind,
  cityHumanPrompt,
  UTOPIA_CITY_SUFFIX,
} from "../prompts/templates.ts";

export function buildCityGraph(model: BaseChatModel) {
  return buildGraph(model);
}

export interface ICityGraphInput {
  opts: IInjectOptions;
  kind: CityNarrationKind;
  summary: string;
}

export function runCityGraph(
  graph: ReturnType<typeof buildCityGraph>,
  input: ICityGraphInput,
): Promise<string> {
  const systemPrompt = buildInjectedPrompt({
    ...input.opts,
    graphSuffix: UTOPIA_CITY_SUFFIX,
  });
  return invokeGraph(
    graph,
    systemPrompt,
    cityHumanPrompt(input.kind, input.summary),
  );
}
