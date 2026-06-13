// Typed re-exports of the Werewolf: The Forsaken 2e auspices, tribes, renown,
// forms, gifts, and rites.

const url = new URL("../../resources/werewolf.json", import.meta.url);
const data = JSON.parse(Deno.readTextFileSync(url));

export interface WtfAuspice {
  readonly name: string;
  readonly moon: string;
  readonly renown: string;
  readonly hunterAspect: string;
  readonly skills: readonly string[];
  readonly benefit: string;
  readonly description: string;
}

export interface WtfTribe {
  readonly name: string;
  readonly firstborn: string;
  readonly renown: string;
  readonly gifts: readonly string[];
  readonly ban: string;
  readonly description: string;
}

export interface WtfRenown {
  readonly name: string;
  readonly auspice: string;
  readonly tribe: string;
  readonly description: string;
}

export interface WtfForm {
  readonly name: string;
  readonly label: string;
  readonly description: string;
}

export interface WtfFacet {
  readonly name: string;
  readonly renown: string;
  readonly dots?: number;
  readonly cost: string;
  readonly dicePool: string;
  readonly action: string;
  readonly duration: string;
  readonly summary: string;
}

export interface WtfGift {
  readonly name: string;
  readonly type: "moon" | "shadow" | "wolf";
  readonly auspice?: string;
  readonly renownAffinity?: string;
  readonly facets: readonly WtfFacet[];
}

export interface WtfRite {
  readonly name: string;
  readonly type: "wolf" | "pack";
  readonly rank: number;
  readonly cost: string;
  readonly dicePool: string;
  readonly action: string;
  readonly duration: string;
  readonly summary: string;
}

const freezeAll = <T>(items: T[]): readonly T[] =>
  Object.freeze(items.map((i) => Object.freeze({ ...i })));

export const WTF_AUSPICES: readonly WtfAuspice[] = Object.freeze(
  (data.auspices as WtfAuspice[]).map((a) =>
    Object.freeze({ ...a, skills: Object.freeze([...a.skills]) })
  ),
);

export const WTF_TRIBES: readonly WtfTribe[] = Object.freeze(
  (data.tribes as WtfTribe[]).map((t) =>
    Object.freeze({ ...t, gifts: Object.freeze([...t.gifts]) })
  ),
);

export const WTF_RENOWN: readonly WtfRenown[] = freezeAll(data.renown as WtfRenown[]);

export const WTF_FORMS: readonly WtfForm[] = freezeAll(data.forms as WtfForm[]);

export const WTF_GIFTS: readonly WtfGift[] = Object.freeze(
  (data.gifts as WtfGift[]).map((g) =>
    Object.freeze({
      ...g,
      facets: Object.freeze((g.facets as WtfFacet[]).map((f) => Object.freeze({ ...f }))),
    })
  ),
);

export const WTF_RITES: readonly WtfRite[] = freezeAll(data.rites as WtfRite[]);

export const WTF_AUSPICE_NAMES: readonly string[] = Object.freeze(
  WTF_AUSPICES.map((a) => a.name),
);

export const WTF_TRIBE_NAMES: readonly string[] = Object.freeze(
  WTF_TRIBES.map((t) => t.name),
);

export const WTF_RENOWN_NAMES: readonly string[] = Object.freeze(
  WTF_RENOWN.map((r) => r.name),
);

export function findAuspice(name: string): WtfAuspice | null {
  const q = name.trim().toLowerCase();
  return WTF_AUSPICES.find((a) => a.name.toLowerCase() === q) ?? null;
}

export function findTribe(name: string): WtfTribe | null {
  const q = name.trim().toLowerCase();
  return WTF_TRIBES.find((t) => t.name.toLowerCase() === q) ?? null;
}

export function findRenown(name: string): WtfRenown | null {
  const q = name.trim().toLowerCase();
  return WTF_RENOWN.find((r) => r.name.toLowerCase() === q) ?? null;
}

export function findGift(name: string): WtfGift | null {
  const q = name.trim().toLowerCase();
  return WTF_GIFTS.find((g) => g.name.toLowerCase() === q) ?? null;
}

export function findRite(name: string): WtfRite | null {
  const q = name.trim().toLowerCase();
  return WTF_RITES.find((r) => r.name.toLowerCase() === q) ?? null;
}

/** All gifts of a given kind (moon | shadow | wolf). */
export function giftsByType(type: WtfGift["type"]): readonly WtfGift[] {
  return WTF_GIFTS.filter((g) => g.type === type);
}

/** Find a single facet by name across every gift; returns the facet and its parent gift. */
export function findFacet(name: string): { gift: WtfGift; facet: WtfFacet } | null {
  const q = name.trim().toLowerCase();
  for (const gift of WTF_GIFTS) {
    const facet = gift.facets.find((f) => f.name.toLowerCase() === q);
    if (facet) return { gift, facet };
  }
  return null;
}
