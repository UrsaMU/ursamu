/**
 * CofD CombatPorts + EncounterStore adapters for @ursamu/combat walker.
 */
import {
  type CombatActorView,
  type CombatPorts,
  type Encounter,
  type EncounterStore,
  type Participant,
  jsonStrategyBrain,
  registerCombatBrain,
  registerEncounterStore,
  unregisterEncounterStore,
} from "@ursamu/combat";
import {
  dbojs,
  send,
  sessions,
  type IDBObj,
  type IUrsamuSDK,
} from "@ursamu/ursamu";
import {
  cofdEncounterStore,
  getEncounterForRoom,
} from "./encounter.ts";
import {
  resolveScene,
  syncIsOut,
} from "./resolution.ts";
import { healthFracFromActor } from "./ai/compat.ts";
import { computeCofdInitiative } from "./initiative.ts";
import { executeAttack } from "../commands/attack.ts";
import { gearReload } from "../commands/gear.ts";
import type { CofdSheet } from "../stats/index.ts";

export { cofdEncounterStore };

// deno-lint-ignore no-explicit-any
type Q = any;

const DEFAULT_AI = "beshilu-swarmer";

function flagsSet(raw: unknown): Set<string> {
  if (raw instanceof Set) return raw as Set<string>;
  if (Array.isArray(raw)) return new Set(raw as string[]);
  if (typeof raw === "string") {
    return new Set(raw.split(/\s+/).filter(Boolean));
  }
  return new Set();
}

async function loadDbActor(
  u: IUrsamuSDK,
  id: string,
): Promise<IDBObj | null> {
  // deno-lint-ignore no-explicit-any
  const found = await u.db.search({ id } as any);
  return found[0] ?? null;
}

/**
 * SDK proxy: me = NPC, send → room broadcast (staff roll detail).
 */
export function makeNpcSdk(
  real: IUrsamuSDK,
  npc: IDBObj,
): IUrsamuSDK {
  // deno-lint-ignore no-explicit-any
  const here = (real as any).here;
  // deno-lint-ignore no-explicit-any
  const proxy: any = Object.assign({}, real);
  proxy.me = npc;
  proxy.send = (msg: string, _socketId?: string) => {
    if (msg.includes("ROLL DETAIL:")) {
      (async () => {
        try {
          const contents = await dbojs.query({
            location: npc.location,
          } as Q);
          const allSessions = sessions.list();
          for (const o of contents) {
            const flags = flagsSet(o.flags);
            const isStaff =
              flags.has("superuser") ||
              flags.has("admin") ||
              flags.has("wizard");
            if (isStaff && flags.has("connected")) {
              const socks = allSessions
                // deno-lint-ignore no-explicit-any
                .filter((s: any) => s.actorId === o.id)
                // deno-lint-ignore no-explicit-any
                .map((s: any) => s.socketId);
              if (socks.length) send(socks, msg);
            }
          }
        } catch (e: unknown) {
          console.error(
            "[cofd] NPC roll detail routing failed:",
            e,
          );
        }
      })().catch(console.error);
    } else if (here && typeof here.broadcast === "function") {
      here.broadcast(msg);
    }
  };
  proxy.broadcast = (msg: string) => {
    if (here && typeof here.broadcast === "function") {
      here.broadcast(msg);
    }
  };
  proxy.canEdit = () => Promise.resolve(true);
  proxy.cmd = {
    name: "",
    original: "",
    args: ["", ""],
    switches: [],
  };
  return proxy as IUrsamuSDK;
}

export function actorToCombatView(
  actor: IDBObj,
  kindHint?: "pc" | "npc",
): CombatActorView {
  const flags = flagsSet(actor.flags);
  const kind =
    kindHint ?? (flags.has("npc") ? "npc" : "pc");
  const sheet = actor.state?.cofd as
    | (CofdSheet & { npc?: { aiArchetype?: string } })
    | undefined;
  const aiKey = (
    sheet?.npc?.aiArchetype ?? DEFAULT_AI
  ).toLowerCase().trim();
  return {
    id: actor.id,
    name: actor.name ?? actor.id,
    kind,
    isOut: false,
    healthFrac: healthFracFromActor(actor),
    aiKey: kind === "npc" ? aiKey : undefined,
  };
}

/** Build per-call ports bound to the current command SDK. */
export function makeCofdPorts(u: IUrsamuSDK): CombatPorts {
  // deno-lint-ignore no-explicit-any
  const here = (u as any).here;

  return {
    async loadActor(id) {
      const actor = await loadDbActor(u, id);
      if (!actor) return null;
      return actorToCombatView(actor);
    },

    async rollInitiative(actorId) {
      return await computeCofdInitiative(u, actorId);
    },

    async executeAction(actorId, action, ctx) {
      const npc = await loadDbActor(u, actorId);
      if (!npc) return { ok: false, message: "NPC missing." };
      const npcSdk = makeNpcSdk(u, npc);

      try {
        if (action.type === "attack") {
          const tgtId = action.targetId;
          if (!tgtId) return { ok: false };
          const tgt = ctx.encounter.participants.find(
            (p: Participant) => p.actorId === tgtId,
          );
          if (!tgt) return { ok: false };
          // mode: aimed | melee | … reserved for host attack path
          await executeAttack(npcSdk, tgt.name);
          const who = npc.name ?? actorId;
          return {
            ok: true,
            targetId: tgtId,
            logLine: `${who} attacks ${tgt.name}` +
              (action.mode ? ` (${action.mode})` : ""),
          };
        }
        if (action.type === "reload") {
          try {
            await gearReload(npcSdk, "");
          } catch { /* swallow */ }
          return {
            ok: true,
            logLine: `${npc.name ?? actorId} reloads.`,
          };
        }
        return { ok: true };
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return { ok: false, message: msg };
      }
    },

    broadcast(_roomId, msg) {
      if (here && typeof here.broadcast === "function") {
        here.broadcast(msg);
      }
    },

    async onResolved(enc) {
      return await resolveScene(u, enc.id);
    },

    async afterAction(encounterId, enc) {
      for (const p of enc.participants) {
        await syncIsOut(u, encounterId, p.actorId);
      }
    },
  };
}

/** Register store + JSON brain at plugin init (idempotent). */
export function initCofdCombat(): void {
  registerEncounterStore(cofdEncounterStore);
  registerCombatBrain(jsonStrategyBrain);
}

export function removeCofdCombat(): void {
  unregisterEncounterStore();
}

/** @deprecated use initCofdCombat */
export function ensureCofdCombatBrains(): void {
  registerCombatBrain(jsonStrategyBrain);
}

export async function roomEncounter(
  roomId: string,
): Promise<Encounter | null> {
  return await getEncounterForRoom(roomId);
}
