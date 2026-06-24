import type { LangDef } from "./schema.ts";
import { pick, weightedPick } from "./rng.ts";

export function genSyllable(def: LangDef, rng: () => number, isLast: boolean): string {
  const pat = pick(def.syllablePatterns, rng);
  let out = "";
  let sawVowel = false;
  for (let i = 0; i < pat.length; i++) {
    const c = pat[i];
    if (c === "V") {
      out += pick(def.nuclei, rng);
      sawVowel = true;
    } else {
      const useCoda = sawVowel && (i === pat.length - 1) && isLast && def.codas.length > 0;
      out += pick(useCoda ? def.codas : def.onsets, rng);
    }
  }
  return out;
}

export function genWord(def: LangDef, rng: () => number, approxLen?: number): string {
  const syllables = approxLen ?? (weightedPick(def.wordLenWeights, rng) + 1);
  let w = "";
  for (let i = 0; i < syllables; i++) {
    w += genSyllable(def, rng, i === syllables - 1);
  }
  return w;
}

export function syllableCountFor(wordLen: number): number {
  if (wordLen <= 2) return 1;
  if (wordLen <= 5) return 2;
  if (wordLen <= 8) return 3;
  return Math.min(5, Math.ceil(wordLen / 3));
}

export function applyCapitalization(word: string, original: string, mode: LangDef["capitalize"]): string {
  if (mode === "all") return word.toUpperCase();
  if (mode === "none") return word.toLowerCase();
  if (original.length > 0 && original[0] === original[0].toUpperCase() && /[a-z]/i.test(original[0])) {
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  }
  return word.toLowerCase();
}
