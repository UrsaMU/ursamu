// +npc command -- spawn, list, show, and destroy non-player antagonists.
// NPCs are real IDBObj records flagged "npc" so existing combat/attack
// machinery treats them like players. A parallel record in the
// cofd.npcs DBO collection tracks the archetype, tier, and powers for
// cross-room directory and reuse.

import { divider, type IDBObj, type IUrsamuSDK } from "@ursamu/ursamu";
import {
  archetypeHealthMax,
  archetypeKeys,
  getArchetype,
  NPC_ARCHETYPES,
  NPC_TIERS,
  type NpcTier,
  sheetDefense,
  sheetFromArchetype,
  sheetHealthMax,
  sheetInitiative,
  sheetSpeed,
  tierPowerCap,
} from "../npc/archetypes.ts";
import {
  getDreadPower,
  listDreadPowers,
  tierMeetsPower,
} from "../npc/dread.ts";
import {
  findNpcByObjId,
  newNpcId,
  removeNpcRecord,
  saveNpcRecord,
  updateNpcAiArchetype,
  updateNpcPowers,
} from "../npc/directory.ts";
import type { CofdSheet } from "../stats/index.ts";
import { listArchetypes } from "../combat/ai/index.ts";

/** Staff gate: superuser, admin, wizard, or builder flag on the actor. */
function isStaff(actor: IDBObj): boolean {
  const f = actor.flags as Set<string> | undefined;
  if (!f) return false;
  return f.has?.("superuser") || f.has?.("admin") || f.has?.("wizard") || f.has?.("builder");
}

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}

function isValidTier(s: string): s is NpcTier {
  return (NPC_TIERS as readonly string[]).includes(s);
}

// ---------------------------------------------------------------------------
// Shared name+spec parser. Accepts "Name=archetype" or "Name=archetype/tier".
// ---------------------------------------------------------------------------

interface ParsedSpec {
  name: string;
  archetypeKey: string;
  tier: NpcTier | null;
  err: string | null;
}

