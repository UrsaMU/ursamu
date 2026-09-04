/**
 * Shared helpers for D&D combat commands on @ursamu/combat.
 */
import {
  beginEncounter,
  currentActor,
  endFight,
  formatInitiativeLines,
  joinEncounter,
  leaveEncounter,
  passTurn,
  startEncounter,
  type Encounter,
  type Participant,
} from "@ursamu/combat";
import {
  header,
  divider,
  footer,
  type IDBObj,
  type IUrsamuSDK,
} from "@ursamu/mush";
import {
  dndEncounterStore,
  initDndCombat,
  makeDndPorts,
  kindOfActor,
} from "./ports.ts";
import { advanceTurnSmart } from "./walker.ts";
import { isIncapacitated, sheetOf } from "./resolve.ts";

/**
 * Room the actor is actually in. Prefer me.location — after
 * teleport() the SDK updates location but not always u.here.
 */
export function roomIdOf(u: IUrsamuSDK): string | null {
  const loc = u.me?.location;
  if (loc) return String(loc);
  // deno-lint-ignore no-explicit-any
  const here = (u as any).here;
  return (here?.id as string | undefined) ?? null;
}

export function portsOf(u: IUrsamuSDK) {
  initDndCombat();
  return makeDndPorts(u);
}

export async function roomEncounter(
  roomId: string,
): Promise<Encounter | null> {
  initDndCombat();
  return await dndEncounterStore.findInRoom?.(roomId) ?? null;
}

export function isStaff(u: IUrsamuSDK): boolean {
  return u.me.flags.has("admin") ||
    u.me.flags.has("wizard") ||
    u.me.flags.has("superuser");
}

export function roomBroadcast(u: IUrsamuSDK, msg: string): void {
  // deno-lint-ignore no-explicit-any
  const here = (u as any).here;
  if (here && typeof here.broadcast === "function") {
    here.broadcast(msg);
    return;
  }
  if (typeof u.broadcast === "function") {
    u.broadcast(msg);
    return;
  }
  u.send(msg);
}

export function announceTurn(u: IUrsamuSDK, enc: Encounter): void {
  const cur = currentActor(enc);
  if (!cur || enc.status !== "active") return;
  roomBroadcast(
    u,
    `%chRound ${enc.round}%cn — it is now ` +
      `%ch%cg${cur.name}%cn's turn (Init ${cur.initiative}).`,
  );
}

export function formatStatus(
  u: IUrsamuSDK,
  enc: Encounter,
  actors: Map<string, IDBObj>,
): string {
  const lines: string[] = [
    header("COMBAT STATUS"),
    `  Status: ${enc.status}  Round: ${enc.round}`,
    divider("Initiative Queue"),
  ];
  enc.participants.forEach((p, i) => {
    const mark = i === enc.turnIdx ? " %cg>%cn " : "   ";
    const actor = actors.get(p.actorId);
    let hpStr = "[N/A]";
    let statusStr = "Unknown";
    if (actor) {
      const s = sheetOf(actor);
      hpStr = `[${s.hp.current}/${s.hp.max}]`;
      const pct = s.hp.max > 0 ? s.hp.current / s.hp.max : 0;
      if (p.isOut || s.hp.current <= 0) {
        statusStr = "%crUnconscious%cn";
      } else if (pct <= 0.5) statusStr = "%cyBloody%cn";
      else if (pct < 1) statusStr = "%cyWounded%cn";
      else statusStr = "%cgHealthy%cn";
    } else if (p.isOut) {
      statusStr = "%crOut%cn";
    }
    // Show #id so duplicates are targetable: +attack #142
    const label = `${p.name}(#${p.actorId})`;
    lines.push(
      `${mark}${u.util.ljust(label, 26)}` +
        `${u.util.ljust(hpStr, 12)}` +
        `${u.util.ljust(statusStr, 18)} ` +
        `(Init: ${p.initiative})`,
    );
  });
  lines.push(footer());
  return lines.join("\n");
}

export function formatStartBanner(enc: Encounter): string {
  const lines: string[] = [
    header("COMBAT STARTED"),
    `Round: ${enc.round || 1}`,
    divider("Initiative Order"),
  ];
  for (const line of formatInitiativeLines(enc, {
    currentMarker: " > ",
    otherMarker: "   ",
  })) {
    lines.push(line);
  }
  lines.push(footer());
  return lines.join("\n");
}

