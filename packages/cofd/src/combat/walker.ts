/**
 * CofD façade over @ursamu/combat walker.
 *
 * Keeps the historical signature advanceTurnSmart(id, u) used by
 * commands and tests. All turn logic lives in @ursamu/combat.
 */
import {
  advanceTurnSmart as coreAdvance,
  type Encounter,
} from "@ursamu/combat";
import type { IUrsamuSDK } from "@ursamu/ursamu";
import {
  cofdEncounterStore,
  initCofdCombat,
  makeCofdPorts,
} from "./ports.ts";
import { getEncounterForRoom } from "./encounter.ts";

/**
 * AI-aware turn walker. Pumps the encounter until the next live PC
 * turn, all NPCs out, manual AI, or maxRounds safety cap.
 */
export async function advanceTurnSmart(
  encounterId: string,
  u: IUrsamuSDK,
): Promise<Encounter | null> {
  // Safe if init() already ran; keeps unit tests self-contained.
  initCofdCombat();
  return await coreAdvance(encounterId, {
    ports: makeCofdPorts(u),
    store: cofdEncounterStore,
  });
}

/** Convenience: smart-advance the active encounter in u.here. */
export async function smartNext(
  u: IUrsamuSDK,
): Promise<Encounter | null> {
  // deno-lint-ignore no-explicit-any
  const here = (u as any).here;
  const roomId = here?.id as string | undefined;
  if (!roomId) return null;
  const enc = await getEncounterForRoom(roomId);
  if (!enc) return null;
  return await advanceTurnSmart(enc.id, u);
}

// Re-export for callers that only need the type.
export type { Encounter };
