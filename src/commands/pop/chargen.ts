// deno-lint-ignore-file no-explicit-any no-unused-vars
/**
 * Price of Power: Character Generation System
 *
 * Commands:
 *   +setstat <sphere>           — select Vampire
 *   +setstat <clan>             — select clan
 *   +setstat/caste <caste>      — select caste (Salubri only)
 *   +setstat/priority <PMS|TSK> — set attribute or ability priority
 *   +setstat <stat>=<value>     — set stats, bio fields, abilities, etc.
 *   +check                      — view chargen status
 *   +progress                   — advance to next phase
 *   +revert                     — go back to previous phase
 *
 * Staff commands:
 *   +giftxp <player>=<amount>
 *   +advance <player>
 *   +approve <player>
 *   +wipe <player>
 *   +wipe/confirm <player>
 */

import { addCmd } from "../../services/commands/index.ts";
import { dbojs } from "../../services/Database/index.ts";
import { send } from "../../services/broadcast/index.ts";
import type { IUrsamuSDK } from "../../@types/UrsamuSDK.ts";

/** Send a message to a player by their database id (if connected). */
async function sendToPlayer(playerId: string, msg: string) {
  const { wsService } = await import("../../services/WebSocket/index.ts");
  const socket = wsService.getConnectedSockets().find((s: any) => s.cid === playerId);
  if (socket) send([socket.id], msg);
}

// ============================================================================
// CONSTANTS
// ============================================================================

const CHARGEN_ROOM = "6"; // dbref of chargen room

const SPHERE_LIST = ["Vampire"];

const ATTR_PRIORITY_DOTS = [7, 5, 3];
const ABIL_PRIORITY_DOTS = [13, 9, 5];

const ATTR_CATEGORIES: Record<string, string[]> = {
  Physical: ["Strength", "Dexterity", "Stamina"],
  Mental: ["Intelligence", "Wits", "Perception"],
  Social: ["Charisma", "Manipulation", "Appearance"],
};

const ABIL_CATEGORIES: Record<string, string[]> = {
  Talents: [] as string[],
  Skills: [] as string[],
  Knowledges: [] as string[],
};

const VIRTUE_NAMES: string[] = [];
const BACKGROUND_NAMES: string[] = [];
const DISCIPLINE_NAMES: string[] = [];
const ARCHETYPE_NAMES: string[] = [];

// Merit/flaw lookups: { lowercase: { key, category, points } }
const MERIT_LOOKUP = new Map<string, { key: string; category: string; points: number | number[] }>();
const FLAW_LOOKUP = new Map<string, { key: string; category: string; points: number | number[] }>();

// Alias → canonical name mapping for all stats (attributes, abilities, backgrounds, virtues, disciplines)
const STAT_ALIAS_MAP = new Map<string, string>();

// Clan data: { lowercase: { key, inclan_disciplines?, castes? } }
const CLAN_LOOKUP = new Map<string, Record<string, unknown>>();

// Merit/flaw exceptions
let CLAN_FORBIDDEN: Record<string, string[]> = {};
let INCOMPATIBLE_WITH: Record<string, string[]> = {};

const FREEBIE_COSTS = {
  attribute: 5,
  ability_lo: 1, // levels 1-3
  ability_hi: 2, // levels 4-5
  background: 1,
  discipline: 7,
  virtue: 2,
  willpower: 2,
  humanitas: 3,
};

const MERIT_MAX_POINTS = 10;
const MERIT_CAP_EXEMPT = new Set(["Language"]);
const FLAW_MAX_POINTS = 7;
const WP_MAX_CHARGEN = 8;

const BLOOD_POTENCY_POOL: Record<number, number> = { 1: 10, 2: 11, 3: 12, 4: 13, 5: 15 };

const COMMON_DISCIPLINES = new Set([
  "Animalism", "Auspex", "Celerity", "Dominate",
  "Fortitude", "Obfuscate", "Potence", "Presence",
]);

const BIO_FIELDS = new Set([
  "fullname", "full name", "birthyear", "birth year",
  "embraceyear", "embrace year", "concept", "nature",
  "demeanor", "sire",
]);

const SPHERE_DEFAULTS: Record<string, unknown> = {
  bg_points: 5,
  freebie_points: 15,
  virtue_points: 7,
  discipline_points: 3,
};

const INITIAL_STATS: Record<string, number> = {
  Conscience: 1, "Self-Control": 1, Courage: 1,
  Willpower: 1, "Willpower Current": 1,
  "Blood Potency": 1, Generation: 0,
  Humanitas: 10, "Generation Value": 11,
  "Blood Pool Max": 10, "Blood Pool": 10,
};

const DATA_DIR = "./system/scripts/pop/stats/data";

// ============================================================================
// DATA LOADING
// ============================================================================

let dataLoaded = false;

async function loadGameData() {
  if (dataLoaded) return;

  const loadJson = async (file: string) => {
    try {
      return JSON.parse(await Deno.readTextFile(`${DATA_DIR}/${file}`));
    } catch { return []; }
  };

  // Helper to register aliases for a stat entry
  const registerAliases = (entry: Record<string, unknown>) => {
    const key = entry.key as string;
    if (entry.aliases && Array.isArray(entry.aliases)) {
      for (const alias of entry.aliases) {
        STAT_ALIAS_MAP.set((alias as string).toLowerCase(), key);
      }
    }
    // Also map the key itself
    STAT_ALIAS_MAP.set(key.toLowerCase(), key);
  };

  // Load attributes
  const attributes = await loadJson("attributes.json");
  for (const a of attributes) registerAliases(a);

  // Load abilities
  const talents = await loadJson("talents.json");
  const skills = await loadJson("skills.json");
  const knowledges = await loadJson("knowledges.json");
  ABIL_CATEGORIES.Talents = talents.map((e: Record<string, unknown>) => e.key as string);
  ABIL_CATEGORIES.Skills = skills.map((e: Record<string, unknown>) => e.key as string);
  ABIL_CATEGORIES.Knowledges = knowledges.map((e: Record<string, unknown>) => e.key as string);
  for (const e of [...talents, ...skills, ...knowledges]) registerAliases(e);

  // Load virtues
  const virtues = await loadJson("virtues.json");
  VIRTUE_NAMES.push(...virtues.map((e: Record<string, unknown>) => e.key as string));
  for (const v of virtues) registerAliases(v);

  // Load backgrounds
  const backgrounds = await loadJson("backgrounds.json");
  BACKGROUND_NAMES.push(...backgrounds.map((e: Record<string, unknown>) => e.key as string));
  for (const b of backgrounds) registerAliases(b);

  // Load disciplines
  const disciplines = await loadJson("disciplines.json");
  DISCIPLINE_NAMES.push(...disciplines.map((e: Record<string, unknown>) => e.key as string));
  for (const d of disciplines) registerAliases(d);

  // Load archetypes
  const archetypes = await loadJson("archetypes.json");
  ARCHETYPE_NAMES.push(...archetypes.map((e: Record<string, unknown>) => e.key as string));
  for (const a of archetypes) registerAliases(a);

  // Load clans
  const clans = await loadJson("clans.json");
  for (const clan of clans) {
    CLAN_LOOKUP.set((clan.key as string).toLowerCase(), clan);
  }

  // Load merits/flaws
  const merits = await loadJson("merits.json");
  for (const m of merits) {
    MERIT_LOOKUP.set((m.key as string).toLowerCase(), { key: m.key, category: m.category, points: m.points });
    if (m.aliases) {
      for (const a of m.aliases) MERIT_LOOKUP.set(a.toLowerCase(), { key: m.key, category: m.category, points: m.points });
    }
  }
  const flaws = await loadJson("flaws.json");
  for (const f of flaws) {
    FLAW_LOOKUP.set((f.key as string).toLowerCase(), { key: f.key, category: f.category, points: f.points });
    if (f.aliases) {
      for (const a of f.aliases) FLAW_LOOKUP.set(a.toLowerCase(), { key: f.key, category: f.category, points: f.points });
    }
  }

  // Load exceptions
  try {
    const exc = JSON.parse(await Deno.readTextFile(`${DATA_DIR}/merit_flaw_exceptions.json`));
    CLAN_FORBIDDEN = exc.clan_forbidden || {};
    INCOMPATIBLE_WITH = exc.incompatible_with || {};
  } catch { /* no exceptions file */ }

  // Populate base stat names (these should never be stripped at 0)
  for (const names of Object.values(ATTR_CATEGORIES)) {
    for (const n of names) BASE_STAT_NAMES.add(n);
  }
  for (const names of Object.values(ABIL_CATEGORIES)) {
    for (const n of names) BASE_STAT_NAMES.add(n);
  }
  for (const n of VIRTUE_NAMES) BASE_STAT_NAMES.add(n);
  // Also keep derived stats
  for (const k of Object.keys(INITIAL_STATS)) BASE_STAT_NAMES.add(k);

  dataLoaded = true;
}

// ============================================================================
// HELPERS
// ============================================================================

function inChargenRoom(playerId: string, location: string | undefined): boolean {
  return location === CHARGEN_ROOM;
}

// Base stats that should never be stripped (attributes start at 1, abilities at 0, virtues at 1)
const BASE_STAT_NAMES = new Set<string>();

function getStats(data: Record<string, unknown>): Record<string, number> {
  return (data?.stats as Record<string, number>) || {};
}

/** Remove zero-value non-base stats (backgrounds, disciplines, merits, flaws) before saving. */
function cleanStats(stats: Record<string, number>): Record<string, number> {
  const clean: Record<string, number> = {};
  for (const [k, v] of Object.entries(stats)) {
    if (v === 0 && !BASE_STAT_NAMES.has(k)) continue;
    clean[k] = v;
  }
  return clean;
}

function getCgPhase(data: Record<string, unknown>): string {
  return (data?.cg_phase as string) || "";
}

function syncBloodPool(stats: Record<string, number>, bp: number) {
  const max = BLOOD_POTENCY_POOL[bp] || 10;
  stats["Blood Pool Max"] = max;
  stats["Blood Pool"] = max;
}

function getAllAttributes(): string[] {
  return [...ATTR_CATEGORIES.Physical, ...ATTR_CATEGORIES.Mental, ...ATTR_CATEGORIES.Social];
}

function getAllAbilities(): string[] {
  return [...ABIL_CATEGORIES.Talents, ...ABIL_CATEGORIES.Skills, ...ABIL_CATEGORIES.Knowledges];
}

function findAttrCategory(stat: string): string | null {
  const resolved = resolveAlias(stat);
  for (const [cat, names] of Object.entries(ATTR_CATEGORIES)) {
    if (names.some(n => n.toLowerCase() === resolved.toLowerCase())) return cat;
  }
  return null;
}

function checkAllPoolsSpent(sid: string, data: Record<string, unknown>) {
  const bg = (data.bg_points as number) || 0;
  const virt = (data.virtue_points as number) || 0;
  const disc = (data.discipline_points as number) || 0;
  if (bg === 0 && virt === 0 && disc === 0) {
    const missingBio: string[] = [];
    if (!data.fullname) missingBio.push("+setstat fullname=<name>");
    if (!data.birthyear) missingBio.push("+setstat birthyear=<year>");
    if (!data.embraceyear) missingBio.push("+setstat embraceyear=<year>");
    if (!data.concept) missingBio.push("+setstat concept=<concept>");
    if (!data.nature) missingBio.push("+setstat nature=<archetype>");
    if (!data.demeanor) missingBio.push("+setstat demeanor=<archetype>");
    if (!data.sire) missingBio.push("+setstat sire=<name>");
    if (missingBio.length > 0) {
      let msg = "\n%ch>GAME:%cn All point pools spent! Before you can %ch+progress%cn, set these bio fields:\n";
      for (const m of missingBio) msg += `  %cr*%cn ${m}\n`;
      send([sid], msg);
    } else {
      send([sid], "\n%ch>GAME:%cn All points and bio fields complete! Use %ch+progress%cn to advance to Phase 2.");
    }
  }
}

function formatYearDisplay(year: number): string {
  return year < 0 ? `${Math.abs(year)} BCE` : `${year} CE`;
}

function resolveAlias(name: string): string {
  return STAT_ALIAS_MAP.get(name.toLowerCase()) || name;
}

function findAbilCategory(stat: string): string | null {
  const resolved = resolveAlias(stat);
  for (const [cat, names] of Object.entries(ABIL_CATEGORIES)) {
    if (names.some(n => n.toLowerCase() === resolved.toLowerCase())) return cat;
  }
  return null;
}

