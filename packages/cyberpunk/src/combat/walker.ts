/**
 * CPR façade over @ursamu/combat walker.
 */
import {
  advanceTurnSmart as coreAdvance,
  type Encounter,
} from "@ursamu/combat";
import type { IUrsamuSDK } from "@ursamu/mush";
import {
  cprEncounterStore,
  initCprCombat,
  makeCprPorts,
} from "./ports.ts";

export async function advanceTurnSmart(
  encounterId: string,
  u: IUrsamuSDK,
): Promise<Encounter | null> {
  initCprCombat();
  return await coreAdvance(encounterId, {
    ports: makeCprPorts(u),
    store: cprEncounterStore,
  });
}

export type { Encounter };
