/**
 * Pluggable encounter persistence.
 * Default: combat.encounters DBO. Game systems may register their own
 * (e.g. cofd.encounters) so existing world data keeps working.
 */
import type { Encounter, Participant } from "./types.ts";
import {
  advanceTurn as defaultAdvanceTurn,
  encounterDb,
  patchParticipant as defaultPatch,
} from "./encounter.ts";

// deno-lint-ignore no-explicit-any
type Q = any;

export interface EncounterStore {
  get(id: string): Promise<Encounter | null>;
  /** Insert a new encounter document. */
  create(enc: Encounter): Promise<void>;
  /** Persist a full encounter document (activate, resolve, etc.). */
  save(enc: Encounter): Promise<void>;
  /**
   * Intent or active encounter in room (prefer active).
   * Optional — lifecycle falls back to null if missing.
   */
  findInRoom?(roomId: string): Promise<Encounter | null>;
  advanceTurn(id: string): Promise<Encounter | null>;
  patchParticipant(
    encounterId: string,
    actorId: string,
    patch: Partial<Participant>,
  ): Promise<Encounter | null>;
}

/** Built-in store on combat.encounters. */
export const defaultEncounterStore: EncounterStore = {
  async get(id) {
    return (await encounterDb.findOne({ id } as Q)) ?? null;
  },
  async create(enc) {
    await encounterDb.create(enc);
  },
  async save(enc) {
    await encounterDb.update({ id: enc.id } as Q, enc);
  },
  async findInRoom(roomId) {
    const rows = await encounterDb.query({
      roomId,
      status: { $in: ["intent", "active"] },
    } as Q);
    if (!rows.length) return null;
    return (
      rows.find((e) => e.status === "active") ?? rows[0] ?? null
    );
  },
  advanceTurn: defaultAdvanceTurn,
  patchParticipant: defaultPatch,
};

let _store: EncounterStore | null = null;

export function registerEncounterStore(store: EncounterStore): void {
  _store = store;
}

export function unregisterEncounterStore(): void {
  _store = null;
}

export function getEncounterStore(): EncounterStore {
  return _store ?? defaultEncounterStore;
}
