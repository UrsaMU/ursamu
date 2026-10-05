import type { RulingResult } from "./types.ts";

const LINES: Record<RulingResult, string> = {
  holds: "The city lets it stand.",
  hitch: "It works — and something notices.",
  fails: "The week will not give you this.",
};

export function rulingProse(result: RulingResult): string {
  return LINES[result];
}
