// +combat command -- CoFD 2e encounter management.
// Tracks initiative order, turns, Defense, and ambush resolution.

import { divider, type IUrsamuSDK } from "@ursamu/ursamu";
import {
  addParticipant,
  advanceTurn,
  applyDefense,
  clearPin,
  createEncounter,
  delayCurrent,
  encounterDb,
  ensureParticipant,
  getEncounterForRoom,
  reclaimDelayed,
  removeParticipant,
  roll1d10,
  rollInitiative,
  setBeatenDown,
  setMoved,
  setParticipantConcealment,
  setParticipantCover,
  setRan,
  setSurrendered,
  setSurprised,
} from "../combat/encounter.ts";
import { computeDefense } from "../combat/pools.ts";
import { type CofdSheet, defaultSheet } from "../stats/index.ts";
import type { Encounter } from "../combat/types.ts";
import { getCoverDurability } from "../combat/types.ts";
import { advanceTurnSmart } from "../combat/walker.ts";
import { lookupTilt } from "../subsystems/tilts.ts";

const COVER_LEVELS: Record<string, number> = {
  none: 0,
  partial: 1,
  substantial: 2,
  full: 3,
};

const CONCEAL_LEVELS: Record<string, number> = {
  none: 0,
  light: 1,
  medium: 2,
  heavy: 3,
};

function coverLabel(v: number | undefined): string {
  switch (v ?? 0) {
    case 0: return "none";
    case 1: return "partial (Dur 1)";
    case 2: return "substantial (Dur 2)";
    case 3: return "full (Dur 3)";
    default: return `Dur ${v}`;
  }
}

