/**
 * Shared turn UX helpers — games call these from +init / +pass / +end
 * instead of reimplementing join + advance + walker glue.
 */
import type { Encounter } from "./types.ts";
import { appendEncounterLog } from "./types.ts";
import type { CombatPorts } from "./ports.ts";
import {
  getEncounterStore,
  type EncounterStore,
} from "./store.ts";
import {
  beginEncounter,
  endEncounter,
  findRoomEncounter,
  joinEncounter,
  nextTurn,
  startEncounter,
  type JoinParticipant,
  type LifecycleOptions,
} from "./lifecycle.ts";
import { advanceTurnSmart } from "./walker.ts";

export interface TurnHelperOptions extends LifecycleOptions {
  ports?: CombatPorts;
}

function storeOf(opts?: TurnHelperOptions): EncounterStore {
  return opts?.store ?? getEncounterStore();
}

export interface StartOrJoinOptions extends TurnHelperOptions {
  roomId: string;
  participant: JoinParticipant;
  /** Encounter display name when creating. */
  name?: string;
  /** Force encounter id when creating. */
  id?: string;
  /** Who opened the fight (stored on encounter). */
  startedBy?: string;
  /**
   * If true and encounter is still intent after join, roll init
   * and activate (requires ports).
   */
  autoBegin?: boolean;
  /** Append a log line on create/join. */
  logLine?: string;
}

export interface StartOrJoinResult {
  encounter: Encounter;
  created: boolean;
  joined: boolean;
}

/**
 * Find or create room encounter, then join the participant.
 * Optionally begin (roll initiative) when still in intent.
 */
export async function startOrJoin(
  opts: StartOrJoinOptions,
): Promise<StartOrJoinResult | null> {
  const store = storeOf(opts);
  let created = false;
  let enc = await findRoomEncounter(opts.roomId, { store });

  if (!enc || enc.status === "resolved") {
    enc = await startEncounter(opts.roomId, {
      store,
      name: opts.name,
      id: opts.id,
    });
    if (opts.startedBy) {
      enc = {
        ...enc,
        startedBy: opts.startedBy,
      };
      await store.save(enc);
    }
    created = true;
  }

  const before = enc.participants.some(
    (p) => p.actorId === opts.participant.actorId,
  );
  const afterJoin = await joinEncounter(enc.id, opts.participant, {
    store,
    ports: opts.ports,
  });
  if (!afterJoin) return null;
  enc = afterJoin;
  const joined = !before;

  if (opts.logLine) {
    enc = appendEncounterLog(enc, opts.logLine);
    await store.save(enc);
  }

  if (
    opts.autoBegin &&
    enc.status === "intent" &&
    opts.ports &&
    enc.participants.length > 0
  ) {
    const begun = await beginEncounter(enc.id, {
      store,
      ports: opts.ports,
    });
    if (begun) enc = begun;
  }

  return { encounter: enc, created, joined };
}

export interface PassTurnOptions extends TurnHelperOptions {
  /** Required: who is passing. */
  actorId: string;
  /**
   * If true (default), actor must be current turn (or staff via force).
   */
  requireCurrent?: boolean;
  /** Bypass current-turn check (staff). */
  force?: boolean;
  /** Mark actionUsed on actor before advancing. */
  markActed?: boolean;
  /** Run NPC walker after advancing (default true when ports set). */
  walk?: boolean;
  logLine?: string;
}

export type PassTurnError =
  | "not_found"
  | "not_active"
  | "not_in_fight"
  | "not_your_turn";

export interface PassTurnResult {
  encounter: Encounter | null;
  error?: PassTurnError;
  walked: boolean;
}

/**
 * End the current actor's turn and optionally run the NPC walker.
 */
export async function passTurn(
  encounterId: string,
  opts: PassTurnOptions,
): Promise<PassTurnResult> {
  const store = storeOf(opts);
  let enc = await store.get(encounterId);
  if (!enc) return { encounter: null, error: "not_found", walked: false };
  if (enc.status !== "active") {
    return { encounter: enc, error: "not_active", walked: false };
  }

  const idx = enc.participants.findIndex(
    (p) => p.actorId === opts.actorId,
  );
  if (idx < 0) {
    return { encounter: enc, error: "not_in_fight", walked: false };
  }

  const requireCurrent = opts.requireCurrent !== false;
  if (requireCurrent && !opts.force) {
    const cur = enc.participants[enc.turnIdx];
    if (cur && cur.actorId !== opts.actorId) {
      return { encounter: enc, error: "not_your_turn", walked: false };
    }
  }

  if (opts.markActed !== false) {
    const patched = await store.patchParticipant(
      encounterId,
      opts.actorId,
      { actionUsed: true },
    );
    if (patched) enc = patched;
  }

  if (opts.logLine) {
    enc = appendEncounterLog(enc, opts.logLine);
    await store.save(enc);
  }

  await nextTurn(encounterId, { store });

  const walk = opts.walk ?? !!opts.ports;
  if (walk && opts.ports) {
    const walked = await advanceTurnSmart(encounterId, {
      ports: opts.ports,
      store,
    });
    return { encounter: walked, walked: true };
  }

  enc = (await store.get(encounterId)) ?? enc;
  return { encounter: enc, walked: false };
}

export interface EndFightOptions extends TurnHelperOptions {
  /** Call ports.onResolved after status flip (default true). */
  runOnResolved?: boolean;
  logLine?: string;
}

/**
 * Resolve encounter; optionally run host onResolved (loot/beats).
 */
export async function endFight(
  encounterId: string,
  opts?: EndFightOptions,
): Promise<Encounter | null> {
  const store = storeOf(opts);
  let enc = await store.get(encounterId);
  if (!enc) return null;

  if (opts?.logLine) {
    enc = appendEncounterLog(enc, opts.logLine);
    await store.save(enc);
  }

  enc = await endEncounter(encounterId, { store });
  if (!enc) return null;

  const run = opts?.runOnResolved !== false;
  if (run && opts?.ports?.onResolved) {
    return (await opts.ports.onResolved(enc)) ?? enc;
  }
  return enc;
}

/** Plain-text initiative lines for host formatting. */
export function formatInitiativeLines(
  enc: Encounter,
  opts?: { currentMarker?: string; otherMarker?: string },
): string[] {
  const cur = opts?.currentMarker ?? "->";
  const oth = opts?.otherMarker ?? "  ";
  return enc.participants.map((p, i) => {
    const mark = i === enc.turnIdx ? cur : oth;
    const tags: string[] = [];
    if (p.isOut) tags.push("out");
    if (p.actionUsed) tags.push("acted");
    if (p.delayed) tags.push("held");
    const tagStr = tags.length ? ` [${tags.join(",")}]` : "";
    const init = String(p.initiative).padStart(3);
    return `${mark} ${init}  ${p.name}${tagStr}`;
  });
}

/** Current participant or null. */
export function currentActor(
  enc: Encounter,
): Encounter["participants"][number] | null {
  return enc.participants[enc.turnIdx] ?? null;
}