function parseNameSpec(u: IUrsamuSDK, rest: string): ParsedSpec {
  const eqIdx = rest.indexOf("=");
  if (eqIdx < 0) {
    return { name: "", archetypeKey: "", tier: null, err: "Syntax: <name>=<archetype>[/<tier>]" };
  }
  const name = u.util.stripSubs(rest.slice(0, eqIdx)).trim();
  const specRaw = u.util.stripSubs(rest.slice(eqIdx + 1)).trim().toLowerCase();
  let archetypeKey = specRaw;
  let tier: NpcTier | null = null;
  if (specRaw.includes("/")) {
    const [a, t] = specRaw.split("/", 2).map((s) => s.trim());
    archetypeKey = a;
    if (t) {
      if (!isValidTier(t)) {
        return {
          name, archetypeKey, tier: null,
          err: `Unknown tier '${t}'. Valid: ${NPC_TIERS.join(", ")}.`,
        };
      }
      tier = t;
    }
  }
  if (!name) return { name, archetypeKey, tier, err: "NPC name is required." };
  if (name.length > 40) return { name, archetypeKey, tier, err: "NPC name must be 40 characters or fewer." };
  if (!/^[A-Za-z0-9 _'\-]+$/.test(name)) {
    return { name, archetypeKey, tier, err: "NPC name may only contain letters, numbers, spaces, _ ' and -." };
  }
  return { name, archetypeKey, tier, err: null };
}

// ---------------------------------------------------------------------------
// /create  (alias for /build at the archetype's default tier)
// /build   (full stat-block spawn with optional tier override)
// ---------------------------------------------------------------------------

async function npcBuild(u: IUrsamuSDK, rest: string): Promise<void> {
  if (!isStaff(u.me)) {
    u.send("Permission denied. Only staff may manage NPCs.");
    return;
  }
  const roomId = u.here?.id;
  if (!roomId) { u.send("You are not in a room."); return; }

  const spec = parseNameSpec(u, rest);
  if (spec.err) { u.send(spec.err); return; }

  const archetype = getArchetype(spec.archetypeKey);
  if (!archetype) {
    u.send(`Unknown archetype '${spec.archetypeKey}'. Valid: ${archetypeKeys().join(", ")}.`);
    return;
  }

  const tier = spec.tier ?? archetype.tier;
  // Pass 2: default AI archetype = "beshilu-swarmer" (overridable via /ai).
  const sheet = sheetFromArchetype(archetype, tier, { aiArchetype: "beshilu-swarmer" });

  const npcObj = await u.db.create({
    name: spec.name,
    flags: new Set(["npc", "thing"]),
    location: roomId,
    state: { cofd: sheet },
    contents: [],
  });

  const record = {
    id: newNpcId(),
    name: spec.name,
    archetype: archetype.key,
    tier,
    dreadPowers: sheet.npc.dreadPowers,
    aiArchetype: sheet.npc.aiArchetype,
    objId: npcObj.id,
    roomId,
    createdAt: Date.now(),
    createdBy: u.me.id,
  };
  try { await saveNpcRecord(record); } catch { /* directory optional */ }

  u.send(
    `Created %ch${spec.name}%cn (${archetype.label}, tier ${tier}, id ${npcObj.id}). ` +
    `Health ${sheetHealthMax(sheet)}, Willpower ${sheet.advantages.willpowerMax}, ` +
    `Defense ${sheetDefense(sheet)}, Init +${sheetInitiative(sheet)}, Speed ${sheetSpeed(sheet)}.`,
  );
}

// ---------------------------------------------------------------------------
// /list
// ---------------------------------------------------------------------------

async function npcList(u: IUrsamuSDK): Promise<void> {
  const roomId = u.here?.id;
  if (!roomId) { u.send("You are not in a room."); return; }

  // deno-lint-ignore no-explicit-any
  const found = await u.db.search({ location: roomId } as any);
  const npcs = found.filter((o: IDBObj) => {
    const f = o.flags as Set<string> | undefined;
    return f?.has?.("npc");
  });

  const lines: string[] = [];
  lines.push(await divider("N P C s"));
  if (npcs.length === 0) {
    lines.push("  No NPCs in this room. Use +npc/create <name>=<archetype>.");
    lines.push(`  Archetypes: ${archetypeKeys().join(", ")}`);
    u.send(lines.join("\n"));
    return;
  }

  lines.push(
    "  " + pad("Name", 20) + pad("Archetype", 14) + pad("Tier", 12) +
    pad("Health", 12) + "Id",
  );
  lines.push("  " + "-".repeat(76));
  for (const o of npcs) {
    const sheet = (o.state?.cofd ?? {}) as CofdSheet & {
      npc?: { archetype: string; tier?: NpcTier };
    };
    const archKey = sheet.npc?.archetype ?? "unknown";
    const arch = NPC_ARCHETYPES[archKey];
    const tier = sheet.npc?.tier ?? arch?.tier ?? "minor";
    const hMax = arch
      ? archetypeHealthMax(arch)
      : (sheet.attributes?.stamina ?? 1) + (sheet.advantages?.size ?? 5);
    const h = sheet.health ?? { bashing: 0, lethal: 0, aggravated: 0 };
    const taken = h.bashing + h.lethal + h.aggravated;
    const healthStr = `${hMax - taken}/${hMax}`;
    lines.push(
      "  " + pad(String(o.name ?? "?"), 20) + pad(arch?.label ?? archKey, 14) +
      pad(tier, 12) + pad(healthStr, 12) + o.id,
    );
  }
  u.send(lines.join("\n"));
}

// ---------------------------------------------------------------------------
// /show <name-or-id>  -- full stat block
// ---------------------------------------------------------------------------

async function findNpcObj(u: IUrsamuSDK, q: string): Promise<IDBObj | null> {
  const staff = isStaff(u.me);
  const hereId = u.here?.id;
  // deno-lint-ignore no-explicit-any
  const byId = await u.db.search({ id: q } as any);
  if (byId[0]) {
    const f = byId[0].flags as Set<string> | undefined;
    if (f?.has?.("npc")) {
      // Non-staff may only inspect NPCs that share their current room.
      if (staff || byId[0].location === hereId) return byId[0];
    }
  }
  const found = await u.util.target(u.me, q, true);
  if (found) {
    const f = found.flags as Set<string> | undefined;
    if (f?.has?.("npc")) {
      if (staff || found.location === hereId) return found;
    }
  }
  return null;
}

async function npcShow(u: IUrsamuSDK, rest: string): Promise<void> {
  const q = u.util.stripSubs(rest).trim();
  if (!q) { u.send("Syntax: +npc/show <name-or-id>"); return; }

  const npc = await findNpcObj(u, q);
  if (!npc) { u.send(`No NPC matches '${q}'.`); return; }

  const sheet = (npc.state?.cofd ?? {}) as CofdSheet & {
    npc?: { archetype: string; tier?: NpcTier; dreadPowers?: string[] };
  };
  const archKey = sheet.npc?.archetype ?? "unknown";
  const arch = NPC_ARCHETYPES[archKey];
  const tier = sheet.npc?.tier ?? arch?.tier ?? "minor";

  const lines: string[] = [];
  lines.push(await divider("N P C   S T A T   B L O C K"));
  lines.push(`  Name:      ${npc.name ?? "?"}`);
  lines.push(`  Concept:   ${sheet.concept ?? "(unknown)"}`);
  lines.push(`  Archetype: ${arch?.label ?? archKey}    Tier: ${tier}    Id: ${npc.id}`);
  lines.push("");

  const a = sheet.attributes;
  lines.push("  Attributes:");
  lines.push(`    Int ${a.intelligence} | Wit ${a.wits} | Res ${a.resolve}`);
  lines.push(`    Str ${a.strength} | Dex ${a.dexterity} | Sta ${a.stamina}`);
  lines.push(`    Pre ${a.presence} | Man ${a.manipulation} | Com ${a.composure}`);
  lines.push("");

  const skills = sheet.skills as Record<string, number>;
  const nonZero = Object.entries(skills)
    .filter(([, v]) => v > 0)
    .sort(([k1], [k2]) => k1.localeCompare(k2));
  if (nonZero.length) {
    lines.push("  Skills:");
    const parts = nonZero.map(([k, v]) => `${k} ${v}`);
    for (let i = 0; i < parts.length; i += 4) {
      lines.push("    " + parts.slice(i, i + 4).map((s) => pad(s, 18)).join(""));
    }
    lines.push("");
  }

  const merits = sheet.merits ?? {};
  if (Object.keys(merits).length) {
    lines.push("  Merits:");
    for (const [k, v] of Object.entries(merits)) {
      lines.push(`    ${k} ${v}`);
    }
    lines.push("");
  }

  lines.push("  Derived:");
  lines.push(`    Health:     ${sheetHealthMax(sheet)} (Stamina + Size)`);
  lines.push(`    Willpower:  ${sheet.advantages.willpowerMax} (Resolve + Composure)`);
  lines.push(`    Defense:    ${sheetDefense(sheet)}`);
  lines.push(`    Initiative: +${sheetInitiative(sheet)}`);
  lines.push(`    Speed:      ${sheetSpeed(sheet)}`);
  lines.push(`    Integrity:  ${sheet.moralityValue}`);
  lines.push("");

  const powers = sheet.npc?.dreadPowers ?? [];
  if (powers.length) {
    lines.push("  Dread Powers / Numina:");
    for (const key of powers) {
      const dp = getDreadPower(key);
      if (dp) {
        lines.push(`    ${pad(dp.label, 18)} ${dp.kind}   ${dp.cost}`);
        lines.push(`      ${dp.description}`);
      } else {
        lines.push(`    ${key} (unknown)`);
      }
    }
  }

  u.send(lines.join("\n"));
}

// ---------------------------------------------------------------------------
// /powers  -- list catalog
// ---------------------------------------------------------------------------

async function npcPowers(u: IUrsamuSDK): Promise<void> {
  const lines: string[] = [];
  lines.push(await divider("D R E A D   P O W E R S"));
  lines.push("  " + pad("Key", 16) + pad("Label", 18) + pad("Kind", 8) +
    pad("Tier", 10) + "Cost");
  lines.push("  " + "-".repeat(76));
  for (const p of listDreadPowers()) {
    lines.push("  " + pad(p.key, 16) + pad(p.label, 18) + pad(p.kind, 8) +
      pad(p.tierMin, 10) + p.cost);
  }
  lines.push("");
  lines.push("  Use +npc/addpower <npc>=<key> to attach a power to an NPC.");
  u.send(lines.join("\n"));
}

// ---------------------------------------------------------------------------
// /addpower /rmpower
// ---------------------------------------------------------------------------

async function npcPowerEdit(
  u: IUrsamuSDK, rest: string, mode: "add" | "rm",
): Promise<void> {
  if (!isStaff(u.me)) {
    u.send("Permission denied. Only staff may manage NPCs.");
    return;
  }
  const eqIdx = rest.indexOf("=");
  if (eqIdx < 0) {
    u.send(`Syntax: +npc/${mode}power <npc>=<power-key>`);
    return;
  }
  const npcName = u.util.stripSubs(rest.slice(0, eqIdx)).trim();
  const powerKey = u.util.stripSubs(rest.slice(eqIdx + 1)).trim().toLowerCase();
  if (!npcName || !powerKey) {
    u.send(`Syntax: +npc/${mode}power <npc>=<power-key>`);
    return;
  }

  const npc = await findNpcObj(u, npcName);
  if (!npc) { u.send(`No NPC matches '${npcName}'.`); return; }
  if (!(await u.canEdit(u.me, npc))) {
    u.send("Permission denied. You cannot edit that NPC.");
    return;
  }

  const power = getDreadPower(powerKey);
  if (!power) { u.send(`Unknown dread power '${powerKey}'. Try +npc/powers.`); return; }

  const sheet = (npc.state?.cofd ?? {}) as CofdSheet & {
    npc?: { archetype: string; tier: NpcTier; dreadPowers: string[] };
  };
  const tier = sheet.npc?.tier ?? "minor";
  const current = sheet.npc?.dreadPowers ?? [];

  let next: string[];
  if (mode === "add") {
    if (!tierMeetsPower(tier, power)) {
      u.send(`Tier '${tier}' cannot take '${power.label}' (requires ${power.tierMin}).`);
      return;
    }
    if (current.includes(power.key)) {
      u.send(`${npc.name ?? "NPC"} already has ${power.label}.`);
      return;
    }
    if (current.length >= tierPowerCap(tier)) {
      u.send(`Tier '${tier}' is capped at ${tierPowerCap(tier)} dread powers.`);
      return;
    }
    next = [...current, power.key];
  } else {
    if (!current.includes(power.key)) {
      u.send(`${npc.name ?? "NPC"} does not have ${power.label}.`);
      return;
    }
    next = current.filter((k) => k !== power.key);
  }

  const updatedNpc = {
    ...(sheet.npc ?? { archetype: "unknown", tier }),
    tier,
    dreadPowers: next,
  };
  await u.db.modify(npc.id, "$set", { "data.cofd": { ...sheet, npc: updatedNpc } });

  // Mirror to directory record.
  const rec = await findNpcByObjId(npc.id);
  if (rec) {
    try { await updateNpcPowers(rec.id, next); } catch { /* best-effort */ }
  }

  u.send(
    mode === "add"
      ? `Attached ${power.label} to ${npc.name ?? "NPC"}.`
      : `Removed ${power.label} from ${npc.name ?? "NPC"}.`,
  );
}

// ---------------------------------------------------------------------------
// /destroy
// ---------------------------------------------------------------------------

async function npcDestroy(u: IUrsamuSDK, rest: string): Promise<void> {
  if (!isStaff(u.me)) {
    u.send("Permission denied. Only staff may manage NPCs.");
    return;
  }
  const q = u.util.stripSubs(rest).trim();
  if (!q) { u.send("Syntax: +npc/destroy <name-or-id>"); return; }

  // deno-lint-ignore no-explicit-any
  const byId = await u.db.search({ id: q } as any);
  let target: IDBObj | undefined = byId[0];
  if (!target) {
    const found = await u.util.target(u.me, q, true);
    if (found) target = found;
  }
  if (!target) { u.send(`No NPC matches '${q}'.`); return; }

  const f = target.flags as Set<string> | undefined;
  if (!f?.has?.("npc")) {
    u.send(`'${target.name ?? q}' is not an NPC.`);
    return;
  }
  if (!(await u.canEdit(u.me, target))) {
    u.send("Permission denied. You cannot destroy that NPC.");
    return;
  }

  // Drop the directory record first (best-effort).
  const rec = await findNpcByObjId(target.id);
  if (rec) { try { await removeNpcRecord(rec.id); } catch { /* ignore */ } }

  await u.db.destroy(target.id);
  u.send(`Destroyed NPC ${target.name ?? target.id}.`);
}

// ---------------------------------------------------------------------------
// /ai <name>=<archetype>  -- set NPC AI archetype (builder+).
// ---------------------------------------------------------------------------

async function npcAi(u: IUrsamuSDK, rest: string): Promise<void> {
  if (!isStaff(u.me)) {
    u.send("Permission denied. Only staff may manage NPCs.");
    return;
  }
  const eqIdx = rest.indexOf("=");
  if (eqIdx < 0) {
    u.send(`Syntax: +npc/ai <name>=<archetype>. Valid: ${listArchetypes().join(", ")}.`);
    return;
  }
  const name = u.util.stripSubs(rest.slice(0, eqIdx)).trim();
  const archetype = u.util.stripSubs(rest.slice(eqIdx + 1)).trim().toLowerCase();
  if (!name || !archetype) {
    u.send(`Syntax: +npc/ai <name>=<archetype>. Valid: ${listArchetypes().join(", ")}.`);
    return;
  }
  const valid = listArchetypes();
  if (!valid.includes(archetype)) {
    u.send(`Unknown AI archetype '${archetype}'. Valid: ${valid.join(", ")}.`);
    return;
  }
  const npc = await findNpcObj(u, name);
  if (!npc) { u.send(`No NPC matches '${name}'.`); return; }
  if (!(await u.canEdit(u.me, npc))) {
    u.send("Permission denied. You cannot edit that NPC.");
    return;
  }
  const sheet = (npc.state?.cofd ?? {}) as CofdSheet & {
    npc?: { archetype?: string; tier?: NpcTier; aiArchetype?: string; dreadPowers?: string[]; lootTable?: string };
  };
  const updatedNpc = { ...(sheet.npc ?? {}), aiArchetype: archetype };
  await u.db.modify(npc.id, "$set", { "data.cofd": { ...sheet, npc: updatedNpc } });
  const rec = await findNpcByObjId(npc.id);
  if (rec) { try { await updateNpcAiArchetype(rec.id, archetype); } catch { /* swallow */ } }
  u.send(`Set ${npc.name ?? "NPC"} AI to '${archetype}'.`);
}

// ---------------------------------------------------------------------------
// /aggro-mode <name>=<mode>  -- override a single mob's aggro mode (staff).
// ---------------------------------------------------------------------------

async function npcAggroMode(u: IUrsamuSDK, rest: string): Promise<void> {
  if (!isStaff(u.me)) {
    u.send("Permission denied. Only staff may manage NPCs.");
    return;
  }
  const eqIdx = rest.indexOf("=");
  if (eqIdx < 0) {
    u.send("Syntax: +npc/aggro-mode <name-or-id>=<passive|territorial|hunter>");
    return;
  }
  const name = u.util.stripSubs(rest.slice(0, eqIdx)).trim();
  const mode = u.util.stripSubs(rest.slice(eqIdx + 1)).trim().toLowerCase();
  if (!name || !mode) {
    u.send("Syntax: +npc/aggro-mode <name-or-id>=<passive|territorial|hunter>");
    return;
  }
  const validModes = ["passive", "territorial", "hunter"];
  if (!validModes.includes(mode)) {
    u.send(`Unknown aggro mode '${mode}'. Valid: ${validModes.join(", ")}.`);
    return;
  }
  const npc = await findNpcObj(u, name);
  if (!npc) { u.send(`No NPC matches '${name}'.`); return; }
  if (!(await u.canEdit(u.me, npc))) {
    u.send("Permission denied. You cannot edit that NPC.");
    return;
  }
  const sheet = (npc.state?.cofd ?? {}) as CofdSheet & {
    npc?: { archetype?: string; tier?: NpcTier; aiArchetype?: string; aggro?: string; dreadPowers?: string[]; lootTable?: string };
  };
  await u.db.modify(npc.id, "$set", { "data.cofd": { ...sheet, npc: { ...(sheet.npc ?? {}), aggro: mode } } });
  u.send(`Set ${npc.name ?? "NPC"} aggro to '${mode}'.`);
}

// ---------------------------------------------------------------------------
// /aggro <name>=<targetName>  -- spike threat for a target (builder+).
// ---------------------------------------------------------------------------

async function npcAggro(u: IUrsamuSDK, rest: string): Promise<void> {
  if (!isStaff(u.me)) {
    u.send("Permission denied. Only staff may manage NPCs.");
    return;
  }
  const eqIdx = rest.indexOf("=");
  if (eqIdx < 0) {
    u.send("Syntax: +npc/aggro <name>=<target-name>");
    return;
  }
  const npcName = u.util.stripSubs(rest.slice(0, eqIdx)).trim();
  const targetName = u.util.stripSubs(rest.slice(eqIdx + 1)).trim();
  if (!npcName || !targetName) {
    u.send("Syntax: +npc/aggro <name>=<target-name>");
    return;
  }
  const npc = await findNpcObj(u, npcName);
  if (!npc) { u.send(`No NPC matches '${npcName}'.`); return; }
  if (!(await u.canEdit(u.me, npc))) {
    u.send("Permission denied. You cannot edit that NPC.");
    return;
  }
  const target = await u.util.target(u.me, targetName, true);
  if (!target) { u.send(`No target matches '${targetName}'.`); return; }
  if (!(await u.canEdit(u.me, target))) {
    u.send("Permission denied. You cannot key threat against that target.");
    return;
  }

  // Find this NPC in any active encounter in the room, spike participant.threat[targetId].
  const { getEncounterForRoom, encounterDb } = await import("../combat/encounter.ts");
  const roomId = u.here?.id;
  const enc = roomId ? await getEncounterForRoom(roomId) : null;
  if (!enc) { u.send("No active encounter here to spike threat in."); return; }
  const participants = enc.participants.map((p) => {
    if (p.actorId !== npc.id) return p;
    const threat = { ...(p.threat ?? {}) };
    threat[target.id] = 1000;
    return { ...p, threat };
  });
  // deno-lint-ignore no-explicit-any
  await encounterDb.update({ id: enc.id } as any, { ...enc, participants });
  u.send(`Spiked ${npc.name ?? "NPC"} threat toward ${target.name ?? "target"}.`);
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

export async function npcExec(u: IUrsamuSDK): Promise<void> {
  const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();
  const rest = u.cmd.args[1] ?? "";
  switch (sw) {
    case "":
    case "list":
      await npcList(u);
      return;
    case "create":
    case "build":
      await npcBuild(u, rest);
      return;
    case "show":
      await npcShow(u, rest);
      return;
    case "powers":
      await npcPowers(u);
      return;
    case "addpower":
      await npcPowerEdit(u, rest, "add");
      return;
    case "rmpower":
    case "removepower":
      await npcPowerEdit(u, rest, "rm");
      return;
    case "ai":
      await npcAi(u, rest);
      return;
    case "aggro":
      await npcAggro(u, rest);
      return;
    case "aggro-mode":
      await npcAggroMode(u, rest);
      return;
    case "destroy":
    case "remove":
      await npcDestroy(u, rest);
      return;
    default:
      u.send(
        `Unknown +npc switch '/${sw}'. Try /build, /list, /show, /powers, ` +
        `/addpower, /rmpower, or /destroy.`,
      );
  }
}

