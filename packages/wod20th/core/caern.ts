// core/caern.ts -- Caern mechanical bonus resolver.
//
// Pure function: given a character and the room they're in, return the
// mechanical bonuses a bound caern grants. Feature-flag style -- callers
// in regen.ts / rite.ts may consult this and apply if non-zero. We do
// NOT wire bonuses into combat rolls; ST applies via +bonus as needed.
//
// Bonuses scale with caern level:
//   gnosisRate     -- multiplier on the default Gnosis regen tick
//                     (1.0 = no bonus, 1.5 = +50%).
//   ritualDieBonus -- flat dice added to mystic / rite rolls in the room.
//
//   level 1 -> rate 1.25, dice +0
//   level 2 -> rate 1.25, dice +1
//   level 3 -> rate 1.50, dice +1
//   level 4 -> rate 1.50, dice +2
//   level 5 -> rate 2.00, dice +2

import type { IWoDChar } from "./types.ts";
import type { ICaern } from "../db/caernDb.ts";

export interface ICaernBonus {
  gnosisRate?: number;
  ritualDieBonus?: number;
}

interface IRoomLike {
  state?: { caernId?: string } & Record<string, unknown>;
}

/**
 * Resolve the caern bonus for `char` while in `here`. Pure: callers pass
 * the resolved caern record (or null) so this stays sync and testable.
 * Returns an empty object when no bonus applies (e.g. mortal in a caern,
 * or no caern bound). Garou only -- Kinfolk are not attuned in this v1.
 */
export function caernBonus(
  char: IWoDChar | null | undefined,
  caern: ICaern | null | undefined,
): ICaernBonus {
  if (!char || !caern) return {};
  if (char.splat !== "wta") return {};
  switch (caern.level) {
    case 1: return { gnosisRate: 1.25, ritualDieBonus: 0 };
    case 2: return { gnosisRate: 1.25, ritualDieBonus: 1 };
    case 3: return { gnosisRate: 1.5,  ritualDieBonus: 1 };
    case 4: return { gnosisRate: 1.5,  ritualDieBonus: 2 };
    case 5: return { gnosisRate: 2.0,  ritualDieBonus: 2 };
    default: return {};
  }
}

/**
 * Convenience: pull the caern id out of a room's state, if any. Returns
 * undefined when the room isn't bound to a caern.
 */
export function caernIdForRoom(here: IRoomLike | null | undefined): string | undefined {
  return here?.state?.caernId;
}
