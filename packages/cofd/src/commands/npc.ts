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
  objectStateFromSheet,
  sheetDefense,
  sheetFromTemplate,
  sheetHealthMax,
  sheetInitiative,
  sheetSpeed,
  tierPowerCap,
} from "../npc/archetypes.ts";
import { getNpcTemplate } from "../npc/catalog.ts";
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

const WIDTH = 78;
const INDENT = "  ";

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}

/** Visible length ignoring simple MUSH color codes. */
function visualLen(s: string): number {
  return s
    .replace(/%c[a-zA-Z]/g, "")
    .replace(/%[nrtbR]/g, "")
    .length;
}

/**
 * Wrap a word list into lines of at most `width` printable columns.
 * Prefixed lines already include indent in the returned strings.
 */
function wrapWords(
  words: string[],
  width: number,
  prefix = INDENT,
): string[] {
  if (words.length === 0) return [];
  const out: string[] = [];
  let line = prefix + words[0];
  for (let i = 1; i < words.length; i++) {
    const next = words[i];
    if (visualLen(line) + 1 + visualLen(next) > width) {
      out.push(line);
      line = prefix + next;
    } else {
      line += " " + next;
    }
  }
  if (line.trim()) out.push(line);
  return out;
}

/** Multi-column slug list, each row ≤ WIDTH. */
function formatSlugColumns(
  slugs: string[],
  cols = 3,
): string[] {
  if (slugs.length === 0) return [];
  const inner = WIDTH - INDENT.length;
  const colW = Math.floor(inner / cols);
  const lines: string[] = [];
  for (let i = 0; i < slugs.length; i += cols) {
    const chunk = slugs.slice(i, i + cols);
    const row = chunk.map((s, idx) => {
      if (idx === chunk.length - 1) return s;
      return pad(s, colW);
    }).join("");
    lines.push(INDENT + row);
  }
  return lines;
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

  const template = getNpcTemplate(spec.archetypeKey);
  if (!template) {
    u.send(
      `Unknown archetype '${spec.archetypeKey}'. ` +
        `Valid: ${archetypeKeys().join(", ")}.`,
    );
    return;
  }

  const tier = spec.tier ?? template.tier;
  const sheet = sheetFromTemplate(template, tier);
  const built = objectStateFromSheet(sheet, spec.name);
  const flags = new Set(built.flags);

  const npcObj = await u.db.create({
    name: built.name,
    flags,
    location: roomId,
    state: built.state,
    contents: [],
  });

  const record = {
    id: newNpcId(),
    name: spec.name,
    archetype: template.slug,
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
    `Created %ch${spec.name}%cn (${template.name}, tier ${tier}, ` +
      `id ${npcObj.id}). ` +
      `Health ${sheetHealthMax(sheet)}, ` +
      `Willpower ${sheet.advantages.willpowerMax}, ` +
      `Defense ${sheetDefense(sheet)}, ` +
      `Init +${sheetInitiative(sheet)}, Speed ${sheetSpeed(sheet)}.`,
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
    lines.push(
      "  No NPCs in this room.",
    );
    lines.push(
      "  Use +npc/build <name>=<archetype>[/<tier>].",
    );
    lines.push("  Templates:");
    lines.push(...formatSlugColumns(archetypeKeys(), 3));
    u.send(lines.join("\n"));
    return;
  }

  // Name 18 | Arch 16 | Tier 8 | HP 8 | Id rest  — fits 78 with indent.
  lines.push(
    INDENT + pad("Name", 18) + pad("Archetype", 16) +
      pad("Tier", 8) + pad("Health", 8) + "Id",
  );
  lines.push(INDENT + "-".repeat(WIDTH - INDENT.length));
  for (const o of npcs) {
    const sheet = (o.state?.cofd ?? {}) as CofdSheet & {
      npc?: { archetype: string; tier?: NpcTier };
    };
    const archKey = sheet.npc?.archetype ?? "unknown";
    const arch = NPC_ARCHETYPES[archKey];
    const tier = sheet.npc?.tier ?? arch?.tier ?? "minor";
    const hMax = arch
      ? archetypeHealthMax(arch)
      : (sheet.attributes?.stamina ?? 1) +
        (sheet.advantages?.size ?? 5);
    const h = sheet.health ?? {
      bashing: 0,
      lethal: 0,
      aggravated: 0,
    };
    const taken = h.bashing + h.lethal + h.aggravated;
    const healthStr = `${hMax - taken}/${hMax}`;
    const name = String(o.name ?? "?").slice(0, 17);
    const archLabel = (arch?.label ?? archKey).slice(0, 15);
    const id = String(o.id).slice(0, 24);
    const row =
      INDENT + pad(name, 18) + pad(archLabel, 16) +
      pad(tier, 8) + pad(healthStr, 8) + id;
    lines.push(row.slice(0, WIDTH));
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
  if (!isStaff(u.me)) {
    u.send("Permission denied. Only staff may view NPC stat blocks.");
    return;
  }
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
  const attrRow = (m: string, mVal: number, p: string, pVal: number, s: string, sVal: number) => {
    return "    " +
      pad(`${m} ${mVal}`, 24) +
      pad(`${p} ${pVal}`, 24) +
      pad(`${s} ${sVal}`, 24);
  };
  lines.push(attrRow("Intel", a.intelligence ?? 1, "Strength", a.strength ?? 1, "Presence", a.presence ?? 1));
  lines.push(attrRow("Wits", a.wits ?? 1, "Dexterity", a.dexterity ?? 1, "Manip", a.manipulation ?? 1));
  lines.push(attrRow("Resolve", a.resolve ?? 1, "Stamina", a.stamina ?? 1, "Composure", a.composure ?? 1));
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

  const maxHealth = sheetHealthMax(sheet);
  const track = sheet.health ?? { bashing: 0, lethal: 0, aggravated: 0 };
  const boxes: string[] = [];
  let agg = track.aggravated ?? 0;
  let leth = track.lethal ?? 0;
  let bash = track.bashing ?? 0;
  for (let i = 0; i < maxHealth; i++) {
    if (agg > 0) {
      boxes.push("[*]");
      agg -= 1;
    } else if (leth > 0) {
      boxes.push("[X]");
      leth -= 1;
    } else if (bash > 0) {
      boxes.push("[/]");
      bash -= 1;
    } else {
      boxes.push("[ ]");
    }
  }
  const healthStr = boxes.join("");

  lines.push("  Derived:");
  lines.push(`    Health:     ${healthStr}  (${maxHealth} max)`);
  lines.push(`    Willpower:  ${sheet.advantages.willpowerCurrent ?? sheet.advantages.willpowerMax}/${sheet.advantages.willpowerMax}`);
  lines.push(`    Defense:    ${sheetDefense(sheet)}`);
  lines.push(`    Initiative: +${sheetInitiative(sheet)}`);
  lines.push(`    Speed:      ${sheetSpeed(sheet)}`);
  lines.push(`    Integrity:  ${sheet.moralityValue}`);
  lines.push("");

  // Catalog spawn meta (JSON templates).
  // deno-lint-ignore no-explicit-any
  const meta = (sheet.npc ?? {}) as any;
  const metaLines: string[] = [];
  if (meta.aiArchetype) {
    metaLines.push(`    AI:        ${meta.aiArchetype}`);
  }
  if (meta.lineage) metaLines.push(`    Lineage:   ${meta.lineage}`);
  if (meta.presence) metaLines.push(`    Presence:  ${meta.presence}`);
  if (meta.aggro) metaLines.push(`    Aggro:     ${meta.aggro}`);
  if (meta.shortDesc) {
    const sd = String(meta.shortDesc);
    // Keep short-desc on its own wrapped lines (≤78).
    const head = "    Short-desc: ";
    if (visualLen(head + sd) <= WIDTH) {
      metaLines.push(head + sd);
    } else {
      metaLines.push(head.trimEnd());
      metaLines.push(
        ...wrapWords(sd.split(/\s+/), WIDTH, "      "),
      );
    }
  }
  const cf = sheet.customFields ?? {};
  if (cf.court) metaLines.push(`    Court:     ${cf.court}`);
  if (cf.seeming) metaLines.push(`    Seeming:   ${cf.seeming}`);
  if (cf.form) metaLines.push(`    Form:      ${cf.form}`);
  if (cf.faction) metaLines.push(`    Faction:   ${cf.faction}`);
  if (cf.tribe) metaLines.push(`    Tribe:     ${cf.tribe}`);
  if (sheet.powerStatValue) {
    metaLines.push(
      `    Power:     ${sheet.powerStatValue}  Energy: ${sheet.energyCurrent}`,
    );
  }
  if (metaLines.length) {
    lines.push("  Spawn / Template:");
    lines.push(...metaLines);
    lines.push("");
  }

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
  const valid = [...listArchetypes(), "manual", "off", "none"];
  if (eqIdx < 0) {
    u.send(
      `Syntax: +npc/ai <name>=<archetype>. Valid: ${valid.join(", ")}.`,
    );
    return;
  }
  const name = u.util.stripSubs(rest.slice(0, eqIdx)).trim();
  const archetype = u.util.stripSubs(rest.slice(eqIdx + 1)).trim().toLowerCase();
  if (!name || !archetype) {
    u.send(
      `Syntax: +npc/ai <name>=<archetype>. Valid: ${valid.join(", ")}.`,
    );
    return;
  }
  if (!valid.includes(archetype)) {
    u.send(
      `Unknown AI archetype '${archetype}'. Valid: ${valid.join(", ")}.`,
    );
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

  // Find this NPC in any active encounter in the room, spike threat.
  const {
    getEncounterForRoom,
    setParticipantThreat,
  } = await import("../combat/encounter.ts");
  const roomId = u.here?.id;
  const enc = roomId ? await getEncounterForRoom(roomId) : null;
  if (!enc) {
    u.send("No active encounter here to spike threat in.");
    return;
  }
  await setParticipantThreat(enc.id, npc.id, target.id, 1000);
  u.send(
    `Spiked ${npc.name ?? "NPC"} threat toward ${target.name ?? "target"}.`,
  );
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
        `/addpower, /rmpower, /ai, /aggro-mode, or /destroy.`,
      );
  }
}