function canonicalName(name: string, list: string[]): string | null {
  const resolved = resolveAlias(name);
  return list.find(n => n.toLowerCase() === resolved.toLowerCase()) || null;
}

function getInclanDisciplines(clanData: Record<string, unknown>, caste?: string): string[] {
  if (caste) {
    const key = `${caste.toLowerCase()}_inclan_disciplines`;
    if (clanData[key]) return clanData[key] as string[];
  }
  if (clanData.inclan_disciplines) return clanData.inclan_disciplines as string[];
  return [];
}

function getClanCastes(clanData: Record<string, unknown>): string[] {
  const castes: string[] = [];
  for (const key of Object.keys(clanData)) {
    const match = key.match(/^(.+)_inclan_disciplines$/);
    if (match) castes.push(match[1].charAt(0).toUpperCase() + match[1].slice(1));
  }
  return castes.sort();
}

function totalMeritPoints(stats: Record<string, number>): number {
  let total = 0;
  for (const [key, val] of Object.entries(stats)) {
    if (val > 0 && MERIT_LOOKUP.has(key.toLowerCase()) && !MERIT_CAP_EXEMPT.has(key)) {
      total += val;
    }
  }
  return total;
}

function totalFlawPoints(stats: Record<string, number>): number {
  let total = 0;
  for (const [key, val] of Object.entries(stats)) {
    if (val > 0 && FLAW_LOOKUP.has(key.toLowerCase())) {
      total += val;
    }
  }
  return total;
}

// Phase 2 floor enforcement: can't lower below Phase 1 snapshot
function checkPhaseFloor(data: Record<string, unknown>, canonical: string, newVal: number): string | null {
  const phase1Stats = data.phase1_stats as Record<string, number> | undefined;
  if (!phase1Stats) return null;
  const floor = phase1Stats[canonical];
  if (floor !== undefined && newVal < floor) {
    return `Cannot lower ${canonical} below Phase 1 value of ${floor}.`;
  }
  return null;
}

// Cap enforcement: max 1 stat at 5, max 2 stats at 4+
function checkStatCap(stats: Record<string, number>, statList: string[], canonical: string, newVal: number): string | null {
  if (newVal < 4) return null; // no cap issues below 4

  // Count how many OTHER stats in this group are at 4+ and 5
  let at5 = 0;
  let at4plus = 0;
  for (const name of statList) {
    if (name === canonical) continue;
    const v = stats[name] || 0;
    if (v >= 5) at5++;
    if (v >= 4) at4plus++;
  }

  if (newVal >= 5 && at5 >= 1) {
    return "Only 1 stat in this category can be at 5.";
  }
  if (newVal >= 4 && at4plus >= 2) {
    return "Only 2 stats in this category can be at 4 or higher.";
  }
  return null;
}

// Auspex-Awareness dependency
function checkAuspexAwareness(stats: Record<string, number>, canonical: string, newVal: number): string | null {
  // Setting Awareness requires Auspex 1+
  if (canonical === "Awareness" && newVal > 0 && (stats["Auspex"] || 0) < 1) {
    return "Awareness requires Auspex 1 or higher.";
  }
  // Removing Auspex requires Awareness 0
  if (canonical === "Auspex" && newVal < 1 && (stats["Awareness"] || 0) > 0) {
    return "Cannot remove Auspex while Awareness is set. Remove Awareness first.";
  }
  return null;
}

// Thin Blood / Generation interdependency
function checkThinBloodGeneration(stats: Record<string, number>, canonical: string, newVal: number): string | null {
  const hasThinBlood = (stats["Thin Blood"] || 0) > 0;
  // Can't raise Generation if Thin Blood is taken
  if (canonical === "Generation" && newVal > 0 && hasThinBlood) {
    return "Cannot raise Generation while Thin Blood flaw is active.";
  }
  // Can't take Thin Blood if Generation > 0
  if (canonical === "Thin Blood" && newVal > 0 && (stats["Generation"] || 0) > 0) {
    return "Thin Blood requires Generation 0 (no background points spent on Generation).";
  }
  return null;
}

// Additional Discipline merit: check if discipline is accessible
function isDisciplineAccessible(
  discName: string, inclan: string[], stats: Record<string, number>
): boolean {
  // In-clan always accessible
  if (inclan.some(d => d.toLowerCase() === discName.toLowerCase())) return true;
  // Additional Discipline merit grants ONE common out-of-clan discipline
  if ((stats["Additional Discipline"] || 0) > 0 && COMMON_DISCIPLINES.has(discName)) {
    // Check if another out-of-clan common discipline is already raised
    const existingOutOfClan = getExistingAdditionalDiscipline(inclan, stats);
    if (!existingOutOfClan || existingOutOfClan.toLowerCase() === discName.toLowerCase()) return true;
    // Another out-of-clan discipline is already using the merit slot
    return false;
  }
  return false;
}

// Find which out-of-clan common discipline is already raised (if any)
function getExistingAdditionalDiscipline(
  inclan: string[], stats: Record<string, number>
): string | null {
  for (const disc of COMMON_DISCIPLINES) {
    if (inclan.some(d => d.toLowerCase() === disc.toLowerCase())) continue; // skip in-clan
    if ((stats[disc] || 0) > 0) return disc;
  }
  return null;
}

// ============================================================================
// +SETSTAT COMMAND
// ============================================================================

