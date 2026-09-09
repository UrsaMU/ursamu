// core/renownThresholds.ts -- Per-auspice cumulative-permanent renown
// requirements for ranks 2-5 (W20 / Werewolf Revised canon).
//
// Each auspice has a weighted track emphasis. Numbers are CUMULATIVE
// permanent renown -- i.e. the total perm a character must reach in each
// track to be eligible for that rank. Rank 1 (Cliath) is the start state.
//
// Source: M20 / Werewolf Revised auspice rank tables (player's guide).

import type { IWoDChar } from "./types.ts";

export type Auspice = "ragabash" | "theurge" | "philodox" | "galliard" | "ahroun";

export interface RenownReq {
  glory: number;
  honor: number;
  wisdom: number;
}

export type AdvanceableRank = 2 | 3 | 4 | 5;

export const RENOWN_THRESHOLDS: Record<Auspice, Record<AdvanceableRank, RenownReq>> = {
  // Trickster -- balanced low requirements.
  ragabash: {
    2: { glory: 1,  honor: 1,  wisdom: 1  },
    3: { glory: 3,  honor: 3,  wisdom: 3  },
    4: { glory: 8,  honor: 8,  wisdom: 8  },
    5: { glory: 15, honor: 15, wisdom: 15 },
  },
  // Seer -- Wisdom primary.
  theurge: {
    2: { glory: 0,  honor: 0,  wisdom: 3  },
    3: { glory: 3,  honor: 3,  wisdom: 7  },
    4: { glory: 8,  honor: 8,  wisdom: 13 },
    5: { glory: 15, honor: 15, wisdom: 19 },
  },
  // Judge -- Honor primary.
  philodox: {
    2: { glory: 0,  honor: 3,  wisdom: 0  },
    3: { glory: 3,  honor: 7,  wisdom: 3  },
    4: { glory: 8,  honor: 13, wisdom: 8  },
    5: { glory: 15, honor: 19, wisdom: 15 },
  },
  // Moon-dancer -- Glory primary.
  galliard: {
    2: { glory: 3,  honor: 0,  wisdom: 0  },
    3: { glory: 7,  honor: 3,  wisdom: 3  },
    4: { glory: 13, honor: 8,  wisdom: 7  },
    5: { glory: 19, honor: 15, wisdom: 13 },
  },
  // Warrior -- Glory primary.
  ahroun: {
    2: { glory: 3,  honor: 0,  wisdom: 0  },
    3: { glory: 7,  honor: 3,  wisdom: 3  },
    4: { glory: 13, honor: 8,  wisdom: 7  },
    5: { glory: 19, honor: 15, wisdom: 13 },
  },
};

const AUSPICE_IDS: Auspice[] = ["ragabash", "theurge", "philodox", "galliard", "ahroun"];

export function normaliseAuspice(raw: string | undefined | null): Auspice | null {
  if (!raw) return null;
  const id = raw.toLowerCase().trim();
  return (AUSPICE_IDS as string[]).includes(id) ? (id as Auspice) : null;
}

/** Cumulative-permanent requirement to reach `rank` for `auspice`. */
export function thresholdFor(auspice: Auspice, rank: AdvanceableRank): RenownReq {
  return RENOWN_THRESHOLDS[auspice][rank];
}

/** True if perm meets/exceeds each track in req. */
export function meetsRank(perm: RenownReq, req: RenownReq): boolean {
  return perm.glory  >= req.glory
      && perm.honor  >= req.honor
      && perm.wisdom >= req.wisdom;
}

/** Highest rank (1-5) an auspice with the given permanent renown is eligible for. */
export function highestEligibleRank(auspice: Auspice, perm: RenownReq): 1 | 2 | 3 | 4 | 5 {
  for (let r = 5; r >= 2; r--) {
    if (meetsRank(perm, RENOWN_THRESHOLDS[auspice][r as AdvanceableRank])) {
      return r as 2 | 3 | 4 | 5;
    }
  }
  return 1;
}

/** Convenience: extract perm (or zeros). Mutation-safe copy. */
export function permOf(char: IWoDChar): RenownReq {
  const r = char.renown ?? { glory: 0, honor: 0, wisdom: 0 };
  return { glory: r.glory, honor: r.honor, wisdom: r.wisdom };
}
