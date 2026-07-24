import type { LangDef } from "./schema.ts";
import { mulberry32, seedFor } from "./rng.ts";
import {
  applyCapitalization,
  genWord,
  syllableCountFor,
} from "./phonemes.ts";
import { genWordMarkov } from "./markov.ts";

export interface SkillTier {
  bucket: number;
  passThrough: number;
  preserveLength: boolean;
  accent: boolean;
}

export function tierFor(skill: number): SkillTier {
  const s = Math.max(0, Math.min(100, Math.floor(skill)));
  if (s >= 91) {
    return {
      bucket: 4,
      passThrough: 1.0,
      preserveLength: true,
      accent: false,
    };
  }
  if (s >= 61) {
    return {
      bucket: 3,
      passThrough: 0.70,
      preserveLength: true,
      accent: true,
    };
  }
  if (s >= 26) {
    return {
      bucket: 2,
      passThrough: 0.30,
      preserveLength: true,
      accent: true,
    };
  }
  if (s >= 1) {
    return {
      bucket: 1,
      passThrough: 0.0,
      preserveLength: true,
      accent: false,
    };
  }
  return {
    bucket: 0,
    passThrough: 0.0,
    preserveLength: false,
    accent: false,
  };
}

const WORD_RE = /([A-Za-z']+)|([^A-Za-z']+)/g;

function applyAccent(word: string, subs: Record<string, string>): string {
  let out = word;
  for (const [k, v] of Object.entries(subs)) {
    out = out.split(k).join(v);
  }
  return out;
}

export function garble(
  text: string,
  def: LangDef,
  skill: number,
): string {
  const tier = tierFor(skill);
  if (tier.bucket === 4) return text;

  let result = "";
  for (const match of text.matchAll(WORD_RE)) {
    const word = match[1];
    if (!word) {
      result += match[0];
      continue;
    }

    const seed = seedFor(word, def.name, tier.bucket);
    const rng = mulberry32(seed);

    if (tier.passThrough > 0 && rng() < tier.passThrough) {
      result += tier.accent && def.accentSubs
        ? applyAccent(word, def.accentSubs)
        : word;
      continue;
    }

    let fake: string;
    if (def.mode === "markov") {
      const approxLen = tier.preserveLength ? word.length : undefined;
      fake = genWordMarkov(
        def.markovCorpus ?? [],
        def.markovOrder ?? 2,
        rng,
        approxLen,
      );
    } else {
      const targetSyllables = tier.preserveLength
        ? syllableCountFor(word.length)
        : undefined;
      fake = genWord(def, rng, targetSyllables);
    }
    result += applyCapitalization(fake, word, def.capitalize ?? "first");
  }
  return result;
}
