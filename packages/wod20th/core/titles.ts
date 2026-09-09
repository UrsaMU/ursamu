// core/titles.ts -- Earned titles ("Bane Killer", etc.) + threshold engine.
//
// Garou prize titles. A title is a one-time achievement: when its
// criterion crosses, the title is added to `char.titles` and a fixed
// temp-renown award is granted (via awardRenown). Re-earning is a
// no-op. Titles do NOT auto-decay; staff prunes via +title/revoke.
//
// Criteria are pure functions of IWoDChar (read npcKills, scars,
// renown, etc.). Add new titles to WTA_TITLES; the engine handles
// awarding via maybeAwardTitles().

import type { IWoDChar } from "./types.ts";
import { awardRenown, type RenownTrack } from "./renown.ts";

export interface ITitleDef {
  slug: string;
  /** Display form -- "Bane Killer", "Spiral Breaker". Used in poses. */
  name: string;
  /** Short flavor printed by +title/info. */
  description: string;
  /** Temp-renown reward granted ON earning the title (one-shot). */
  reward: { track: RenownTrack; amount: number };
  /** Returns true when this title's criterion is met. */
  criterion: (char: IWoDChar) => boolean;
}

const def = (t: ITitleDef): ITitleDef => t;

export const WTA_TITLES: Record<string, ITitleDef> = {
  // -- Kill-count titles ------------------------------------------------
  "bane-killer": def({
    slug: "bane-killer", name: "Bane Killer",
    description: "Has slain 5 banes; the corruption-spirits know their name.",
    reward: { track: "glory", amount: 1 },
    criterion: (c) => (c.npcKills?.bane ?? 0) >= 5,
  }),
  "bane-scourge": def({
    slug: "bane-scourge", name: "Scourge of Banes",
    description: "Has slain 25 banes. Mention of their name purges weak spirits.",
    reward: { track: "glory", amount: 2 },
    criterion: (c) => (c.npcKills?.bane ?? 0) >= 25,
  }),
  "fomor-hunter": def({
    slug: "fomor-hunter", name: "Fomor Hunter",
    description: "Has put down 5 Wyrm-touched mortals.",
    reward: { track: "honor", amount: 1 },
    criterion: (c) => (c.npcKills?.fomor ?? 0) >= 5,
  }),
  "spiral-breaker": def({
    slug: "spiral-breaker", name: "Spiral Breaker",
    description: "Has felled a Black Spiral Dancer in single combat.",
    reward: { track: "glory", amount: 2 },
    criterion: (c) => (c.npcKills?.bsd ?? 0) >= 1,
  }),
  "spiral-end": def({
    slug: "spiral-end", name: "End of Spirals",
    description: "Has cut down 5 Black Spirals; their dance ends in your shadow.",
    reward: { track: "glory", amount: 3 },
    criterion: (c) => (c.npcKills?.bsd ?? 0) >= 5,
  }),
  "hellhound-tracker": def({
    slug: "hellhound-tracker", name: "Hellhound Tracker",
    description: "Has run down 3 of the Wyrm's hounds.",
    reward: { track: "wisdom", amount: 1 },
    criterion: (c) => (c.npcKills?.creature ?? 0) >= 3,
  }),
  // -- Composite / scar-based titles -----------------------------------
  "war-scarred": def({
    slug: "war-scarred", name: "War-Scarred",
    description: "Bears three or more permanent battle scars.",
    reward: { track: "glory", amount: 1 },
    criterion: (c) => (c.scars?.length ?? 0) >= 3,
  }),
  "the-marked": def({
    slug: "the-marked", name: "The Marked",
    description: "Bears five or more permanent battle scars. Living legend.",
    reward: { track: "honor", amount: 1 },
    criterion: (c) => (c.scars?.length ?? 0) >= 5,
  }),
};

/** Lookup with own-property guard. */
export function getTitle(slug: string): ITitleDef | undefined {
  const key = (slug ?? "").toLowerCase().trim();
  if (!key) return undefined;
  if (!Object.prototype.hasOwnProperty.call(WTA_TITLES, key)) return undefined;
  return WTA_TITLES[key];
}

export function allTitles(): ITitleDef[] {
  return Object.values(WTA_TITLES);
}

export interface ITitleAward {
  slug: string;
  name: string;
  track: RenownTrack;
  amount: number;
}

/**
 * Scan all titles; for any whose criterion is met and which the char
 * does not yet hold, add the slug to char.titles and apply the temp
 * renown reward. Returns the list of newly-awarded titles for the
 * caller to narrate. Mutates `char` in-place; caller persists.
 */
export function maybeAwardTitles(char: IWoDChar): ITitleAward[] {
  const owned = new Set(char.titles ?? []);
  const awarded: ITitleAward[] = [];
  for (const t of allTitles()) {
    if (owned.has(t.slug)) continue;
    if (!t.criterion(char)) continue;
    char.titles = [...(char.titles ?? []), t.slug];
    owned.add(t.slug);
    awardRenown(char, t.reward.track, t.reward.amount);
    awarded.push({
      slug: t.slug, name: t.name,
      track: t.reward.track, amount: t.reward.amount,
    });
  }
  return awarded;
}
