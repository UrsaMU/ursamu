/**
 * Pronouns from object SEX attribute (TinyMUX-compatible).
 * SEX: male/m, female/f, plural/they/t → they/them, else it.
 */
import type { IDBObj, IUrsamuSDK } from "@ursamu/ursamu";

export type PronounSex = "male" | "female" | "neutral" | "plural";

export type PronounSet = {
  subj: string; // he / she / it / they
  obj: string; // him / her / it / them
  poss: string; // his / her / its / their
  abs: string; // his / hers / its / theirs
  isAre: string; // is / are
  hasHave: string; // has / have
  wasWere: string; // was / were
  s: string; // "" for they, "s" for he/she/it (verb ending)
};

const SETS: Record<PronounSex, PronounSet> = {
  male: {
    subj: "he",
    obj: "him",
    poss: "his",
    abs: "his",
    isAre: "is",
    hasHave: "has",
    wasWere: "was",
    s: "s",
  },
  female: {
    subj: "she",
    obj: "her",
    poss: "her",
    abs: "hers",
    isAre: "is",
    hasHave: "has",
    wasWere: "was",
    s: "s",
  },
  neutral: {
    subj: "it",
    obj: "it",
    poss: "its",
    abs: "its",
    isAre: "is",
    hasHave: "has",
    wasWere: "was",
    s: "s",
  },
  plural: {
    subj: "they",
    obj: "them",
    poss: "their",
    abs: "theirs",
    isAre: "are",
    hasHave: "have",
    wasWere: "were",
    s: "",
  },
};

export function parseSex(raw: string | undefined | null): PronounSex {
  const s = String(raw ?? "").toLowerCase().trim();
  if (s.startsWith("m")) return "male";
  if (s.startsWith("f")) return "female";
  if (s.startsWith("p") || s.startsWith("t")) return "plural";
  // they/them written out
  if (s.includes("they") || s.includes("them")) return "plural";
  return "neutral";
}

export function pronounsFor(sex: PronounSex): PronounSet {
  return SETS[sex];
}

/** Cap first letter: He / She / They */
export function cap(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

/**
 * Read SEX from attr pipeline, then state.sex / finger PRONOUNS.
 */
export async function readSex(
  u: IUrsamuSDK,
  obj: IDBObj,
): Promise<PronounSex> {
  try {
    const attr = await u.attr?.get?.(obj.id, "SEX");
    if (attr) return parseSex(attr);
  } catch {
    /* fall through */
  }
  const st = obj.state as Record<string, unknown> | undefined;
  if (st?.sex != null) return parseSex(String(st.sex));
  // finger PRONOUNS field sometimes holds she/her
  const finger = st?.finger as Record<string, unknown> | undefined;
  const pr = finger?.pronouns ?? st?.pronouns;
  if (typeof pr === "string") {
    const low = pr.toLowerCase();
    if (low.startsWith("she") || low.includes("she/")) return "female";
    if (low.startsWith("he") || low.includes("he/")) return "male";
    if (low.includes("they")) return "plural";
  }
  // Unset SEX on players → they/them (not TinyMUX "it")
  if (obj.flags?.has?.("player")) return "plural";
  return "neutral";
}

export async function pronounsOf(
  u: IUrsamuSDK,
  obj: IDBObj,
): Promise<PronounSet> {
  return pronounsFor(await readSex(u, obj));
}