export function registerChargenCommands() {
  addCmd({
    name: "+setstat",
    pattern: /^\+setstat(?:\/(\w+))?\s+(.*)/i,
    lock: "",
    exec: async (u: IUrsamuSDK) => {
      const sid = u.socketId || "";
      await loadGameData();

      // Get player data from DB
      const playerObj = await dbojs.queryOne({ id: u.me.id });
      if (!playerObj) return send([sid], "Error: player not found.");
      const data = playerObj.data || {};

      // Check chargen room
      if (!inChargenRoom(u.me.id, playerObj.location)) {
        send([sid], "%ch>GAME:%cn Character generation can only be done in the Chargen room.");
        return;
      }

      const switchArg = (u.cmd.args[0] || "").toLowerCase(); // from /switch
      const rawArgs = (u.cmd.args[1] || "").trim();

      // --- /priority switch ---
      if (switchArg === "priority") {
        await handlePriority(sid, playerObj, data, rawArgs);
        return;
      }

      // --- /caste switch ---
      if (switchArg === "caste") {
        await handleCaste(sid, playerObj, data, rawArgs);
        return;
      }

      // --- No switch: parse <stat>=<value> or <sphere/clan> ---
      const eqIdx = rawArgs.indexOf("=");

      if (eqIdx === -1) {
        // No = sign — could be sphere or clan selection
        await handleSphereOrClan(sid, playerObj, data, rawArgs);
        return;
      }

      const statName = rawArgs.slice(0, eqIdx).trim();
      const value = rawArgs.slice(eqIdx + 1).trim();

      if (!statName) return send([sid], "Usage: +setstat <stat>=<value>");

      // Route to appropriate handler
      await handleSetStat(sid, playerObj, data, statName, value);
    },
  });

  // ============================================================================
  // +CHECK COMMAND
  // ============================================================================

  addCmd({
    name: "+check",
    pattern: /^\+check$/i,
    lock: "",
    exec: async (u: IUrsamuSDK) => {
      const sid = u.socketId || "";
      await loadGameData();

      const playerObj = await dbojs.queryOne({ id: u.me.id });
      if (!playerObj) return send([sid], "Error: player not found.");

      if (!inChargenRoom(u.me.id, playerObj.location)) {
        send([sid], "%ch>GAME:%cn You must be in the Chargen room.");
        return;
      }

      const data = playerObj.data || {};
      if (data.approved) {
        send([sid], "%ch>GAME:%cn Your character has been approved. Chargen commands are no longer available.");
        return;
      }
      const stats = getStats(data);
      const phase = getCgPhase(data);

      // Phase 2.5: awaiting note review
      if (phase === "2.5") {
        send([sid], "%ch>GAME:%cn %chPhase 2.5 - Awaiting note review.%cn Stats are locked.\nUse %ch+revert%cn to return to Phase 2 if you need to make changes.");
        return;
      }

      // Phase 2: freebie spending
      if (phase === "2") {
        const freebies = (data.freebie_points as number) || 0;
        if (freebies > 0) {
          let msg = `%ch>GAME:%cn You have %ch${freebies}%cn freebie point(s) to spend.`;
          const humanitas = stats["Humanitas"] || 10;
          if (humanitas > 7) {
            const potential = (humanitas - 7) * 3;
            msg += `\n%chTip:%cn You can lower Humanitas (currently ${humanitas}) for 3 freebies per point (min 7). Use %ch+setstat Humanitas=<value>%cn for up to %ch${potential}%cn more freebies.`;
          }
          send([sid], msg);
        } else {
          send([sid], "%ch>GAME:%cn All freebie points spent. Use %ch+progress%cn to submit for note review.");
        }
        return;
      }

      // Phase 3: XP spending
      if (phase === "3") {
        const submitted = data.approval_submitted;
        if (submitted) {
          send([sid], "%ch>GAME:%cn %chPhase 3 - XP Spending.%cn\n%cgApproval submitted.%cn Awaiting staff review.");
          return;
        }
        const xp = (data.xp as number) || 0;
        if (xp > 3) {
          send([sid], `%ch>GAME:%cn %chPhase 3 - XP Spending.%cn\nYou have %ch${xp}%cn XP remaining to spend with %ch+setstat%cn.`);
        } else if (xp > 0) {
          send([sid], `%ch>GAME:%cn %chPhase 3 - XP Spending.%cn\nYou have %ch${xp}%cn XP remaining (under threshold - eligible to submit).\nUse %ch+progress%cn to submit for approval.`);
        } else {
          send([sid], "%ch>GAME:%cn %chPhase 3 - XP Spending.%cn\nAll XP spent. Use %ch+progress%cn to submit for approval.");
        }
        return;
      }

      // Phase 1 guided flow — tell them the NEXT step

      // 1. Sphere
      if (!data.sphere) {
        const spheres = SPHERE_LIST.map(s => `%ch${s}%cn`).join(", ");
        send([sid], `%ch>GAME:%cn You need to set your sphere. Available: ${spheres}\nUse %ch+setstat <sphere>%cn to begin.`);
        return;
      }

      // 2. Clan
      if (!data.clan) {
        const clans = [...CLAN_LOOKUP.values()].map(c => `%ch${c.key}%cn`).join(", ");
        send([sid], `%ch>GAME:%cn You need to set your clan. Available: ${clans}\nUse %ch+setstat <clan>%cn to make your selection.`);
        return;
      }

      // 2.5 Caste
      const clanData = CLAN_LOOKUP.get((data.clan as string).toLowerCase());
      if (clanData) {
        const castes = getClanCastes(clanData);
        if (castes.length > 0 && !data.caste) {
          const casteList = castes.map(c => `%ch${c}%cn`).join(", ");
          send([sid], `%ch>GAME:%cn Clan ${data.clan} requires a caste. Available: ${casteList}\nUse %ch+setstat/caste <caste>%cn to select.`);
          return;
        }
      }

      // 3. Attribute priority
      if (!data.attr_priority) {
        send([sid], "%ch>GAME:%cn You need to set your attribute priority. Use %ch+setstat/priority%cn with %chP%cn for Physical, %chM%cn for Mental, and %chS%cn for Social.\nExample: %ch+setstat/priority MSP%cn");
        return;
      }

      // 4. Attribute dots
      const attrRemain = data.attr_dots_remaining as Record<string, number> | undefined;
      if (attrRemain && Object.values(attrRemain).some(v => v > 0)) {
        const phys = attrRemain["Physical"] || 0;
        const ment = attrRemain["Mental"] || 0;
        const soc = attrRemain["Social"] || 0;
        send([sid], `%ch>GAME:%cn You have %ch${phys}%cn Physical, %ch${ment}%cn Mental, and %ch${soc}%cn Social point(s) remaining.\nUse %ch+setstat <attribute>=<value>%cn to spend them.`);
        return;
      }

      // 5. Ability priority
      if (!data.abil_priority) {
        send([sid], "%ch>GAME:%cn You need to set your ability priority. Use %ch+setstat/priority%cn with %chT%cn for Talents, %chS%cn for Skills, and %chK%cn for Knowledges.\nExample: %ch+setstat/priority TSK%cn");
        return;
      }

      // 6. Ability dots
      const abilRemain = data.abil_dots_remaining as Record<string, number> | undefined;
      if (abilRemain && Object.values(abilRemain).some(v => v > 0)) {
        const tal = abilRemain["Talents"] || 0;
        const skl = abilRemain["Skills"] || 0;
        const kno = abilRemain["Knowledges"] || 0;
        send([sid], `%ch>GAME:%cn You have %ch${tal}%cn Talent, %ch${skl}%cn Skill, and %ch${kno}%cn Knowledge point(s) remaining.\nUse %ch+setstat <ability>=<value>%cn to spend them.`);
        return;
      }

      // 7. Remaining pools (bg, virtue, discipline)
      const bgPts = (data.bg_points as number) || 0;
      const virtuePts = (data.virtue_points as number) || 0;
      const discPts = (data.discipline_points as number) || 0;

      const pools: string[] = [];
      if (bgPts > 0) pools.push(`%ch${bgPts}%cn background point(s)`);
      if (discPts > 0) pools.push(`%ch${discPts}%cn discipline point(s)`);
      if (virtuePts > 0) pools.push(`%ch${virtuePts}%cn virtue point(s)`);

      if (pools.length > 0) {
        let poolStr: string;
        if (pools.length === 1) poolStr = pools[0];
        else if (pools.length === 2) poolStr = `${pools[0]} and ${pools[1]}`;
        else poolStr = `${pools.slice(0, -1).join(", ")}, and ${pools[pools.length - 1]}`;

        let msg = `%ch>GAME:%cn You have ${poolStr} to spend.`;

        // Show in-clan disciplines if discipline points remain
        if (discPts > 0 && clanData) {
          const caste = data.caste as string | undefined;
          const inclan = getInclanDisciplines(clanData, caste);
          if (inclan.length > 0) {
            msg += `\n%chIn-clan disciplines:%cn ${inclan.map(d => `%ch${d}%cn`).join(", ")}`;
            msg += `\nUse %ch+setstat <discipline>=<value>%cn to spend them.`;
          }
        }

        // Humanitas tip
        const humanitas = stats["Humanitas"] || 10;
        if (humanitas > 7) {
          const potential = (humanitas - 7) * 3;
          msg += `\n%chTip:%cn You can lower Humanitas (currently ${humanitas}) for 3 freebies per point (min 7). Use %ch+setstat Humanitas=<value>%cn for up to %ch${potential}%cn extra freebies.`;
        }

        send([sid], msg);
      } else {
        // All points spent -- check bio fields
        const missingBio: string[] = [];
        if (!data.fullname) missingBio.push("+setstat fullname=<name>");
        if (!data.birthyear) missingBio.push("+setstat birthyear=<year>");
        if (!data.embraceyear) missingBio.push("+setstat embraceyear=<year>");
        if (!data.concept) missingBio.push("+setstat concept=<concept>");
        if (!data.nature) missingBio.push("+setstat nature=<archetype>");
        if (!data.demeanor) missingBio.push("+setstat demeanor=<archetype>");
        if (!data.sire) missingBio.push("+setstat sire=<name>");

        if (missingBio.length > 0) {
          let bioMsg = "%ch>GAME:%cn All points spent! Before you can %ch+progress%cn, set these bio fields:\n";
          for (const m of missingBio) bioMsg += `  %cr*%cn ${m}\n`;
          send([sid], bioMsg);
        } else {
          send([sid], "%ch>GAME:%cn All points spent. Use %ch+progress%cn to advance to Phase 2 (Freebie Spending)!");
        }
      }
    },
  });

  // ============================================================================
  // +PROGRESS COMMAND
  // ============================================================================

  addCmd({
    name: "+progress",
    pattern: /^\+progress$/i,
    lock: "",
    exec: async (u: IUrsamuSDK) => {
      const sid = u.socketId || "";
      await loadGameData();

      const playerObj = await dbojs.queryOne({ id: u.me.id });
      if (!playerObj) return send([sid], "Error: player not found.");
      const data = playerObj.data || {};

      if (!inChargenRoom(u.me.id, playerObj.location)) {
        send([sid], "%ch>GAME:%cn You must be in the Chargen room.");
        return;
      }

      if (data.approved) {
        send([sid], "%ch>GAME:%cn Your character has been approved. Chargen commands are no longer available.");
        return;
      }

      const phase = getCgPhase(data);
      const stats = getStats(data);

      if (phase === "1") {
        // Validate Phase 1 completion
        const errors: string[] = [];

        // Check priorities set
        if (!data.attr_priority) errors.push("Attribute priority not set (+setstat/priority <PMS>)");
        if (!data.abil_priority) errors.push("Ability priority not set (+setstat/priority <TSK>)");

        // Check all attribute dots spent
        const attrRemain = data.attr_dots_remaining as Record<string, number> | undefined;
        if (attrRemain) {
          for (const [cat, dots] of Object.entries(attrRemain)) {
            if (dots > 0) errors.push(`${cat} attributes: ${dots} dots remaining`);
          }
        }

        // Check all ability dots spent
        const abilRemain = data.abil_dots_remaining as Record<string, number> | undefined;
        if (abilRemain) {
          for (const [cat, dots] of Object.entries(abilRemain)) {
            if (dots > 0) errors.push(`${cat} abilities: ${dots} dots remaining`);
          }
        }

        // Check pools
        if ((data.bg_points as number || 0) > 0) errors.push(`${data.bg_points} background points remaining`);
        if ((data.virtue_points as number || 0) > 0) errors.push(`${data.virtue_points} virtue points remaining`);
        if ((data.discipline_points as number || 0) > 0) errors.push(`${data.discipline_points} discipline points remaining`);

        // Check caste for clans that need it
        if (data.clan) {
          const clanData = CLAN_LOOKUP.get((data.clan as string).toLowerCase());
          if (clanData) {
            const castes = getClanCastes(clanData);
            if (castes.length > 0 && !data.caste) {
              errors.push(`Caste not set (use +setstat/caste). Options: ${castes.join(", ")}`);
            }
          }
        }

        // Check required bio fields
        if (!data.fullname) errors.push("Full name not set (+setstat fullname=<name>)");
        if (!data.birthyear) errors.push("Birth year not set (+setstat birthyear=<year>)");
        if (!data.embraceyear) errors.push("Embrace year not set (+setstat embraceyear=<year>)");
        if (!data.concept) errors.push("Concept not set (+setstat concept=<concept>)");
        if (!data.nature) errors.push("Nature not set (+setstat nature=<archetype>)");
        if (!data.demeanor) errors.push("Demeanor not set (+setstat demeanor=<archetype>)");
        if (!data.sire) errors.push("Sire not set (+setstat sire=<name>)");

        if (errors.length > 0) {
          let out = "%ch>GAME:%cn Cannot advance to Phase 2. Remaining:\n";
          for (const e of errors) out += `  %cr*%cn ${e}\n`;
          send([sid], out);
          return;
        }

        // Snapshot and advance
        await dbojs.modify({ id: playerObj.id }, "$set", {
          "data.phase1_stats": { ...stats },
          "data.phase1_freebie_points": data.freebie_points,
          "data.cg_phase": "2",
        } as any);

        send([sid], "%ch>GAME:%cn Phase 1 complete! You are now in %chPhase 2: Freebie Spending%cn.\nUse +setstat to spend your freebie points on enhancements.");
        return;
      }

      if (phase === "2") {
        const errors: string[] = [];
        if ((data.freebie_points as number || 0) > 0) errors.push(`${data.freebie_points} freebie points remaining`);
        // TODO: check required notes

        if (errors.length > 0) {
          let out = "%ch>GAME:%cn Cannot advance. Remaining:\n";
          for (const e of errors) out += `  %cr*%cn ${e}\n`;
          send([sid], out);
          return;
        }

        await dbojs.modify({ id: playerObj.id }, "$set", {
          "data.phase2_stats": { ...stats },
          "data.cg_phase": "2.5",
          "data.freebie_review_submitted": true,
        } as any);

        send([sid], "%ch>GAME:%cn Phase 2 complete! Your character has been submitted for staff review.\nPlease wait for staff to run %ch+advance%cn.");
        return;
      }

      if (phase === "3") {
        const xp = (data.xp as number) || 0;
        if (xp > 3) {
          send([sid], `%ch>GAME:%cn You have ${xp} XP remaining. Spend down to 3 or less before submitting.`);
          return;
        }
        // TODO: check required notes approved

        await dbojs.modify({ id: playerObj.id }, "$set", {
          "data.approval_submitted": true,
        } as any);

        send([sid], "%ch>GAME:%cn Your character has been submitted for final approval. Staff will review shortly.");
        return;
      }

      send([sid], "%ch>GAME:%cn Nothing to progress. Use +setstat to begin character generation.");
    },
  });

  // ============================================================================
  // +REVERT COMMAND
  // ============================================================================

  addCmd({
    name: "+revert",
    pattern: /^\+revert$/i,
    lock: "",
    exec: async (u: IUrsamuSDK) => {
      const sid = u.socketId || "";

      const playerObj = await dbojs.queryOne({ id: u.me.id });
      if (!playerObj) return send([sid], "Error: player not found.");
      const data = playerObj.data || {};

      if (!inChargenRoom(u.me.id, playerObj.location)) {
        send([sid], "%ch>GAME:%cn You must be in the Chargen room.");
        return;
      }

      if (data.approved) {
        send([sid], "%ch>GAME:%cn Your character has been approved. Chargen commands are no longer available.");
        return;
      }

      const phase = getCgPhase(data);

      if (phase === "2.5") {
        // Check confirmation gate
        const confirmTime = data._revert_confirm as number | undefined;
        if (confirmTime && (Date.now() - confirmTime) < 30000) {
          // Confirmed — lightweight revert to Phase 2
          await dbojs.modify({ id: playerObj.id }, "$set", {
            "data.cg_phase": "2",
            "data.freebie_review_submitted": false,
          } as any);
          await dbojs.modify({ id: playerObj.id }, "$unset", { "data.phase2_stats": 1, "data._revert_confirm": 1 } as any);
          send([sid], "%ch>GAME:%cn Reverted to Phase 2. You can continue spending freebie points.");
          return;
        }
        // First attempt — warn and set timer
        await dbojs.modify({ id: playerObj.id }, "$set", { "data._revert_confirm": Date.now() } as any);
        send([sid], "%ch>GAME:%cn %crWARNING:%cn This will revert to Phase 2 and discard your submission. Type %ch+revert%cn again within 30 seconds to confirm.");
        return;
      }

      if (phase === "2") {
        // Check confirmation gate
        const confirmTime = data._revert_confirm as number | undefined;
        if (confirmTime && (Date.now() - confirmTime) < 30000) {
          // Confirmed — full revert to Phase 1
          const phase1Stats = data.phase1_stats as Record<string, number> | undefined;
          const phase1Freebies = data.phase1_freebie_points as number | undefined;

          if (!phase1Stats) {
            send([sid], "%ch>GAME:%cn No Phase 1 snapshot found. Cannot revert.");
            return;
          }

          await dbojs.modify({ id: playerObj.id }, "$set", {
            "data.stats": { ...phase1Stats },
            "data.freebie_points": phase1Freebies ?? 15,
            "data.cg_phase": "1",
            "data.bg_points": 0,
            "data.virtue_points": 0,
            "data.discipline_points": 0,
          } as any);
          await dbojs.modify({ id: playerObj.id }, "$unset", { "data._revert_confirm": 1 } as any);

          send([sid], "%ch>GAME:%cn Reverted to Phase 1. All Phase 2 spending has been undone.");
          return;
        }
        // First attempt — warn and set timer
        await dbojs.modify({ id: playerObj.id }, "$set", { "data._revert_confirm": Date.now() } as any);
        send([sid], "%ch>GAME:%cn %crWARNING:%cn This will revert to Phase 1 and discard ALL freebie spending. Type %ch+revert%cn again within 30 seconds to confirm.");
        return;
      }

      if (phase === "3") {
        send([sid], "%ch>GAME:%cn Phase 3 is permanent. You cannot revert.");
        return;
      }

      send([sid], "%ch>GAME:%cn Nothing to revert.");
    },
  });

  // ============================================================================
  // STAFF: +advance
  // ============================================================================

  addCmd({
    name: "+advance",
    pattern: /^\+advance\s+(.+)/i,
    lock: "superuser | admin+ | wizard",
    exec: async (u: IUrsamuSDK) => {
      const sid = u.socketId || "";
      const targetName = (u.cmd.args[0] || "").trim();

      const results = await dbojs.query({ "data.name": new RegExp(`^${targetName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, "i") });
      const target = results.find(o => o.flags.includes("player"));
      if (!target) return send([sid], "Player not found.");

      const data = target.data || {};
      if (getCgPhase(data) !== "2.5") {
        send([sid], `%ch>GAME:%cn ${data.name} is not in Phase 2.5 (currently: ${getCgPhase(data)}).`);
        return;
      }
      if (!data.freebie_review_submitted) {
        send([sid], `%ch>GAME:%cn ${data.name} has not submitted their freebie review yet.`);
        return;
      }

      await dbojs.modify({ id: target.id }, "$set", { "data.cg_phase": "3" } as any);
      send([sid], `%ch>GAME:%cn ${data.name} advanced to Phase 3 (XP spending).`);
      sendToPlayer(target.id, `%ch>GAME:%cn %cgYou have been advanced to Phase 3 by staff.%cn You can now spend XP with %ch+setstat%cn.`);
    },
  });

  // ============================================================================
  // STAFF: +approve
  // ============================================================================

  addCmd({
    name: "+approve",
    pattern: /^\+approve\s+(.+)/i,
    lock: "superuser | admin+ | wizard",
    exec: async (u: IUrsamuSDK) => {
      const sid = u.socketId || "";
      const targetName = (u.cmd.args[0] || "").trim();

      const results = await dbojs.query({ "data.name": new RegExp(`^${targetName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, "i") });
      const target = results.find(o => o.flags.includes("player"));
      if (!target) return send([sid], "Player not found.");

      const tData = target.data || {};
      const tPhase = getCgPhase(tData);

      if (tPhase !== "3") {
        send([sid], `%ch>GAME:%cn ${tData.name} is not in Phase 3 (currently: ${tPhase}).`);
        return;
      }
      if (!tData.approval_submitted) {
        send([sid], `%ch>GAME:%cn ${tData.name} has not submitted for approval yet.`);
        return;
      }
      if (tData.approved) {
        send([sid], `%ch>GAME:%cn ${tData.name} is already approved.`);
        return;
      }

      await dbojs.modify({ id: target.id }, "$set", {
        "data.approved": true,
        "data.cg_phase": "approved",
      } as any);

      // Move to OOC Polis only if currently in CG room
      if (target.location === CHARGEN_ROOM) {
        await dbojs.modify({ id: target.id }, "$set", { location: "1" } as any);
      }

      send([sid], `%ch>GAME:%cn ${tData.name} has been approved for play!`);
      sendToPlayer(target.id, `%ch>GAME:%cn %cgYou have been approved for IC play!%cn Welcome to the game.`);
    },
  });

  // ============================================================================
  // STAFF: +giftxp
  // ============================================================================

  addCmd({
    name: "+giftxp",
    pattern: /^\+giftxp\s+(.+)\s*=\s*(\d+)/i,
    lock: "superuser | admin+ | wizard",
    exec: async (u: IUrsamuSDK) => {
      const sid = u.socketId || "";
      const targetName = (u.cmd.args[0] || "").trim();
      const amount = parseInt(u.cmd.args[1] || "0");
      if (isNaN(amount) || amount <= 0) return send([sid], "%ch>GAME:%cn Amount must be a positive number.");

      const results = await dbojs.query({ "data.name": new RegExp(`^${targetName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, "i") });
      const target = results.find(o => o.flags.includes("player"));
      if (!target) return send([sid], "Player not found.");

      const current = (target.data?.xp as number) || 0;
      await dbojs.modify({ id: target.id }, "$set", { "data.xp": current + amount } as any);

      send([sid], `%ch>GAME:%cn Granted ${amount} XP to ${target.data?.name}. Total: ${current + amount}.`);
      sendToPlayer(target.id, `%ch>GAME:%cn %cgYou have been granted ${amount} XP by staff.%cn Total: ${current + amount}.`);
    },
  });

  // ============================================================================
  // STAFF: +wipe
  // ============================================================================

  addCmd({
    name: "+wipe",
    pattern: /^\+wipe(?:\/(\w+))?\s+(.+)/i,
    lock: "superuser | admin+ | wizard",
    exec: async (u: IUrsamuSDK) => {
      const sid = u.socketId || "";
      const sw = (u.cmd.args[0] || "").toLowerCase();
      const targetName = (u.cmd.args[1] || "").trim();

      const results = await dbojs.query({ "data.name": new RegExp(`^${targetName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, "i") });
      const target = results.find(o => o.flags.includes("player"));
      if (!target) return send([sid], "Player not found.");

      if (sw !== "confirm") {
        send([sid], `%ch>GAME:%cn This will wipe ALL chargen data for ${target.data?.name}. Use %ch+wipe/confirm ${targetName}%cn to proceed.`);
        return;
      }

      const wipeKeys = [
        "sphere", "clan", "caste", "cg_phase", "chargen_phase",
        "attr_priority", "abil_priority", "attr_dots_remaining", "abil_dots_remaining",
        "bg_points", "freebie_points", "virtue_points", "discipline_points", "xp",
        "stats", "phase1_stats", "phase2_stats", "phase1_freebie_points",
        "freebie_review_submitted", "approval_submitted", "approved",
        "_pending_confirm", "fullname", "birthyear", "embraceyear",
        "concept", "nature", "demeanor", "sire",
      ];

      const unsetObj: Record<string, number> = {};
      for (const k of wipeKeys) unsetObj[`data.${k}`] = 1;
      await dbojs.modify({ id: target.id }, "$unset", unsetObj as any);

      // Move to chargen room
      await dbojs.modify({ id: target.id }, "$set", { location: CHARGEN_ROOM } as any);

      send([sid], `%ch>GAME:%cn ${target.data?.name} has been wiped and moved to Chargen.`);
      sendToPlayer(target.id, `%ch>GAME:%cn %crYour character has been reset by staff.%cn You have been moved to Chargen.`);
    },
  });
}

// ============================================================================
// HANDLER: Sphere or Clan selection (no = sign)
// ============================================================================

async function handleSphereOrClan(sid: string, playerObj: any, data: Record<string, unknown>, input: string) {
  const lower = input.toLowerCase();

  // Check if it's a sphere
  const sphere = SPHERE_LIST.find(s => s.toLowerCase() === lower);
  if (sphere) {
    const currentSphere = data.sphere as string | undefined;
    const phase = getCgPhase(data);

    if (phase === "2" || phase === "2.5" || phase === "3") {
      send([sid], "%ch>GAME:%cn Cannot change sphere after Phase 1.");
      return;
    }

    if (currentSphere && currentSphere.toLowerCase() === lower) {
      send([sid], `%ch>GAME:%cn Your sphere is already ${sphere}.`);
      return;
    }

    // Confirmation if already set
    if (currentSphere && (data._pending_confirm as string) !== `sphere:${lower}`) {
      await dbojs.modify({ id: playerObj.id }, "$set", { "data._pending_confirm": `sphere:${lower}` } as any);
      send([sid], `%ch>GAME:%cn %crWARNING:%cn Changing your sphere will reset ALL chargen progress. Run the command again to confirm.`);
      return;
    }

    // Initialize
    const stats: Record<string, number> = {};
    for (const name of getAllAttributes()) stats[name] = 1;
    for (const name of getAllAbilities()) stats[name] = 0;
    Object.assign(stats, INITIAL_STATS);

    await dbojs.modify({ id: playerObj.id }, "$set", {
      "data.sphere": sphere,
      "data.cg_phase": "1",
      "data.stats": cleanStats(stats),
      "data.bg_points": SPHERE_DEFAULTS.bg_points,
      "data.freebie_points": SPHERE_DEFAULTS.freebie_points,
      "data.virtue_points": SPHERE_DEFAULTS.virtue_points,
      "data.discipline_points": SPHERE_DEFAULTS.discipline_points,
    } as any);

    await dbojs.modify({ id: playerObj.id }, "$unset", {
      "data._pending_confirm": 1, "data.clan": 1, "data.caste": 1,
      "data.attr_priority": 1, "data.abil_priority": 1,
      "data.attr_dots_remaining": 1, "data.abil_dots_remaining": 1,
      "data.phase1_stats": 1, "data.phase2_stats": 1,
    } as any);

    send([sid], `%ch>GAME:%cn Sphere set to %ch${sphere}%cn. Now select your clan with %ch+setstat <clan>%cn.`);
    return;
  }

  // Check if it's a clan
  const clanData = CLAN_LOOKUP.get(lower);
  if (clanData) {
    const clanName = clanData.key as string;
    const currentSphere = data.sphere as string | undefined;
    const phase = getCgPhase(data);

    if (!currentSphere) {
      send([sid], "%ch>GAME:%cn Select a sphere first with %ch+setstat Vampire%cn.");
      return;
    }

    if (phase === "2" || phase === "2.5" || phase === "3") {
      send([sid], "%ch>GAME:%cn Cannot change clan after Phase 1.");
      return;
    }

    const currentClan = data.clan as string | undefined;
    if (currentClan && currentClan.toLowerCase() === lower) {
      send([sid], `%ch>GAME:%cn Your clan is already ${clanName}.`);
      return;
    }

    // Confirmation if already set
    if (currentClan && (data._pending_confirm as string) !== `clan:${lower}`) {
      await dbojs.modify({ id: playerObj.id }, "$set", { "data._pending_confirm": `clan:${lower}` } as any);
      send([sid], `%ch>GAME:%cn %crWARNING:%cn Changing your clan will reset post-clan progress. Run the command again to confirm.`);
      return;
    }

    // Wipe all post-clan progress and rebuild stats from scratch
    const freshStats: Record<string, number> = {};
    for (const name of getAllAttributes()) freshStats[name] = 1;
    for (const name of getAllAbilities()) freshStats[name] = 0;
    Object.assign(freshStats, INITIAL_STATS);

    // Handle Nosferatu Appearance
    if (clanName.toLowerCase() === "nosferatu") {
      freshStats.Appearance = 0;
    }

    await dbojs.modify({ id: playerObj.id }, "$set", {
      "data.clan": clanName,
      "data.cg_phase": "1",
      "data.stats": freshStats,
      "data.bg_points": SPHERE_DEFAULTS.bg_points,
      "data.freebie_points": SPHERE_DEFAULTS.freebie_points,
      "data.virtue_points": SPHERE_DEFAULTS.virtue_points,
      "data.discipline_points": SPHERE_DEFAULTS.discipline_points,
    } as any);
    await dbojs.modify({ id: playerObj.id }, "$unset", {
      "data._pending_confirm": 1, "data.caste": 1,
      "data.attr_priority": 1, "data.abil_priority": 1,
      "data.attr_dots_remaining": 1, "data.abil_dots_remaining": 1,
      "data.phase1_stats": 1, "data.phase2_stats": 1,
      "data.phase1_freebie_points": 1, "data.freebie_review_submitted": 1,
      "data.xp": 1,
    } as any);

    const castes = getClanCastes(clanData);
    let msg = `%ch>GAME:%cn Clan set to %ch${clanName}%cn.`;
    if (castes.length > 0) {
      msg += ` This clan has castes. Use %ch+setstat/caste <${castes.join("|")}>%cn.`;
    } else {
      msg += ` Use %ch+setstat/priority <PMS>%cn to set attribute priority.`;
    }
    send([sid], msg);
    return;
  }

  send([sid], `%ch>GAME:%cn "${input}" is not a recognized sphere or clan. Use %ch+setstat Vampire%cn to begin.`);
}

// ============================================================================
// HANDLER: /priority switch
// ============================================================================

async function handlePriority(sid: string, playerObj: any, data: Record<string, unknown>, input: string) {
  const upper = input.toUpperCase();
  const phase = getCgPhase(data);

  if (phase !== "1") {
    send([sid], "%ch>GAME:%cn Priority can only be set in Phase 1.");
    return;
  }

  if (!data.clan) {
    send([sid], "%ch>GAME:%cn Select a clan first.");
    return;
  }

  // Attribute priority: P, M, S
  if (/^[PMS]{3}$/.test(upper) && new Set(upper.split("")).size === 3) {
    const map: Record<string, string> = { P: "Physical", M: "Mental", S: "Social" };
    const cats = upper.split("").map(c => map[c]);
    const dots: Record<string, number> = {};
    cats.forEach((c, i) => dots[c] = ATTR_PRIORITY_DOTS[i]);

    // Confirmation only if dots were actually spent
    const currentPri = data.attr_priority as string | undefined;
    if (currentPri && currentPri !== upper) {
      const currentStats = getStats(data);
      const dotsSpent = getAllAttributes().some(n => {
        const val = currentStats[n] || 0;
        const base = (n === "Appearance" && (data.clan as string)?.toLowerCase() === "nosferatu") ? 0 : 1;
        return val > base;
      });
      if (dotsSpent && (data._pending_confirm as string) !== `attrpri:${upper}`) {
        await dbojs.modify({ id: playerObj.id }, "$set", { "data._pending_confirm": `attrpri:${upper}` } as any);
        send([sid], "%ch>GAME:%cn %crWARNING:%cn Changing attribute priority will reset attributes. Run again to confirm.");
        return;
      }
    }

    // Reset attributes to 1 (preserve everything else)
    const stats = getStats(data);
    for (const name of getAllAttributes()) stats[name] = 1;
    // Nosferatu exception
    if ((data.clan as string)?.toLowerCase() === "nosferatu") stats.Appearance = 0;

    await dbojs.modify({ id: playerObj.id }, "$set", {
      "data.attr_priority": upper,
      "data.attr_dots_remaining": dots,
      "data.stats": cleanStats(stats),
    } as any);
    await dbojs.modify({ id: playerObj.id }, "$unset", { "data._pending_confirm": 1 } as any);

    let attrMsg = `%ch>GAME:%cn Attribute priority set: ${cats.map((c, i) => `${c} (${ATTR_PRIORITY_DOTS[i]})`).join(", ")}.\nUse %ch+setstat <attribute>=<value>%cn to spend dots.`;
    if ((data.clan as string)?.toLowerCase() === "nosferatu") {
      attrMsg += `\n\n%chAs Clan Nosferatu, your Appearance is permanently 0.%cn However, on the sheet, the number represents your residual self-image — how you look when Obfuscated.`;
    }
    send([sid], attrMsg);
    return;
  }

  // Ability priority: T, S, K
  if (/^[TSK]{3}$/.test(upper) && new Set(upper.split("")).size === 3) {
    const map: Record<string, string> = { T: "Talents", S: "Skills", K: "Knowledges" };
    const cats = upper.split("").map(c => map[c]);
    const dots: Record<string, number> = {};
    cats.forEach((c, i) => dots[c] = ABIL_PRIORITY_DOTS[i]);

    // Confirmation only if dots were actually spent
    const currentPri = data.abil_priority as string | undefined;
    if (currentPri && currentPri !== upper) {
      const currentStats = getStats(data);
      const dotsSpent = getAllAbilities().some(n => (currentStats[n] || 0) > 0);
      if (dotsSpent && (data._pending_confirm as string) !== `abilpri:${upper}`) {
        await dbojs.modify({ id: playerObj.id }, "$set", { "data._pending_confirm": `abilpri:${upper}` } as any);
        send([sid], "%ch>GAME:%cn %crWARNING:%cn Changing ability priority will reset abilities. Run again to confirm.");
        return;
      }
    }

    // Reset abilities to 0
    const stats = getStats(data);
    for (const name of getAllAbilities()) stats[name] = 0;

    await dbojs.modify({ id: playerObj.id }, "$set", {
      "data.abil_priority": upper,
      "data.abil_dots_remaining": dots,
      "data.stats": cleanStats(stats),
    } as any);
    await dbojs.modify({ id: playerObj.id }, "$unset", { "data._pending_confirm": 1 } as any);

    send([sid], `%ch>GAME:%cn Ability priority set: ${cats.map((c, i) => `${c} (${ABIL_PRIORITY_DOTS[i]})`).join(", ")}.\nUse %ch+setstat <ability>=<value>%cn to spend dots.`);
    return;
  }

  send([sid], "%ch>GAME:%cn Invalid priority. Use 3 unique letters:\n  Attributes: P (Physical), M (Mental), S (Social) — e.g., %ch+setstat/priority PMS%cn\n  Abilities: T (Talents), S (Skills), K (Knowledges) — e.g., %ch+setstat/priority TSK%cn");
}

// ============================================================================
// HANDLER: /caste switch
// ============================================================================

async function handleCaste(sid: string, playerObj: any, data: Record<string, unknown>, input: string) {
  const clan = data.clan as string | undefined;
  if (!clan) {
    send([sid], "%ch>GAME:%cn Select a clan first.");
    return;
  }

  const clanData = CLAN_LOOKUP.get(clan.toLowerCase());
  if (!clanData) {
    send([sid], "%ch>GAME:%cn Clan data not found.");
    return;
  }

  const castes = getClanCastes(clanData);
  if (castes.length === 0) {
    send([sid], `%ch>GAME:%cn ${clan} does not have castes.`);
    return;
  }

  const match = castes.find(c => c.toLowerCase() === input.toLowerCase());
  if (!match) {
    send([sid], `%ch>GAME:%cn Invalid caste. Options: ${castes.join(", ")}`);
    return;
  }

  await dbojs.modify({ id: playerObj.id }, "$set", { "data.caste": match } as any);
  send([sid], `%ch>GAME:%cn Caste set to %ch${match}%cn.`);
}

// ============================================================================
// HANDLER: +setstat <stat>=<value> (the big router)
// ============================================================================

async function handleSetStat(sid: string, playerObj: any, data: Record<string, unknown>, statName: string, value: string) {
  const stats = getStats(data);
  const phase = getCgPhase(data);
  const lower = statName.toLowerCase();

  if (!phase) {
    send([sid], "%ch>GAME:%cn Start chargen first with %ch+setstat Vampire%cn.");
    return;
  }

  // --- BIO FIELDS ---
  if (BIO_FIELDS.has(lower)) {
    await handleBioField(sid, playerObj, data, lower, value);
    return;
  }

  // Phase 2.5: stats are locked, awaiting note review
  if (phase === "2.5") {
    send([sid], "%ch>GAME:%cn Stats are locked during note review (Phase 2.5). Use %ch+revert%cn if you need to make changes.");
    return;
  }

  // --- ATTRIBUTES ---
  const attrCat = findAttrCategory(statName);
  if (attrCat) {
    const canonical = canonicalName(statName, ATTR_CATEGORIES[attrCat])!;
    const newVal = parseInt(value);
    if (isNaN(newVal)) return send([sid], "Value must be a number.");

    // Nosferatu Appearance lock
    if (canonical === "Appearance" && (data.clan as string)?.toLowerCase() === "nosferatu") {
      send([sid], "%ch>GAME:%cn Nosferatu cannot change Appearance.");
      return;
    }

    const current = stats[canonical] || 1;
    const min = 1;
    const max = 5;
    if (newVal < min || newVal > max) return send([sid], `%ch>GAME:%cn ${canonical} must be between ${min} and ${max}.`);

    // Cap enforcement
    const capErr = checkStatCap(stats, getAllAttributes(), canonical, newVal);
    if (capErr) return send([sid], `%ch>GAME:%cn ${capErr}`);

    if (phase === "1") {
      const remain = data.attr_dots_remaining as Record<string, number> | undefined;
      if (!remain) return send([sid], "%ch>GAME:%cn Set attribute priority first.");
      const catDots = remain[attrCat] ?? 0;
      const delta = newVal - current;
      if (delta > catDots) return send([sid], `%ch>GAME:%cn Not enough ${attrCat} dots. Have: ${catDots}, Need: ${delta}.`);

      stats[canonical] = newVal;
      remain[attrCat] = catDots - delta;
      await dbojs.modify({ id: playerObj.id }, "$set", {
        "data.stats": cleanStats(stats),
        "data.attr_dots_remaining": remain,
      } as any);
      send([sid], `%ch>GAME:%cn ${canonical} set to ${newVal}. ${attrCat} dots remaining: ${remain[attrCat]}.`);
    } else if (phase === "2") {
      // Floor enforcement
      const floorErr = checkPhaseFloor(data, canonical, newVal);
      if (floorErr) return send([sid], `%ch>GAME:%cn ${floorErr}`);
      const delta = newVal - current;
      if (delta === 0) return send([sid], `%ch>GAME:%cn ${canonical} is already at ${newVal}.`);
      const freebies = (data.freebie_points as number) || 0;
      if (delta > 0) {
        const cost = delta * FREEBIE_COSTS.attribute;
        if (cost > freebies) return send([sid], `%ch>GAME:%cn Not enough freebies. Cost: ${cost}, Have: ${freebies}.`);
        stats[canonical] = newVal;
        await dbojs.modify({ id: playerObj.id }, "$set", {
          "data.stats": cleanStats(stats),
          "data.freebie_points": freebies - cost,
        } as any);
        send([sid], `%ch>GAME:%cn ${canonical} set to ${newVal}. Freebies spent: ${cost}. Remaining: ${freebies - cost}.`);
      } else {
        const refund = Math.abs(delta) * FREEBIE_COSTS.attribute;
        stats[canonical] = newVal;
        await dbojs.modify({ id: playerObj.id }, "$set", {
          "data.stats": cleanStats(stats),
          "data.freebie_points": freebies + refund,
        } as any);
        send([sid], `%ch>GAME:%cn ${canonical} set to ${newVal}. Freebies refunded: ${refund}. Remaining: ${freebies + refund}.`);
      }
    } else if (phase === "3") {
      const delta = newVal - current;
      if (delta <= 0) return send([sid], "%ch>GAME:%cn Cannot lower attributes in Phase 3.");
      // XP cost: N x 4 for each level
      let xpCost = 0;
      for (let d = current; d < newVal; d++) xpCost += d * 4;
      const xp = (data.xp as number) || 0;
      if (xpCost > xp) return send([sid], `%ch>GAME:%cn Not enough XP. Cost: ${xpCost}, Have: ${xp}.`);
      stats[canonical] = newVal;
      await dbojs.modify({ id: playerObj.id }, "$set", { "data.stats": cleanStats(stats), "data.xp": xp - xpCost } as any);
      send([sid], `%ch>GAME:%cn ${canonical} set to ${newVal}. XP spent: ${xpCost}. Remaining: ${xp - xpCost}.`);
    } else {
      send([sid], "%ch>GAME:%cn Cannot change attributes in this phase.");
    }
    return;
  }

  // --- ABILITIES ---
  const abilCat = findAbilCategory(statName);
  if (abilCat) {
    const canonical = canonicalName(statName, ABIL_CATEGORIES[abilCat])!;
    const newVal = parseInt(value);
    if (isNaN(newVal)) return send([sid], "Value must be a number.");

    const current = stats[canonical] || 0;
    const maxPhase1 = 3;
    const maxPhase2 = 5;
    const max = phase === "1" ? maxPhase1 : maxPhase2;
    if (newVal < 0 || newVal > max) return send([sid], `%ch>GAME:%cn ${canonical} must be between 0 and ${max}.`);

    // Cap enforcement
    const capErr = checkStatCap(stats, getAllAbilities(), canonical, newVal);
    if (capErr) return send([sid], `%ch>GAME:%cn ${capErr}`);

    // Auspex-Awareness dependency
    const auspexErr = checkAuspexAwareness(stats, canonical, newVal);
    if (auspexErr) return send([sid], `%ch>GAME:%cn ${auspexErr}`);

    if (phase === "1") {
      const remain = data.abil_dots_remaining as Record<string, number> | undefined;
      if (!remain) return send([sid], "%ch>GAME:%cn Set ability priority first.");
      const catDots = remain[abilCat] ?? 0;
      const delta = newVal - current;
      if (delta > catDots) return send([sid], `%ch>GAME:%cn Not enough ${abilCat} dots. Have: ${catDots}, Need: ${delta}.`);

      stats[canonical] = newVal;
      remain[abilCat] = catDots - delta;
      await dbojs.modify({ id: playerObj.id }, "$set", {
        "data.stats": cleanStats(stats),
        "data.abil_dots_remaining": remain,
      } as any);
      send([sid], `%ch>GAME:%cn ${canonical} set to ${newVal}. ${abilCat} dots remaining: ${remain[abilCat]}.`);
    } else if (phase === "2") {
      const floorErr = checkPhaseFloor(data, canonical, newVal);
      if (floorErr) return send([sid], `%ch>GAME:%cn ${floorErr}`);
      const delta = newVal - current;
      if (delta === 0) return send([sid], `%ch>GAME:%cn ${canonical} is already at ${newVal}.`);
      const freebies = (data.freebie_points as number) || 0;
      if (delta > 0) {
        let cost = 0;
        for (let d = current; d < newVal; d++) {
          cost += d < 3 ? FREEBIE_COSTS.ability_lo : FREEBIE_COSTS.ability_hi;
        }
        if (cost > freebies) return send([sid], `%ch>GAME:%cn Not enough freebies. Cost: ${cost}, Have: ${freebies}.`);
        stats[canonical] = newVal;
        await dbojs.modify({ id: playerObj.id }, "$set", {
          "data.stats": cleanStats(stats),
          "data.freebie_points": freebies - cost,
        } as any);
        send([sid], `%ch>GAME:%cn ${canonical} set to ${newVal}. Freebies spent: ${cost}. Remaining: ${freebies - cost}.`);
      } else {
        let refund = 0;
        for (let d = newVal; d < current; d++) {
          refund += d < 3 ? FREEBIE_COSTS.ability_lo : FREEBIE_COSTS.ability_hi;
        }
        stats[canonical] = newVal;
        await dbojs.modify({ id: playerObj.id }, "$set", {
          "data.stats": cleanStats(stats),
          "data.freebie_points": freebies + refund,
        } as any);
        send([sid], `%ch>GAME:%cn ${canonical} set to ${newVal}. Freebies refunded: ${refund}. Remaining: ${freebies + refund}.`);
      }
    } else if (phase === "3") {
      const delta = newVal - current;
      if (delta <= 0) return send([sid], "%ch>GAME:%cn Cannot lower abilities in Phase 3.");
      // XP cost: new ability (0→1) = 3 flat, existing = N x 2
      let xpCost = 0;
      for (let d = current; d < newVal; d++) xpCost += d === 0 ? 3 : d * 2;
      const xp = (data.xp as number) || 0;
      if (xpCost > xp) return send([sid], `%ch>GAME:%cn Not enough XP. Cost: ${xpCost}, Have: ${xp}.`);
      stats[canonical] = newVal;
      await dbojs.modify({ id: playerObj.id }, "$set", { "data.stats": cleanStats(stats), "data.xp": xp - xpCost } as any);
      send([sid], `%ch>GAME:%cn ${canonical} set to ${newVal}. XP spent: ${xpCost}. Remaining: ${xp - xpCost}.`);
    } else {
      send([sid], "%ch>GAME:%cn Cannot change abilities in this phase.");
    }
    return;
  }

  // --- BACKGROUNDS ---
  const bgCanonical = canonicalName(statName, BACKGROUND_NAMES);
  if (bgCanonical) {
    const newVal = parseInt(value);
    const bgMax = (bgCanonical === "Blood Potency" && phase !== "approved") ? 3 : 5;
    const bgMin = bgCanonical === "Blood Potency" ? 1 : 0;
    if (isNaN(newVal) || newVal < bgMin || newVal > bgMax) return send([sid], `%ch>GAME:%cn ${bgCanonical} must be between ${bgMin} and ${bgMax}.`);
    const current = stats[bgCanonical] || 0;
    const delta = newVal - current;

    // Thin Blood / Generation interdependency
    const tbErr = checkThinBloodGeneration(stats, bgCanonical, newVal);
    if (tbErr) return send([sid], `%ch>GAME:%cn ${tbErr}`);

    if (phase === "1") {
      const bgPts = (data.bg_points as number) || 0;
      const freebies = (data.freebie_points as number) || 0;
      const isDualCost = bgCanonical === "Generation" || bgCanonical === "Blood Potency";

      if (delta > 0) {
        if (delta > bgPts) return send([sid], `%ch>GAME:%cn Not enough background points. Have: ${bgPts}, Need: ${delta}.`);
        if (isDualCost && delta > freebies) return send([sid], `%ch>GAME:%cn Not enough freebie points. ${bgCanonical} costs both BG points and freebies. Have: ${freebies}, Need: ${delta}.`);
      }

      stats[bgCanonical] = newVal;

      // Generation syncs
      if (bgCanonical === "Generation") {
        stats["Generation Value"] = 11 - newVal;
      }
      // Blood Potency syncs
      if (bgCanonical === "Blood Potency") {
        syncBloodPool(stats, newVal);
      }

      const updates: Record<string, unknown> = {
        "data.stats": cleanStats(stats),
        "data.bg_points": bgPts - delta,
      };
      if (isDualCost) {
        updates["data.freebie_points"] = freebies - delta;
      }
      await dbojs.modify({ id: playerObj.id }, "$set", updates as any);

      if (isDualCost) {
        send([sid], `%ch>GAME:%cn ${bgCanonical} set to ${newVal}. BG points remaining: ${bgPts - delta}. Freebies remaining: ${freebies - delta}.`);
      } else {
        send([sid], `%ch>GAME:%cn ${bgCanonical} set to ${newVal}. Background points remaining: ${bgPts - delta}.`);
      }
      // Update data for pool check
      const updatedData: Record<string, unknown> = { ...data, bg_points: bgPts - delta };
      if (isDualCost) updatedData.freebie_points = freebies - delta;
      checkAllPoolsSpent(sid, updatedData);
    } else if (phase === "2") {
      if (bgCanonical === "Generation" || bgCanonical === "Blood Potency") {
        send([sid], `%ch>GAME:%cn ${bgCanonical} cannot be changed in Phase 2.`);
        return;
      }
      const floorErr = checkPhaseFloor(data, bgCanonical, newVal);
      if (floorErr) return send([sid], `%ch>GAME:%cn ${floorErr}`);
      if (delta === 0) return send([sid], `%ch>GAME:%cn ${bgCanonical} is already at ${newVal}.`);
      const freebies = (data.freebie_points as number) || 0;
      if (delta > 0) {
        const cost = delta * FREEBIE_COSTS.background;
        if (cost > freebies) return send([sid], `%ch>GAME:%cn Not enough freebies. Cost: ${cost}, Have: ${freebies}.`);
        stats[bgCanonical] = newVal;
        await dbojs.modify({ id: playerObj.id }, "$set", {
          "data.stats": cleanStats(stats),
          "data.freebie_points": freebies - cost,
        } as any);
        send([sid], `%ch>GAME:%cn ${bgCanonical} set to ${newVal}. Freebies spent: ${cost}. Remaining: ${freebies - cost}.`);
      } else {
        const refund = Math.abs(delta) * FREEBIE_COSTS.background;
        stats[bgCanonical] = newVal;
        await dbojs.modify({ id: playerObj.id }, "$set", {
          "data.stats": cleanStats(stats),
          "data.freebie_points": freebies + refund,
        } as any);
        send([sid], `%ch>GAME:%cn ${bgCanonical} set to ${newVal}. Freebies refunded: ${refund}. Remaining: ${freebies + refund}.`);
      }
    } else if (phase === "3") {
      const delta = newVal - current;
      if (delta <= 0) return send([sid], "%ch>GAME:%cn Cannot lower backgrounds in Phase 3.");
      // XP cost: 5 per dot
      const xpCost = delta * 5;
      const xp = (data.xp as number) || 0;
      if (xpCost > xp) return send([sid], `%ch>GAME:%cn Not enough XP. Cost: ${xpCost}, Have: ${xp}.`);
      stats[bgCanonical] = newVal;
      if (bgCanonical === "Generation") stats["Generation Value"] = 11 - newVal;
      if (bgCanonical === "Blood Potency") syncBloodPool(stats, newVal);
      await dbojs.modify({ id: playerObj.id }, "$set", { "data.stats": cleanStats(stats), "data.xp": xp - xpCost } as any);
      send([sid], `%ch>GAME:%cn ${bgCanonical} set to ${newVal}. XP spent: ${xpCost}. Remaining: ${xp - xpCost}.`);
    } else {
      send([sid], "%ch>GAME:%cn Cannot change backgrounds in this phase.");
    }
    return;
  }

  // --- VIRTUES ---
  const virtueCanonical = canonicalName(statName, VIRTUE_NAMES);
  if (virtueCanonical) {
    const newVal = parseInt(value);
    if (isNaN(newVal) || newVal < 1 || newVal > 5) return send([sid], `%ch>GAME:%cn ${virtueCanonical} must be between 1 and 5.`);
    const current = stats[virtueCanonical] || 1;
    const delta = newVal - current;

    if (phase === "1") {
      const vPts = (data.virtue_points as number) || 0;
      if (delta > vPts) return send([sid], `%ch>GAME:%cn Not enough virtue points. Have: ${vPts}, Need: ${delta}.`);
      stats[virtueCanonical] = newVal;
      // Courage syncs to Willpower in Phase 1
      if (virtueCanonical === "Courage") {
        stats["Willpower"] = newVal;
        stats["Willpower Current"] = newVal;
      }
      await dbojs.modify({ id: playerObj.id }, "$set", {
        "data.stats": cleanStats(stats),
        "data.virtue_points": vPts - delta,
      } as any);
      send([sid], `%ch>GAME:%cn ${virtueCanonical} set to ${newVal}. Virtue points remaining: ${vPts - delta}.`);
      checkAllPoolsSpent(sid, { ...data, virtue_points: vPts - delta });
    } else if (phase === "2") {
      const floorErr = checkPhaseFloor(data, virtueCanonical, newVal);
      if (floorErr) return send([sid], `%ch>GAME:%cn ${floorErr}`);
      if (delta === 0) return send([sid], `%ch>GAME:%cn ${virtueCanonical} is already at ${newVal}.`);
      const freebies = (data.freebie_points as number) || 0;
      if (delta > 0) {
        const cost = delta * FREEBIE_COSTS.virtue;
        if (cost > freebies) return send([sid], `%ch>GAME:%cn Not enough freebies. Cost: ${cost}, Have: ${freebies}.`);
        stats[virtueCanonical] = newVal;
        await dbojs.modify({ id: playerObj.id }, "$set", {
          "data.stats": cleanStats(stats),
          "data.freebie_points": freebies - cost,
        } as any);
        send([sid], `%ch>GAME:%cn ${virtueCanonical} set to ${newVal}. Freebies spent: ${cost}. Remaining: ${freebies - cost}.`);
      } else {
        const refund = Math.abs(delta) * FREEBIE_COSTS.virtue;
        stats[virtueCanonical] = newVal;
        await dbojs.modify({ id: playerObj.id }, "$set", {
          "data.stats": cleanStats(stats),
          "data.freebie_points": freebies + refund,
        } as any);
        send([sid], `%ch>GAME:%cn ${virtueCanonical} set to ${newVal}. Freebies refunded: ${refund}. Remaining: ${freebies + refund}.`);
      }
    } else if (phase === "3") {
      const delta = newVal - current;
      if (delta <= 0) return send([sid], "%ch>GAME:%cn Cannot lower virtues in Phase 3.");
      // XP cost: N x 2
      let xpCost = 0;
      for (let d = current; d < newVal; d++) xpCost += d * 2;
      const xp = (data.xp as number) || 0;
      if (xpCost > xp) return send([sid], `%ch>GAME:%cn Not enough XP. Cost: ${xpCost}, Have: ${xp}.`);
      stats[virtueCanonical] = newVal;
      await dbojs.modify({ id: playerObj.id }, "$set", { "data.stats": cleanStats(stats), "data.xp": xp - xpCost } as any);
      send([sid], `%ch>GAME:%cn ${virtueCanonical} set to ${newVal}. XP spent: ${xpCost}. Remaining: ${xp - xpCost}.`);
    } else {
      send([sid], "%ch>GAME:%cn Cannot change virtues in this phase.");
    }
    return;
  }

  // --- DISCIPLINES ---
  const discCanonical = canonicalName(statName, DISCIPLINE_NAMES);
  if (discCanonical) {
    const newVal = parseInt(value);
    if (isNaN(newVal) || newVal < 0 || newVal > 3) return send([sid], `%ch>GAME:%cn ${discCanonical} must be between 0 and 3.`);
    const current = stats[discCanonical] || 0;
    const delta = newVal - current;

    // Determine in-clan (including Additional Discipline merit)
    const clan = data.clan as string;
    const caste = data.caste as string | undefined;
    const clanData = CLAN_LOOKUP.get(clan?.toLowerCase() || "");
    const inclan = clanData ? getInclanDisciplines(clanData, caste) : [];
    const isInclan = inclan.some(d => d.toLowerCase() === discCanonical.toLowerCase());
    const accessible = isDisciplineAccessible(discCanonical, inclan, stats);

    // Auspex-Awareness dependency (Auspex is a discipline)
    const auspexErr = checkAuspexAwareness(stats, discCanonical, newVal);
    if (auspexErr) return send([sid], `%ch>GAME:%cn ${auspexErr}`);

    if (phase === "1") {
      if (!isInclan) {
        send([sid], `%ch>GAME:%cn ${discCanonical} is not in-clan for ${clan}. Only in-clan disciplines can be purchased in Phase 1.`);
        return;
      }
      const dPts = (data.discipline_points as number) || 0;
      if (delta > dPts) return send([sid], `%ch>GAME:%cn Not enough discipline points. Have: ${dPts}, Need: ${delta}.`);
      stats[discCanonical] = newVal;
      await dbojs.modify({ id: playerObj.id }, "$set", {
        "data.stats": cleanStats(stats),
        "data.discipline_points": dPts - delta,
      } as any);
      send([sid], `%ch>GAME:%cn ${discCanonical} set to ${newVal}. Discipline points remaining: ${dPts - delta}.`);
      checkAllPoolsSpent(sid, { ...data, discipline_points: dPts - delta });
    } else if (phase === "2") {
      const floorErr = checkPhaseFloor(data, discCanonical, newVal);
      if (floorErr) return send([sid], `%ch>GAME:%cn ${floorErr}`);
      if (delta === 0) return send([sid], `%ch>GAME:%cn ${discCanonical} is already at ${newVal}.`);
      const freebies = (data.freebie_points as number) || 0;
      if (delta > 0) {
        if (!accessible) {
          const existingOOC = getExistingAdditionalDiscipline(inclan, stats);
          if (existingOOC && COMMON_DISCIPLINES.has(discCanonical)) {
            send([sid], `%ch>GAME:%cn You are already using Additional Discipline for ${existingOOC}. The merit only grants one extra in-clan discipline.`);
          } else {
            send([sid], `%ch>GAME:%cn ${discCanonical} is not accessible. It must be in-clan or granted by the Additional Discipline merit (common disciplines only).`);
          }
          return;
        }
        const cost = delta * FREEBIE_COSTS.discipline;
        if (cost > freebies) return send([sid], `%ch>GAME:%cn Not enough freebies. Cost: ${cost}, Have: ${freebies}.`);
        stats[discCanonical] = newVal;
        await dbojs.modify({ id: playerObj.id }, "$set", {
          "data.stats": cleanStats(stats),
          "data.freebie_points": freebies - cost,
        } as any);
        send([sid], `%ch>GAME:%cn ${discCanonical} set to ${newVal}. Freebies spent: ${cost}. Remaining: ${freebies - cost}.`);
      } else {
        const refund = Math.abs(delta) * FREEBIE_COSTS.discipline;
        stats[discCanonical] = newVal;
        await dbojs.modify({ id: playerObj.id }, "$set", {
          "data.stats": cleanStats(stats),
          "data.freebie_points": freebies + refund,
        } as any);
        send([sid], `%ch>GAME:%cn ${discCanonical} set to ${newVal}. Freebies refunded: ${refund}. Remaining: ${freebies + refund}.`);
      }
    } else {
      send([sid], "%ch>GAME:%cn Disciplines can only be changed in Phase 1 and 2. Raise them with XP after approval.");
    }
    return;
  }

  // --- WILLPOWER (direct set, Phase 2+ only) ---
  if (lower === "willpower") {
    if (phase === "1") {
      send([sid], "%ch>GAME:%cn Willpower is set via Courage in Phase 1.");
      return;
    }
    const newVal = parseInt(value);
    if (isNaN(newVal) || newVal < 1 || newVal > WP_MAX_CHARGEN) return send([sid], `%ch>GAME:%cn Willpower must be between 1 and ${WP_MAX_CHARGEN}.`);
    const current = stats["Willpower"] || 1;
    const delta = newVal - current;
    if (delta === 0) return send([sid], `%ch>GAME:%cn Willpower is already at ${newVal}.`);

    if (phase === "2") {
      // Floor: Willpower can't go below Courage (Phase 1 value)
      const phase1Stats = data.phase1_stats as Record<string, number> | undefined;
      const wpFloor = phase1Stats?.["Willpower"] ?? (stats["Courage"] || 1);
      if (newVal < wpFloor) return send([sid], `%ch>GAME:%cn Cannot lower Willpower below Phase 1 value of ${wpFloor}.`);
      const freebies = (data.freebie_points as number) || 0;
      if (delta > 0) {
        const cost = delta * FREEBIE_COSTS.willpower;
        if (cost > freebies) return send([sid], `%ch>GAME:%cn Not enough freebies. Cost: ${cost}, Have: ${freebies}.`);
        stats["Willpower"] = newVal;
        stats["Willpower Current"] = newVal;
        await dbojs.modify({ id: playerObj.id }, "$set", { "data.stats": cleanStats(stats), "data.freebie_points": freebies - cost } as any);
        send([sid], `%ch>GAME:%cn Willpower set to ${newVal}. Freebies spent: ${cost}. Remaining: ${freebies - cost}.`);
      } else {
        const refund = Math.abs(delta) * FREEBIE_COSTS.willpower;
        stats["Willpower"] = newVal;
        stats["Willpower Current"] = newVal;
        await dbojs.modify({ id: playerObj.id }, "$set", { "data.stats": cleanStats(stats), "data.freebie_points": freebies + refund } as any);
        send([sid], `%ch>GAME:%cn Willpower set to ${newVal}. Freebies refunded: ${refund}. Remaining: ${freebies + refund}.`);
      }
    } else if (phase === "3") {
      // XP cost: N x 1
      let xpCost = 0;
      for (let d = current; d < newVal; d++) xpCost += d * 1;
      const xp = (data.xp as number) || 0;
      if (xpCost > xp) return send([sid], `%ch>GAME:%cn Not enough XP. Cost: ${xpCost}, Have: ${xp}.`);
      stats["Willpower"] = newVal;
      stats["Willpower Current"] = newVal;
      await dbojs.modify({ id: playerObj.id }, "$set", { "data.stats": cleanStats(stats), "data.xp": xp - xpCost } as any);
      send([sid], `%ch>GAME:%cn Willpower set to ${newVal}. XP spent: ${xpCost}. Remaining: ${xp - xpCost}.`);
    }
    return;
  }

  // --- HUMANITAS ---
  // Starts at 10. Can only be lowered (min 7) for 3 freebies per point.
  // Can be raised back up to 10 (returns freebies). Cannot exceed 10.
  if (lower === "humanitas") {
    if (phase !== "1" && phase !== "2") {
      send([sid], "%ch>GAME:%cn Humanitas can only be changed in Phase 1 or 2.");
      return;
    }
    const newVal = parseInt(value);
    if (isNaN(newVal) || newVal < 7 || newVal > 10) return send([sid], "%ch>GAME:%cn Humanitas must be between 7 and 10.");
    const current = stats["Humanitas"] || 10;
    const delta = newVal - current;
    if (delta === 0) return send([sid], `%ch>GAME:%cn Humanitas is already ${current}.`);

    const freebies = (data.freebie_points as number) || 0;
    if (delta < 0) {
      // Lowering grants 3 freebies per point
      const grant = Math.abs(delta) * FREEBIE_COSTS.humanitas;
      stats["Humanitas"] = newVal;
      await dbojs.modify({ id: playerObj.id }, "$set", {
        "data.stats": cleanStats(stats),
        "data.freebie_points": freebies + grant,
      } as any);
      send([sid], `%ch>GAME:%cn Humanitas lowered to ${newVal}. Gained ${grant} freebies. Total: ${freebies + grant}.`);
    } else {
      // Raising back toward 10 — costs 3 freebies per point (returning what was gained)
      const cost = delta * FREEBIE_COSTS.humanitas;
      if (cost > freebies) return send([sid], `%ch>GAME:%cn Not enough freebies. Cost: ${cost}, Have: ${freebies}.`);
      stats["Humanitas"] = newVal;
      await dbojs.modify({ id: playerObj.id }, "$set", {
        "data.stats": cleanStats(stats),
        "data.freebie_points": freebies - cost,
      } as any);
      send([sid], `%ch>GAME:%cn Humanitas raised to ${newVal}. Freebies spent: ${cost}. Remaining: ${freebies - cost}.`);
    }
    return;
  }

  // --- MERITS ---
  const meritData = MERIT_LOOKUP.get(lower);
  if (meritData) {
    if (phase !== "1" && phase !== "2" && phase !== "3") {
      send([sid], "%ch>GAME:%cn Cannot set merits in this phase.");
      return;
    }

    // Empty value or "0" removes the merit
    const newVal = (!value || value.trim() === "") ? 0 : parseInt(value);
    if (isNaN(newVal) || newVal < 0) return send([sid], "%ch>GAME:%cn Value must be 0 or higher.");

    // Validate points
    const validPoints = Array.isArray(meritData.points) ? meritData.points : [meritData.points];
    if (newVal > 0 && !validPoints.includes(newVal)) {
      send([sid], `%ch>GAME:%cn ${meritData.key} can only be taken at: ${validPoints.join(", ")} points.`);
      return;
    }

    // Check merit cap
    const current = stats[meritData.key] || 0;
    if (newVal === current) return send([sid], `%ch>GAME:%cn ${meritData.key} is already at ${current}.`);
    const delta = newVal - current;
    if (delta > 0 && !MERIT_CAP_EXEMPT.has(meritData.key)) {
      const total = totalMeritPoints(stats);
      if (total + delta > MERIT_MAX_POINTS) {
        send([sid], `%ch>GAME:%cn Merit cap exceeded. Current: ${total}, Adding: ${delta}, Max: ${MERIT_MAX_POINTS}.`);
        return;
      }
    }

    // Clan forbidden check
    const clan = (data.clan as string) || "";
    const forbidden = CLAN_FORBIDDEN[meritData.key];
    if (forbidden && delta > 0 && forbidden.some(c => c.toLowerCase() === clan.toLowerCase())) {
      send([sid], `%ch>GAME:%cn ${clan} cannot take ${meritData.key}.`);
      return;
    }

    // Incompatible check (forward: this stat lists others as incompatible)
    const incomp = INCOMPATIBLE_WITH[meritData.key];
    if (incomp && delta > 0) {
      for (const other of incomp) {
        if ((stats[other] || 0) > 0) {
          send([sid], `%ch>GAME:%cn ${meritData.key} is incompatible with ${other}.`);
          return;
        }
      }
    }
    // Reverse check (another stat lists this one as incompatible)
    if (delta > 0) {
      for (const [otherStat, otherIncomp] of Object.entries(INCOMPATIBLE_WITH)) {
        if (otherIncomp.includes(meritData.key) && (stats[otherStat] || 0) > 0) {
          send([sid], `%ch>GAME:%cn ${meritData.key} is incompatible with ${otherStat}.`);
          return;
        }
      }
    }

    // Freebie cost
    const freebies = (data.freebie_points as number) || 0;
    if (delta > 0 && (phase === "1" || phase === "2")) {
      if (delta > freebies) return send([sid], `%ch>GAME:%cn Not enough freebies. Cost: ${delta}, Have: ${freebies}.`);
      stats[meritData.key] = newVal;
      await dbojs.modify({ id: playerObj.id }, "$set", {
        "data.stats": cleanStats(stats),
        "data.freebie_points": freebies - delta,
      } as any);
      send([sid], `%ch>GAME:%cn ${meritData.key} set to ${newVal}. Freebies spent: ${delta}. Remaining: ${freebies - delta}.`);
    } else if (delta < 0 && (phase === "1" || phase === "2")) {
      // Removing merit refunds freebies
      const refund = Math.abs(delta);
      if (newVal === 0) {
        delete stats[meritData.key];
      } else {
        stats[meritData.key] = newVal;
      }
      await dbojs.modify({ id: playerObj.id }, "$set", {
        "data.stats": cleanStats(stats),
        "data.freebie_points": freebies + refund,
      } as any);
      if (newVal === 0) {
        send([sid], `%ch>GAME:%cn ${meritData.key} removed. Freebies refunded: ${refund}. Total: ${freebies + refund}.`);
      } else {
        send([sid], `%ch>GAME:%cn ${meritData.key} set to ${newVal}. Freebies refunded: ${refund}. Total: ${freebies + refund}.`);
      }
    } else if (phase === "3" && delta > 0) {
      const xpCost = delta * 5;
      const xp = (data.xp as number) || 0;
      if (xpCost > xp) return send([sid], `%ch>GAME:%cn Not enough XP. Cost: ${xpCost}, Have: ${xp}.`);
      stats[meritData.key] = newVal;
      await dbojs.modify({ id: playerObj.id }, "$set", {
        "data.stats": cleanStats(stats),
        "data.xp": xp - xpCost,
      } as any);
      send([sid], `%ch>GAME:%cn ${meritData.key} set to ${newVal}. XP spent: ${xpCost}. Remaining: ${xp - xpCost}.`);
    }
    return;
  }

  // --- FLAWS ---
  const flawData = FLAW_LOOKUP.get(lower);
  if (flawData) {
    if (phase === "3") {
      send([sid], "%ch>GAME:%cn Flaws cannot be taken in Phase 3.");
      return;
    }
    if (phase !== "1" && phase !== "2") {
      send([sid], "%ch>GAME:%cn Cannot set flaws in this phase.");
      return;
    }

    // Empty value or "0" removes the flaw
    const newVal = (!value || value.trim() === "") ? 0 : parseInt(value);
    if (isNaN(newVal) || newVal < 0) return send([sid], "%ch>GAME:%cn Value must be 0 or higher.");

    const validPoints = Array.isArray(flawData.points) ? flawData.points : [flawData.points];
    if (newVal > 0 && !validPoints.includes(newVal)) {
      send([sid], `%ch>GAME:%cn ${flawData.key} can only be taken at: ${validPoints.join(", ")} points.`);
      return;
    }

    const current = stats[flawData.key] || 0;
    if (newVal === current) return send([sid], `%ch>GAME:%cn ${flawData.key} is already at ${current}.`);
    const delta = newVal - current;

    // Thin Blood / Generation interdependency
    const tbErr = checkThinBloodGeneration(stats, flawData.key, newVal);
    if (tbErr) return send([sid], `%ch>GAME:%cn ${tbErr}`);

    // Flaw cap
    if (delta > 0) {
      const total = totalFlawPoints(stats);
      if (total + delta > FLAW_MAX_POINTS) {
        send([sid], `%ch>GAME:%cn Flaw cap exceeded. Current: ${total}, Adding: ${delta}, Max: ${FLAW_MAX_POINTS}.`);
        return;
      }
    }

    // Clan forbidden
    const clan = (data.clan as string) || "";
    const forbidden = CLAN_FORBIDDEN[flawData.key];
    if (forbidden && delta > 0 && forbidden.some(c => c.toLowerCase() === clan.toLowerCase())) {
      send([sid], `%ch>GAME:%cn ${clan} cannot take ${flawData.key}.`);
      return;
    }

    // Incompatible check (forward: this stat lists others as incompatible)
    const incomp = INCOMPATIBLE_WITH[flawData.key];
    if (incomp && delta > 0) {
      for (const other of incomp) {
        if ((stats[other] || 0) > 0) {
          send([sid], `%ch>GAME:%cn ${flawData.key} is incompatible with ${other}.`);
          return;
        }
      }
    }
    // Reverse check (another stat lists this one as incompatible)
    if (delta > 0) {
      for (const [otherStat, otherIncomp] of Object.entries(INCOMPATIBLE_WITH)) {
        if (otherIncomp.includes(flawData.key) && (stats[otherStat] || 0) > 0) {
          send([sid], `%ch>GAME:%cn ${flawData.key} is incompatible with ${otherStat}.`);
          return;
        }
      }
    }

    const freebies = (data.freebie_points as number) || 0;
    if (delta > 0) {
      // Taking flaw grants freebies
      stats[flawData.key] = newVal;
      await dbojs.modify({ id: playerObj.id }, "$set", {
        "data.stats": cleanStats(stats),
        "data.freebie_points": freebies + delta,
      } as any);
      send([sid], `%ch>GAME:%cn ${flawData.key} set to ${newVal}. Gained ${delta} freebies. Total: ${freebies + delta}.`);
    } else if (delta < 0) {
      // Removing flaw costs freebies
      const cost = Math.abs(delta);
      if (cost > freebies) return send([sid], `%ch>GAME:%cn Not enough freebies to remove flaw. Cost: ${cost}, Have: ${freebies}.`);
      if (newVal === 0) {
        delete stats[flawData.key];
      } else {
        stats[flawData.key] = newVal;
      }
      await dbojs.modify({ id: playerObj.id }, "$set", {
        "data.stats": cleanStats(stats),
        "data.freebie_points": freebies - cost,
      } as any);
      if (newVal === 0) {
        send([sid], `%ch>GAME:%cn ${flawData.key} removed. Freebies spent: ${cost}. Remaining: ${freebies - cost}.`);
      } else {
        send([sid], `%ch>GAME:%cn ${flawData.key} set to ${newVal}. Freebies spent: ${cost}. Remaining: ${freebies - cost}.`);
      }
    }
    return;
  }

  send([sid], `%ch>GAME:%cn "${statName}" is not a recognized stat, ability, background, virtue, discipline, merit, or flaw.`);
}

// ============================================================================
// HANDLER: Bio fields
// ============================================================================

async function handleBioField(sid: string, playerObj: any, data: Record<string, unknown>, field: string, value: string) {
  const normalized = field.replace(/\s+/g, "").toLowerCase();

  if (normalized === "fullname") {
    if (!value) {
      await dbojs.modify({ id: playerObj.id }, "$unset", { "data.fullname": 1 } as any);
      send([sid], "%ch>GAME:%cn Full name cleared.");
      return;
    }
    if (value.length > 120) return send([sid], "%ch>GAME:%cn Full name must be 120 characters or less.");
    await dbojs.modify({ id: playerObj.id }, "$set", { "data.fullname": value } as any);
    send([sid], `%ch>GAME:%cn Full name set to: ${value}`);
    return;
  }

  if (normalized === "birthyear" || normalized === "birthyear") {
    if (!data.sphere) return send([sid], "%ch>GAME:%cn You must choose a sphere first.");
    if (!value) {
      await dbojs.modify({ id: playerObj.id }, "$unset", { "data.birthyear": 1 } as any);
      send([sid], "%ch>GAME:%cn Birth year cleared.");
      return;
    }
    // Parse: accept "545", "545 BCE", "42 CE"
    const raw = value.toUpperCase().trim();
    let multiplier = -1;
    let numStr = raw;
    if (raw.endsWith("BCE") || raw.endsWith("BC")) {
      numStr = raw.replace(/\s*(BCE|BC)$/, "").trim();
      multiplier = -1;
    } else if (raw.endsWith("CE") || raw.endsWith("AD")) {
      numStr = raw.replace(/\s*(CE|AD)$/, "").trim();
      multiplier = 1;
    }
    const num = parseInt(numStr);
    if (isNaN(num) || num <= 0) return send([sid], "%ch>GAME:%cn Birth year must be a positive number (e.g., 545 or 545 BCE).");
    const birthYear = num * multiplier;

    // Get game year for validation
    const { getGameYear } = await import("./time.ts");
    const gameYear = await getGameYear();
    // Both negative = BCE. "Born in the future" means birthYear > gameYear (closer to 0 in BCE)
    if (birthYear > gameYear) return send([sid], `%ch>GAME:%cn Birth year cannot be in the future (game year: ${formatYearDisplay(gameYear)}).`);
    // Age check: gameYear - birthYear = age (in BCE, both negative, so age = birthYear - gameYear as absolute)
    const age = Math.abs(gameYear - birthYear);
    if (age < 18) return send([sid], `%ch>GAME:%cn Character must be at least 18 years old (currently ${age}).`);
    if (age > 100) return send([sid], `%ch>GAME:%cn Character cannot be older than 100 years at start (currently ${age}).`);

    await dbojs.modify({ id: playerObj.id }, "$set", { "data.birthyear": birthYear } as any);
    send([sid], `%ch>GAME:%cn Birth year set to: ${formatYearDisplay(birthYear)}`);
    return;
  }

  if (normalized === "embraceyear" || normalized === "embraceyear") {
    if (!data.sphere) return send([sid], "%ch>GAME:%cn You must choose a sphere first.");
    if (!value) {
      await dbojs.modify({ id: playerObj.id }, "$unset", { "data.embraceyear": 1 } as any);
      send([sid], "%ch>GAME:%cn Embrace year cleared.");
      return;
    }
    if (!data.birthyear) return send([sid], "%ch>GAME:%cn You must set your birth year first.");
    // Parse: accept "500", "500 BCE", "42 CE"
    const raw = value.toUpperCase().trim();
    let multiplier = -1;
    let numStr = raw;
    if (raw.endsWith("BCE") || raw.endsWith("BC")) {
      numStr = raw.replace(/\s*(BCE|BC)$/, "").trim();
      multiplier = -1;
    } else if (raw.endsWith("CE") || raw.endsWith("AD")) {
      numStr = raw.replace(/\s*(CE|AD)$/, "").trim();
      multiplier = 1;
    }
    const num = parseInt(numStr);
    if (isNaN(num) || num <= 0) return send([sid], "%ch>GAME:%cn Embrace year must be a positive number (e.g., 500 or 500 BCE).");
    const embraceYear = num * multiplier;

    const { getGameYear } = await import("./time.ts");
    const gameYear = await getGameYear();
    const birthYear = data.birthyear as number;

    if (embraceYear > gameYear) return send([sid], `%ch>GAME:%cn Embrace year cannot be in the future (game year: ${formatYearDisplay(gameYear)}).`);
    if (embraceYear < birthYear) return send([sid], `%ch>GAME:%cn Embrace year cannot be before birth year (${formatYearDisplay(birthYear)}).`);
    const ageAtEmbrace = Math.abs(embraceYear - birthYear);
    if (ageAtEmbrace < 18) return send([sid], `%ch>GAME:%cn Character must be at least 18 at time of Embrace (age at embrace: ${ageAtEmbrace}).`);
    if (ageAtEmbrace > 90) return send([sid], `%ch>GAME:%cn Character cannot be older than 90 at time of Embrace (age at embrace: ${ageAtEmbrace}).`);

    await dbojs.modify({ id: playerObj.id }, "$set", { "data.embraceyear": embraceYear } as any);
    send([sid], `%ch>GAME:%cn Embrace year set to: ${formatYearDisplay(embraceYear)}`);
    return;
  }

  if (normalized === "concept") {
    if (!data.sphere) return send([sid], "%ch>GAME:%cn You must choose a sphere first.");
    if (!value) {
      await dbojs.modify({ id: playerObj.id }, "$unset", { "data.concept": 1 } as any);
      send([sid], "%ch>GAME:%cn Concept cleared.");
      return;
    }
    if (value.length > 120) return send([sid], "%ch>GAME:%cn Concept must be 120 characters or less.");
    await dbojs.modify({ id: playerObj.id }, "$set", { "data.concept": value } as any);
    send([sid], `%ch>GAME:%cn Concept set to: ${value}`);
    return;
  }

  if (normalized === "nature") {
    if (!data.sphere) return send([sid], "%ch>GAME:%cn You must choose a sphere first.");
    if (!value) {
      await dbojs.modify({ id: playerObj.id }, "$unset", { "data.nature": 1 } as any);
      send([sid], "%ch>GAME:%cn Nature cleared.");
      return;
    }
    const canonical = ARCHETYPE_NAMES.find(a => a.toLowerCase() === value.toLowerCase());
    if (!canonical) {
      send([sid], `%ch>GAME:%cn "${value}" is not a valid archetype. Use %ch+stat/list archetypes%cn to see options.`);
      return;
    }
    await dbojs.modify({ id: playerObj.id }, "$set", { "data.nature": canonical } as any);
    send([sid], `%ch>GAME:%cn Nature set to: ${canonical}`);
    return;
  }

  if (normalized === "demeanor") {
    if (!data.sphere) return send([sid], "%ch>GAME:%cn You must choose a sphere first.");
    if (!value) {
      await dbojs.modify({ id: playerObj.id }, "$unset", { "data.demeanor": 1 } as any);
      send([sid], "%ch>GAME:%cn Demeanor cleared.");
      return;
    }
    const canonical = ARCHETYPE_NAMES.find(a => a.toLowerCase() === value.toLowerCase());
    if (!canonical) {
      send([sid], `%ch>GAME:%cn "${value}" is not a valid archetype. Use %ch+stat/list archetypes%cn to see options.`);
      return;
    }
    await dbojs.modify({ id: playerObj.id }, "$set", { "data.demeanor": canonical } as any);
    send([sid], `%ch>GAME:%cn Demeanor set to: ${canonical}`);
    return;
  }

  if (normalized === "sire") {
    if (!data.sphere) return send([sid], "%ch>GAME:%cn You must choose a sphere first.");
    if (!value) {
      await dbojs.modify({ id: playerObj.id }, "$unset", { "data.sire": 1 } as any);
      send([sid], "%ch>GAME:%cn Sire cleared.");
      return;
    }
    if (value.length > 120) return send([sid], "%ch>GAME:%cn Sire name must be 120 characters or less.");
    await dbojs.modify({ id: playerObj.id }, "$set", { "data.sire": value } as any);
    send([sid], `%ch>GAME:%cn Sire set to: ${value}`);
    return;
  }

  send([sid], `%ch>GAME:%cn Unknown bio field: ${field}`);
}
