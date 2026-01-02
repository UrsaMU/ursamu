import type { IParserContext } from "../types.ts";

export type SoftcodeFunction = (
  args: string[],
  data: Record<string, unknown>,
  context?: IParserContext
) => Promise<string> | string;

const registry = new Map<string, SoftcodeFunction>();

export const registerFunction = (name: string, func: SoftcodeFunction) => {
  registry.set(name.toLowerCase(), func);
};

export const getFunction = (name: string): SoftcodeFunction | undefined => {
  return registry.get(name.toLowerCase());
};
