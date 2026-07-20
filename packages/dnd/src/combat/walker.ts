/**
 * D&D façade over @ursamu/combat walker.
 */
import {
  advanceTurnSmart as coreAdvance,
  type Encounter,
} from "@ursamu/combat";
import type { IUrsamuSDK } from "@ursamu/ursamu";
import {
  dndEncounterStore,
  initDndCombat,
  makeDndPorts,
} from "./ports.ts";

export async function advanceTurnSmart(
  encounterId: string,
  u: IUrsamuSDK,
): Promise<Encounter | null> {
  initDndCombat();
  return await coreAdvance(encounterId, {
    ports: makeDndPorts(u),
    store: dndEncounterStore,
  });
}

export type { Encounter };
