import { pick } from "./rng.ts";

export function genWordMarkov(
  corpus: readonly string[],
  order: number,
  rng: () => number,
  approxLen?: number,
): string {
  if (!corpus || corpus.length === 0) return "garble";
  const actualOrder = Math.max(1, Math.min(5, Math.floor(order)));
  const transitions: Record<string, string[]> = {};
  const startState = "^".repeat(actualOrder);

  for (const word of corpus) {
    const w = startState + word.toLowerCase() + "$";
    for (let i = 0; i < w.length - actualOrder; i++) {
      const state = w.slice(i, i + actualOrder);
      const nextChar = w[i + actualOrder];
      if (!transitions[state]) {
        transitions[state] = [];
      }
      transitions[state].push(nextChar);
    }
  }

  const generateOne = (): string => {
    let state = startState;
    let word = "";
    while (word.length < 20) {
      const nexts = transitions[state];
      if (!nexts || nexts.length === 0) break;
      const nextChar = pick(nexts, rng);
      if (nextChar === "$") break;
      word += nextChar;
      state = (state + nextChar).slice(-actualOrder);
    }
    return word;
  };

  if (approxLen !== undefined) {
    let bestWord = "";
    let bestDiff = Infinity;
    for (let i = 0; i < 10; i++) {
      const candidate = generateOne();
      const diff = Math.abs(candidate.length - approxLen);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestWord = candidate;
      }
      if (bestDiff === 0) break;
    }
    return bestWord || "garble";
  }

  return generateOne() || "garble";
}