function concealLabel(v: number | undefined): string {
  switch (v ?? 0) {
    case 0: return "none";
    case 1: return "light (-1)";
    case 2: return "medium (-2)";
    case 3: return "heavy (-3)";
    default: return `-${v}`;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}

function renderOrder(enc: Encounter): string {
  const lines: string[] = [];
  enc.participants.forEach((p, i) => {
    const marker = i === enc.turnIdx ? ">" : " ";
    const flags: string[] = [];
    if (p.isDodging) flags.push("Dodge");
    if (p.isOut) flags.push("Incap");
    if (p.delayed) flags.push("Delayed");
    if (p.actionUsed) flags.push("Acted");
    if (p.ran) flags.push("Ran");
    const tag = flags.length ? ` (${flags.join(", ")})` : "";
    lines.push(
      `  ${marker} ${String(p.initiative).padStart(3)}  ${pad(p.name, 20)}${tag}`,
    );
  });
  return lines.join("\n");
}

/** Parse optional "for <player>" from the end of rest. */
function splitForTarget(rest: string): { body: string; targetName: string } {
  const idx = rest.toLowerCase().lastIndexOf(" for ");
  if (idx < 0) return { body: rest.trim(), targetName: "" };
  return { body: rest.slice(0, idx).trim(), targetName: rest.slice(idx + 5).trim() };
}

// ---------------------------------------------------------------------------
// Sub-command handlers
// ---------------------------------------------------------------------------

async function combatStatus(u: IUrsamuSDK, rest = "") {
  const roomId = u.here?.id;
  if (!roomId) { u.send("You are not in a room."); return; }
  const enc = await getEncounterForRoom(roomId);
  if (!enc) { u.send("No active encounter in this room. Use +combat/start to begin one."); return; }

  const arg = rest.trim();
  if (arg) {
    const target = await u.util.target(u.me, arg, true);
    if (!target) { u.send(`No player matches '${arg}'.`); return; }
    const p = enc.participants.find((x) => x.actorId === target.id);
    if (!p) {
      u.send(`${u.util.displayName(target, u.me)} is not in this encounter.`);
      return;
    }
    const sheet = (target.state?.cofd as CofdSheet | undefined) ?? defaultSheet();
    const baseDef = computeDefense(sheet);
    const effDef = Math.max(0, baseDef - p.appliedDefense);
    const lines: string[] = [];
    lines.push(await divider("C O M B A T   S T A T U S"));
    lines.push(`  Participant:   ${p.name}`);
    lines.push(`  Initiative:    ${p.initiative}`);
    lines.push(`  Defense:       ${effDef} (base ${baseDef}, applied ${p.appliedDefense})`);
    lines.push(`  Dodging:       ${p.isDodging ? "yes" : "no"}`);
    lines.push(`  Cover:         ${coverLabel(getCoverDurability(p))}`);
    lines.push(`  Concealment:   ${concealLabel(p.concealment)}`);
    if (p.isOut) lines.push("  Incapacitated: yes");
    const tilts = sheet.tilts ?? [];
    if (tilts.length > 0) {
      const tiltNames = tilts.map((t) => lookupTilt(t.key)?.name ?? t.key).join(", ");
      lines.push(`  Tilts:         ${tiltNames}`);
    }
    u.send(lines.join("\n"));
    return;
  }

  const lines: string[] = [];
  lines.push(await divider("C O M B A T"));
  lines.push(`  Status: ${enc.status}  Round: ${enc.round}`);
  if (enc.participants.length === 0) {
    lines.push("  No participants yet. Use +combat/join.");
  } else {
    lines.push(renderOrder(enc));
  }
  u.send(lines.join("\n"));
}

async function combatCover(u: IUrsamuSDK, rest: string) {
  const roomId = u.here?.id;
  if (!roomId) { u.send("You are not in a room."); return; }
  const enc = await getEncounterForRoom(roomId);
  if (!enc) { u.send("No encounter here. Use +combat/start first."); return; }

  const { body, targetName } = splitForTarget(rest);
  const level = body.toLowerCase().trim();
  if (!level) {
    u.send("Usage: +combat/cover [partial|substantial|full|none] [for <player>]");
    return;
  }
  if (!(level in COVER_LEVELS)) {
    u.send(`Unknown cover level '${level}'. Use partial, substantial, full, or none.`);
    return;
  }
  let actor = u.me;
  if (targetName) {
    const found = await u.util.target(u.me, targetName, true);
    if (!found) { u.send(`No player matches '${targetName}'.`); return; }
    if (!(await u.canEdit(u.me, found))) {
      u.send("Permission denied. You cannot declare cover for another player.");
      return;
    }
    actor = found;
  }
  if (!enc.participants.some((p) => p.actorId === actor.id)) {
    u.send(`${actor.id === u.me.id ? "You are" : `${u.util.displayName(actor, u.me)} is`} not a participant in this encounter.`);
    return;
  }
  const value = COVER_LEVELS[level];
  await setParticipantCover(enc.id, actor.id, value);
  const who = actor.id === u.me.id ? "You take" : `${u.util.displayName(actor, u.me)} takes`;
  if (value === 0) {
    u.broadcast(`%cyCOVER>>%cn ${who} no cover.`);
  } else {
    u.broadcast(`%cyCOVER>>%cn ${who} ${level} cover (Durability ${value}).`);
  }
}

async function combatConceal(u: IUrsamuSDK, rest: string) {
  const roomId = u.here?.id;
  if (!roomId) { u.send("You are not in a room."); return; }
  const enc = await getEncounterForRoom(roomId);
  if (!enc) { u.send("No encounter here. Use +combat/start first."); return; }

  const { body, targetName } = splitForTarget(rest);
  const level = body.toLowerCase().trim();
  if (!level) {
    u.send("Usage: +combat/conceal [light|medium|heavy|none] [for <player>]");
    return;
  }
  if (!(level in CONCEAL_LEVELS)) {
    u.send(`Unknown concealment level '${level}'. Use light, medium, heavy, or none.`);
    return;
  }
  let actor = u.me;
  if (targetName) {
    const found = await u.util.target(u.me, targetName, true);
    if (!found) { u.send(`No player matches '${targetName}'.`); return; }
    if (!(await u.canEdit(u.me, found))) {
      u.send("Permission denied. You cannot declare concealment for another player.");
      return;
    }
    actor = found;
  }
  if (!enc.participants.some((p) => p.actorId === actor.id)) {
    u.send(`${actor.id === u.me.id ? "You are" : `${u.util.displayName(actor, u.me)} is`} not a participant in this encounter.`);
    return;
  }
  const value = CONCEAL_LEVELS[level];
  await setParticipantConcealment(enc.id, actor.id, value);
  const who = actor.id === u.me.id ? "You are" : `${u.util.displayName(actor, u.me)} is`;
  if (value === 0) {
    u.broadcast(`%cyCONCEAL>>%cn ${who} no longer concealed.`);
  } else {
    u.broadcast(`%cyCONCEAL>>%cn ${who} in ${level} concealment (-${value} to attackers).`);
  }
}

async function combatStart(u: IUrsamuSDK) {
  const roomId = u.here?.id;
  if (!roomId) { u.send("You are not in a room."); return; }
  const existing = await getEncounterForRoom(roomId);
  if (existing) {
    u.send(`An encounter is already active here (status: ${existing.status}).`);
    return;
  }
  const enc = await createEncounter(roomId);
  // Auto-seed NPCs present in the room. PCs join themselves via +combat/join
  // (or get pulled in once they take a combat action).
  // deno-lint-ignore no-explicit-any
  const here = await u.db.search({ location: roomId } as any);
  const npcs = here.filter((o) => {
    const f = o.flags as Set<string> | undefined;
    return !!(f && typeof f.has === "function" && f.has("npc"));
  });
  for (const npc of npcs) await ensureParticipant(u, enc.id, npc);
  const seeded = npcs.length > 0 ? ` (${npcs.length} NPC${npcs.length === 1 ? "" : "s"} auto-joined)` : "";
  u.send(`Combat encounter started${seeded}. Use +combat/join to add yourself.`);
}

async function combatJoin(u: IUrsamuSDK, rest: string) {
  const roomId = u.here?.id;
  if (!roomId) { u.send("You are not in a room."); return; }
  let enc = await getEncounterForRoom(roomId);
  if (!enc) {
    enc = await createEncounter(roomId);
    u.broadcast("%cyCombat is breaking out!%cn Use +combat/join to enter the fray, +combat/begin to roll initiative.");
  }

  const targetName = rest.trim().replace(/^for\s+/i, "").trim();
  let actor = u.me;
  if (targetName) {
    const found = await u.util.target(u.me, targetName, true);
    if (!found) { u.send(`No target matches '${targetName}'.`); return; }
    if (!(await u.canEdit(u.me, found))) {
      u.send("Permission denied. You cannot add that target to combat.");
      return;
    }
    actor = found;
  }
  await addParticipant(enc.id, actor);
  const label = actor.id === u.me.id ? "You have" : `${u.util.displayName(actor, u.me)} has`;
  u.send(`${label} joined the encounter.`);
}

async function combatLeave(u: IUrsamuSDK, rest: string) {
  const roomId = u.here?.id;
  if (!roomId) { u.send("You are not in a room."); return; }
  const enc = await getEncounterForRoom(roomId);
  if (!enc) { u.send("No encounter here."); return; }

  const targetName = rest.trim().replace(/^for\s+/i, "").trim();
  let actor = u.me;
  if (targetName) {
    const found = await u.util.target(u.me, targetName, true);
    if (!found) { u.send(`No target matches '${targetName}'.`); return; }
    if (!(await u.canEdit(u.me, found))) {
      u.send("Permission denied. You cannot remove that target from combat.");
      return;
    }
    actor = found;
  }
  const result = await removeParticipant(enc.id, actor.id);
  if (!result) { u.send("Encounter not found."); return; }
  const label = actor.id === u.me.id ? "You have" : `${u.util.displayName(actor, u.me)} has`;
  u.send(`${label} left the encounter.`);
  if (result.wasActive) {
    // Advance was already handled structurally by removeParticipant's turnIdx fix.
    const fresh = await getEncounterForRoom(roomId);
    if (fresh && fresh.participants.length > 0) {
      const cur = fresh.participants[fresh.turnIdx];
      u.send(`Turn advances to ${cur.name}.`);
    }
  }
}

async function combatBegin(u: IUrsamuSDK) {
  const roomId = u.here?.id;
  if (!roomId) { u.send("You are not in a room."); return; }
  let enc = await getEncounterForRoom(roomId);
  if (!enc) {
    enc = await createEncounter(roomId);
    await addParticipant(enc.id, u.me);
    enc = await getEncounterForRoom(roomId);
    u.broadcast("%cyCombat is breaking out!%cn Others may join with +combat/join.");
  }
  if (!enc || enc.participants.length === 0) {
    u.send("No participants to roll initiative for. Use +combat/join.");
    return;
  }
  const updated = await rollInitiative(enc.id, u);
  if (!updated) { u.send("Failed to roll initiative."); return; }
  const lines: string[] = [];
  lines.push(await divider("I N I T I A T I V E"));
  lines.push(renderOrder(updated));
  lines.push(`  Round 1 -- ${updated.participants[0].name} acts first.`);
  u.send(lines.join("\n"));
}

async function combatNext(u: IUrsamuSDK, manual = false) {
  const roomId = u.here?.id;
  if (!roomId) { u.send("You are not in a room."); return; }
  const enc = await getEncounterForRoom(roomId);
  if (!enc || enc.status !== "active") {
    u.send("No active encounter. Use +combat/begin to start the round.");
    return;
  }
  // Single-step (legacy) advance when /manual is supplied.
  if (manual) {
    const updated = await advanceTurn(enc.id);
    if (!updated) { u.send("Failed to advance turn."); return; }
    const cur = updated.participants[updated.turnIdx];
    const msg =
      `%cyTURN>>%cn Round ${updated.round} -- It is now ${cur.name}'s turn ` +
      `(Initiative ${cur.initiative}).`;
    u.send(msg);
    u.broadcast(msg);
    return;
  }
  // Default: smart walker -- step one slot then pump AI until a PC turn.
  const stepped = await advanceTurn(enc.id);
  if (!stepped) { u.send("Failed to advance turn."); return; }
  const after = await advanceTurnSmart(enc.id, u);
  if (!after) return;
  const cur = after.participants[after.turnIdx];
  if (cur) {
    const msg =
      `%cyTURN>>%cn Round ${after.round} -- It is now ${cur.name}'s turn ` +
      `(Initiative ${cur.initiative}).`;
    u.send(msg);
    u.broadcast(msg);
  }
}

async function combatDelay(u: IUrsamuSDK) {
  const roomId = u.here?.id;
  if (!roomId) { u.send("You are not in a room."); return; }
  const enc = await getEncounterForRoom(roomId);
  if (!enc || enc.status !== "active") { u.send("No active encounter."); return; }
  const cur = enc.participants[enc.turnIdx];
  if (!cur || cur.actorId !== u.me.id) {
    u.send("It is not your turn; only the current actor can delay.");
    return;
  }
  if (cur.actionUsed) {
    u.send("You already acted this turn; nothing left to delay.");
    return;
  }
  const result = await delayCurrent(enc.id);
  if (!result) { u.send("Failed to delay."); return; }
  const name = cur.name;
  const head = `%cyDELAY>>%cn ${name} holds their action.`;
  u.send(head);
  u.broadcast(head);
  const next = result.encounter.participants[result.encounter.turnIdx];
  if (next) {
    const msg =
      `%cyTURN>>%cn Round ${result.encounter.round} -- It is now ${next.name}'s turn ` +
      `(Initiative ${next.initiative}).`;
    u.send(msg);
    u.broadcast(msg);
  }
}

async function combatAct(u: IUrsamuSDK) {
  const roomId = u.here?.id;
  if (!roomId) { u.send("You are not in a room."); return; }
  const enc = await getEncounterForRoom(roomId);
  if (!enc || enc.status !== "active") { u.send("No active encounter."); return; }
  const p = enc.participants.find((x) => x.actorId === u.me.id);
  if (!p) { u.send("You are not in this encounter."); return; }
  if (!p.delayed) { u.send("You are not holding an action."); return; }
  const updated = await reclaimDelayed(enc.id, u.me.id);
  if (!updated) { u.send("Failed to reclaim your delayed action."); return; }
  const msg = `%cyACT>>%cn ${p.name} takes their held action. It is now their turn.`;
  u.send(msg);
  u.broadcast(msg);
}

async function combatMove(u: IUrsamuSDK) {
  const roomId = u.here?.id;
  if (!roomId) { u.send("You are not in a room."); return; }
  const enc = await getEncounterForRoom(roomId);
  if (!enc || enc.status !== "active") { u.send("No active encounter."); return; }
  const cur = enc.participants[enc.turnIdx];
  if (!cur || cur.actorId !== u.me.id) { u.send("It is not your turn."); return; }
  if (cur.movedThisRound) { u.send("You already moved this round."); return; }
  await setMoved(enc.id, u.me.id, true);
  const sheet = u.me.state?.cofd as CofdSheet | undefined;
  const attrs = (sheet?.attributes ?? {}) as Record<string, number>;
  const str = attrs.strength ?? attrs.Strength ?? 1;
  const dex = attrs.dexterity ?? attrs.Dexterity ?? 1;
  const size = sheet?.advantages?.size ?? 5;
  const speed = str + dex + size;
  const msg = `%cyMOVE>>%cn ${cur.name} moves up to Speed ${speed} yards (free, no slot used).`;
  u.send(msg);
  u.broadcast(msg);
}

async function combatRun(u: IUrsamuSDK) {
  const roomId = u.here?.id;
  if (!roomId) { u.send("You are not in a room."); return; }
  const enc = await getEncounterForRoom(roomId);
  if (!enc || enc.status !== "active") { u.send("No active encounter."); return; }
  const cur = enc.participants[enc.turnIdx];
  if (!cur || cur.actorId !== u.me.id) { u.send("It is not your turn."); return; }
  if (cur.actionUsed) { u.send("You already used your instant action this turn."); return; }
  await setRan(enc.id, u.me.id, true);
  const sheet = u.me.state?.cofd as CofdSheet | undefined;
  const attrs = (sheet?.attributes ?? {}) as Record<string, number>;
  const str = attrs.strength ?? attrs.Strength ?? 1;
  const dex = attrs.dexterity ?? attrs.Dexterity ?? 1;
  const size = sheet?.advantages?.size ?? 5;
  const speed = str + dex + size;
  const msg =
    `%cyRUN>>%cn ${cur.name} sprints up to ${speed * 2} yards (consumes the instant action; -1 Defense).`;
  u.send(msg);
  u.broadcast(msg);
}

async function combatReflexive(u: IUrsamuSDK, rest: string) {
  const roomId = u.here?.id;
  if (!roomId) { u.send("You are not in a room."); return; }
  const enc = await getEncounterForRoom(roomId);
  if (!enc || enc.status !== "active") { u.send("No active encounter."); return; }
  const p = enc.participants.find((x) => x.actorId === u.me.id);
  if (!p) { u.send("You are not in this encounter."); return; }
  const what = rest.trim();
  if (!what) { u.send("Usage: +combat/reflexive <description>"); return; }
  const msg = `%cyREFLEX>>%cn ${p.name}: ${what} (reflexive -- no slot used).`;
  u.send(msg);
  u.broadcast(msg);
}

async function combatEnd(u: IUrsamuSDK) {
  const roomId = u.here?.id;
  if (!roomId) { u.send("You are not in a room."); return; }
  const enc = await getEncounterForRoom(roomId);
  if (!enc) { u.send("No encounter here."); return; }
  const resolved = { ...enc, status: "resolved" as const };
  // deno-lint-ignore no-explicit-any
  await encounterDb.update({ id: enc.id } as any, resolved);

  // Clear the +aid once-per-scene cap for every participant. Scene boundary
  // is "encounter end" for our purposes; +aid runs in scenes, not outside.
  for (const p of enc.participants) {
    // deno-lint-ignore no-explicit-any
    await u.db.modify(p.actorId, "$unset", { "data.cofd.aidedThisScene": "" } as any);
  }

  u.send("The encounter has ended. All participants are dismissed.");
}

async function combatOrder(u: IUrsamuSDK) {
  const roomId = u.here?.id;
  if (!roomId) { u.send("You are not in a room."); return; }
  const enc = await getEncounterForRoom(roomId);
  if (!enc) { u.send("No encounter here."); return; }
  const lines: string[] = [];
  lines.push(await divider("I N I T I A T I V E   O R D E R"));
  lines.push(`  Round ${enc.round}  Status: ${enc.status}`);
  if (enc.participants.length === 0) {
    lines.push("  No participants.");
  } else {
    lines.push(renderOrder(enc));
  }
  u.send(lines.join("\n"));
}

async function combatAmbush(u: IUrsamuSDK, rest: string) {
  const roomId = u.here?.id;
  if (!roomId) { u.send("You are not in a room."); return; }
  const enc = await getEncounterForRoom(roomId);
  if (!enc) { u.send("No encounter here."); return; }

  const targetName = rest.trim();
  if (!targetName) { u.send("Usage: +combat/ambush <target>"); return; }
  const target = await u.util.target(u.me, targetName, true);
  if (!target) { u.send(`No player matches '${targetName}'.`); return; }

  // Ambush mutates participant state (Defense pool exhaustion + Surprised
  // flag). Both attacker and target must already be participants in this
  // encounter -- a non-participant target should refuse cleanly rather
  // than broadcast a noisy roll table.
  const attackerIsParticipant = enc.participants.some((p) => p.actorId === u.me.id);
  if (!attackerIsParticipant) {
    u.send("You are not in this encounter. Use +combat/join first.");
    return;
  }
  const targetIsParticipant = enc.participants.some((p) => p.actorId === target.id);
  if (!targetIsParticipant) {
    u.send(`${target.name ?? "Target"} is not in this encounter.`);
    return;
  }

  const mySheet = u.me.state?.cofd as CofdSheet | undefined;
  const theirSheet = target.state?.cofd as CofdSheet | undefined;

  // Attacker: Dexterity + Stealth
  const atkDex = mySheet?.attributes?.dexterity ?? mySheet?.attributes?.Dexterity ?? 1;
  const atkStealth = mySheet?.skills?.stealth ?? mySheet?.skills?.Stealth ?? 0;
  // Defender: Wits + Composure
  const defWits = theirSheet?.attributes?.wits ?? theirSheet?.attributes?.Wits ?? 1;
  const defComp = theirSheet?.attributes?.composure ?? theirSheet?.attributes?.Composure ?? 1;

  const atkPool = atkDex + atkStealth;
  const defPool = defWits + defComp;

  // Roll contested pools.
  let atkSuccesses = 0;
  for (let i = 0; i < atkPool; i++) {
    const die = roll1d10();
    if (die >= 8) atkSuccesses++;
    if (die === 10) { // 10-again
      const reroll = roll1d10();
      if (reroll >= 8) atkSuccesses++;
    }
  }
  let defSuccesses = 0;
  for (let i = 0; i < defPool; i++) {
    const die = roll1d10();
    if (die >= 8) defSuccesses++;
    if (die === 10) {
      const reroll = roll1d10();
      if (reroll >= 8) defSuccesses++;
    }
  }

  const attackerName = u.util.displayName(u.me, u.me);
  const defenderName = u.util.displayName(target, u.me);
  const lines: string[] = [];
  lines.push(await divider("A M B U S H"));
  lines.push(
    `  ${attackerName} (Dex ${atkDex} + Stealth ${atkStealth} = ${atkPool} dice): %ch${atkSuccesses} success${atkSuccesses !== 1 ? "es" : ""}%cn`,
  );
  lines.push(
    `  ${defenderName} (Wits ${defWits} + Composure ${defComp} = ${defPool} dice): %ch${defSuccesses} success${defSuccesses !== 1 ? "es" : ""}%cn`,
  );

  if (atkSuccesses > defSuccesses) {
    lines.push(
      `  Ambush succeeds! ${defenderName} loses their first-turn action and Defense this round.`,
    );
    // Mark defender as having applied defense so pool effectively exhausted.
    await applyDefense(enc.id, target.id);
    await setSurprised(enc.id, target.id, true);
  } else if (defSuccesses > atkSuccesses) {
    lines.push(`  Ambush fails! ${defenderName} is aware of the threat.`);
  } else {
    lines.push("  Tied! The attacker narrowly fails to surprise the defender.");
  }

  u.send(lines.join("\n"));
}

async function combatRecover(u: IUrsamuSDK) {
  const roomId = u.here?.id;
  if (!roomId) { u.send("You are not in a room."); return; }
  const enc = await getEncounterForRoom(roomId);
  if (!enc) { u.send("No encounter here."); return; }
  const me = enc.participants.find((p) => p.actorId === u.me.id);
  if (!me) { u.send("You are not in this encounter."); return; }
  if (!me.beatenDown) { u.send("You are not Beaten Down."); return; }

  const sheet = u.me.state?.cofd as CofdSheet | undefined;
  const wp = sheet?.advantages?.willpowerCurrent ?? 0;
  if (wp < 1) { u.send("You have no Willpower left to recover."); return; }

  await u.db.modify(u.me.id, "$set", {
    "state.cofd": {
      ...sheet,
      advantages: { ...sheet!.advantages, willpowerCurrent: wp - 1 },
    },
  });
  await setBeatenDown(enc.id, u.me.id, false);
  const line = `%cy${u.me.name ?? "Someone"} spends Willpower and shakes off Beaten Down!%cn`;
  u.send(line);
  u.broadcast(line);
}

async function combatSurrender(u: IUrsamuSDK) {
  const roomId = u.here?.id;
  if (!roomId) { u.send("You are not in a room."); return; }
  const enc = await getEncounterForRoom(roomId);
  if (!enc) { u.send("No encounter here."); return; }
  const me = enc.participants.find((p) => p.actorId === u.me.id);
  if (!me) { u.send("You are not in this encounter."); return; }
  await setSurrendered(enc.id, u.me.id, true);
  const name = u.me.name ?? "Someone";
  const head = `%cy${name} drops their guard and surrenders.%cn`;
  const tail = "Attackers cannot target them without ST approval.";
  u.send(head);
  u.send(tail);
  u.broadcast(head);
  u.broadcast(tail);
}

async function combatBreakpin(u: IUrsamuSDK) {
  const roomId = u.here?.id;
  if (!roomId) { u.send("You are not in a room."); return; }
  const enc = await getEncounterForRoom(roomId);
  if (!enc) { u.send("No encounter here."); return; }
  const me = enc.participants.find((p) => p.actorId === u.me.id);
  if (!me) { u.send("You are not in this encounter."); return; }
  if (!me.pinnedBy) { u.send("You are not pinned."); return; }

  const sheet = u.me.state?.cofd as CofdSheet | undefined;
  const wp = sheet?.advantages?.willpowerCurrent ?? 0;
  if (wp < 1) {
    u.send("You have no Willpower; you must instead spend your full turn breaking the pin.");
    return;
  }
  await u.db.modify(u.me.id, "$set", {
    "state.cofd": {
      ...sheet,
      advantages: { ...sheet!.advantages, willpowerCurrent: wp - 1 },
    },
  });
  await clearPin(enc.id, u.me.id);
  const line = `%cy${u.me.name ?? "Someone"} spends Willpower and shakes off the suppression.%cn`;
  u.send(line);
  u.broadcast(line);
}

// ---------------------------------------------------------------------------
// Main dispatch
// ---------------------------------------------------------------------------

export async function combatExec(u: IUrsamuSDK) {
  const swRaw = (u.cmd.args[0] ?? "").toLowerCase().trim();
  const rest = u.util.stripSubs(u.cmd.args[1] ?? "").trim();
  // Support stacked switches like /next/manual -> primary=next, extras={manual}.
  const swParts = swRaw.split("/").filter(Boolean);
  const sw = swParts[0] ?? "";
  const swSet = new Set(swParts.slice(1));

  switch (sw) {
    case "start":  await combatStart(u);        return;
    case "join":   await combatJoin(u, rest);   return;
    case "leave":  await combatLeave(u, rest);  return;
    case "begin":  await combatBegin(u);        return;
    case "next": {
      const manual = swSet.has("manual") || /\bmanual\b/i.test(rest);
      await combatNext(u, manual);
      return;
    }
    case "delay":
    case "hold":   await combatDelay(u);        return;
    case "act":
    case "reclaim": await combatAct(u);         return;
    case "move":   await combatMove(u);         return;
    case "run":    await combatRun(u);          return;
    case "reflex":
    case "reflexive": await combatReflexive(u, rest); return;
    case "end":    await combatEnd(u);          return;
    case "order":  await combatOrder(u);        return;
    case "ambush": await combatAmbush(u, rest); return;
    case "cover":  await combatCover(u, rest);  return;
    case "conceal":
    case "concealment":
      await combatConceal(u, rest); return;
    case "status": await combatStatus(u, rest); return;
    case "recover":   await combatRecover(u);   return;
    case "surrender": await combatSurrender(u); return;
    case "breakpin":  await combatBreakpin(u);  return;
    default:       await combatStatus(u);       return;
  }
}