/** Objects in room with a D&D sheet. */
export async function roomCombatants(
  u: IUrsamuSDK,
  roomId: string,
): Promise<IDBObj[]> {
  // deno-lint-ignore no-explicit-any
  const items = await u.db.search({ location: roomId } as any);
  const out: IDBObj[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    // deno-lint-ignore no-explicit-any
    const sheet = (item.state as any)?.dnd;
    if (!sheet?.abilities) continue;
    out.push(item);
    seen.add(item.id);
  }
  if (!seen.has(u.me.id)) {
    // deno-lint-ignore no-explicit-any
    const meSheet = (u.me.state as any)?.dnd;
    if (meSheet?.abilities) out.push(u.me);
  }
  return out;
}

export async function joinActor(
  encId: string,
  actor: IDBObj,
  u: IUrsamuSDK,
): Promise<Encounter | null> {
  const ports = portsOf(u);
  const kind = kindOfActor(actor);
  const name = u.util.displayName(actor, u.me).split(";")[0];
  return await joinEncounter(encId, {
    actorId: actor.id,
    name,
    kind,
    isOut: isIncapacitated(sheetOf(actor)),
  }, {
    store: dndEncounterStore,
    ports,
  });
}

export async function ensureEncounter(
  u: IUrsamuSDK,
  roomId: string,
): Promise<Encounter> {
  let enc = await roomEncounter(roomId);
  if (!enc || enc.status === "resolved") {
    enc = await startEncounter(roomId, {
      store: dndEncounterStore,
      startedBy: u.me.id,
    });
  }
  return enc;
}

/** Roll initiative and set status=active (no AI yet). */
export async function beginOnly(
  u: IUrsamuSDK,
  encId: string,
): Promise<Encounter | null> {
  const ports = portsOf(u);
  return await beginEncounter(encId, {
    store: dndEncounterStore,
    ports,
  });
}

/** If current actor is an NPC, run the walker until a PC turn. */
export async function walkIfNpc(
  u: IUrsamuSDK,
  enc: Encounter,
): Promise<Encounter> {
  const first = currentActor(enc);
  if (first?.kind === "npc" && !first.isOut) {
    return (await advanceTurnSmart(enc.id, u)) ?? enc;
  }
  return enc;
}

export async function beginAndWalk(
  u: IUrsamuSDK,
  encId: string,
): Promise<Encounter | null> {
  let enc = await beginOnly(u, encId);
  if (!enc) return null;
  return await walkIfNpc(u, enc);
}

export async function passAndWalk(
  u: IUrsamuSDK,
  encId: string,
  actorId: string,
  opts?: { force?: boolean },
): Promise<Encounter | null> {
  const ports = portsOf(u);
  const result = await passTurn(encId, {
    actorId,
    store: dndEncounterStore,
    ports,
    force: opts?.force,
    walk: true,
  });
  if (result.error === "not_your_turn") {
    u.send("It is not your turn.");
    return null;
  }
  if (result.error === "not_active") {
    u.send("Combat is not active in this room.");
    return null;
  }
  if (result.error === "not_in_fight") {
    u.send("You are not in this encounter.");
    return null;
  }
  if (result.error === "not_found") {
    u.send("No encounter found.");
    return null;
  }
  const enc = result.encounter;
  if (enc && enc.status === "active") {
    announceTurn(u, enc);
  } else if (enc && enc.status === "resolved") {
    roomBroadcast(
      u,
      "All enemies have been defeated! Combat has ended.",
    );
  }
  return enc;
}

export async function endRoomFight(
  u: IUrsamuSDK,
  enc: Encounter,
  opts?: { quiet?: boolean },
): Promise<void> {
  const ports = portsOf(u);
  await endFight(enc.id, {
    store: dndEncounterStore,
    ports,
    logLine: "Combat ended.",
  });
  if (!opts?.quiet) u.send("Combat has ended.");
}

export async function removeFromFight(
  enc: Encounter,
  actorId: string,
): Promise<Encounter | null> {
  const result = await leaveEncounter(enc.id, actorId, {
    store: dndEncounterStore,
  });
  return result?.encounter ?? null;
}

/**
 * True while any monster participant still exists in the world.
 * Unconscious (isOut / 0 HP) NPCs still "remain" until +kill removes them.
 */
export async function monstersRemain(
  u: IUrsamuSDK,
  enc: Encounter,
): Promise<boolean> {
  for (const p of enc.participants) {
    // deno-lint-ignore no-explicit-any
    const found = await u.db.search({ id: p.actorId } as any);
    const o = found[0];
    if (!o) continue;
    if (kindOfActor(o) === "npc") return true;
  }
  return false;
}

export type { Encounter, Participant };
