/**
 * +sheet — WoD-style character sheet display
 * Ported from Evennia's commands/sheet.py
 *
 * Usage:
 *   +sheet          — view your own sheet
 *   +sheet <name>   — view another character's sheet (staff only)
 */

import { addCmd } from "../../services/commands/cmdParser.ts";
import type { IUrsamuSDK } from "../../@types/UrsamuSDK.ts";
import { dbojs } from "../../services/Database/index.ts";
import * as dpath from "@std/path";

// ---------------------------------------------------------------------------
// Layout constants (must match Evennia: WIDTH = 77)
// ---------------------------------------------------------------------------
const WIDTH = 77;
const COL3 = 25;

// Bottom section column widths (35 + || + 21 + || + 19 = 77)
const BOT_L = 35;
const BOT_M = 21;
const BOT_R = 19;

// Attribute and ability category ordering
const ATTR_CATS: Record<string, string[]> = {
  Physical: ["Strength", "Dexterity", "Stamina"],
  Social: ["Charisma", "Manipulation", "Appearance"],
  Mental: ["Intelligence", "Wits", "Perception"],
};

// Abilities loaded from JSON at init
let ABIL_CATS: Record<string, string[]> = {
  Talents: [],
  Skills: [],
  Knowledges: [],
};

let VIRTUE_NAMES: string[] = [];
let BACKGROUND_NAMES: string[] = [];
let DISCIPLINE_NAMES: string[] = [];
let MERIT_NAMES: string[] = [];
let FLAW_NAMES: string[] = [];
let statsLoaded = false;

// Health track
const HEALTH: [string, string][] = [
  ["Bruised", "0"],
  ["Hurt", "-1"],
  ["Injured", "-1"],
  ["Wounded", "-2"],
  ["Mauled", "-2"],
  ["Crippled", "-5"],
  ["Incap.", "-99"],
];

// ---------------------------------------------------------------------------
// Load stat names from JSON data files
// ---------------------------------------------------------------------------
async function loadStatNames(): Promise<void> {
  if (statsLoaded) return;

  const dataDir = dpath.join(Deno.cwd(), "system", "scripts", "pop", "stats", "data");

  const loadJson = async (file: string): Promise<Record<string, unknown>[]> => {
    try {
      const text = await Deno.readTextFile(dpath.join(dataDir, file));
      return JSON.parse(text);
    } catch {
      return [];
    }
  };

  const talents = await loadJson("talents.json");
  const skills = await loadJson("skills.json");
  const knowledges = await loadJson("knowledges.json");
  const virtues = await loadJson("virtues.json");
  const backgrounds = await loadJson("backgrounds.json");
  const disciplines = await loadJson("disciplines.json");
  const merits = await loadJson("merits.json");
  const flaws = await loadJson("flaws.json");

  ABIL_CATS.Talents = talents.map((s) => s.key as string).sort();
  ABIL_CATS.Skills = skills.map((s) => s.key as string).sort();
  ABIL_CATS.Knowledges = knowledges.map((s) => s.key as string).sort();
  VIRTUE_NAMES = virtues.map((s) => s.key as string).sort();
  BACKGROUND_NAMES = backgrounds.map((s) => s.key as string).sort();
  DISCIPLINE_NAMES = disciplines.map((s) => s.key as string).sort();
  MERIT_NAMES = merits.map((s) => s.key as string).sort();
  FLAW_NAMES = flaws.map((s) => s.key as string).sort();

  statsLoaded = true;
}

// ---------------------------------------------------------------------------
// Formatting helpers (match Evennia sheet.py exactly)
// ---------------------------------------------------------------------------

function header(title: string, color = ""): string {
  const t = ` ${title} `;
  const pad = Math.floor((WIDTH - t.length) / 2);
  const rbar = WIDTH - pad - t.length;
  const lStr = "=".repeat(Math.max(0, pad));
  const rStr = "=".repeat(Math.max(0, rbar));
  if (color) return `${lStr}${color}${t}%cn${rStr}`;
  return `${lStr}${t}${rStr}`;
}

function dot(name: string, val: string | number, w: number, dimZero = false): string {
  const pre = ` ${name}: `;
  const suf = ` ${val} `;
  const dots = Math.max(w - pre.length - suf.length, 1);
  if (dimZero && val === 0) {
    return `%ch%cx${pre}%cn${".".repeat(dots)}%ch%cx${suf}%cn`;
  }
  return `%ch%cw${pre}%cn${".".repeat(dots)}%ch%cw${suf}%cn`;
}

function infoPair(ll: string, lv: string, rl = "", rv = ""): string {
  lv = (lv || "").slice(0, 22);
  rv = (rv || "").slice(0, 22);
  const left = ` ${ll.padEnd(15)}${lv.padEnd(22)}`;  // 1 + 15 + 22 = 38
  const right = rl
    ? `  ${rl.padEnd(15)}${rv.padEnd(22)}`            // 2 + 15 + 22 = 39
    : " ".repeat(39);
  return `${left}${right}`;
}

function healthLine(name: string, penalty: string): string {
  return ` ${name.padEnd(9)}${penalty.padStart(3)} [ ]  `;
}

function pipe(): string {
  return "|";
}

function eqBar(): string {
  return "=".repeat(WIDTH);
}

function isStaff(u: IUrsamuSDK): boolean {
  return u.me.flags.has("superuser") || u.me.flags.has("admin") || u.me.flags.has("wizard");
}

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

export default () =>
  addCmd({
    name: "+sheet",
    pattern: /^\+sheet\s*(.*)/i,
    lock: "connected",
    exec: async (u: IUrsamuSDK) => {
      await loadStatNames();

      const arg = (u.cmd.args[0] || "").trim();
      let targetData: Record<string, unknown>;
      let targetName: string;

      if (arg) {
        // Staff viewing another player
        if (!isStaff(u)) {
          u.send(">GAME: Only staff may view another character's sheet.");
          return;
        }
        const results = await dbojs.query({ "data.name": new RegExp(`^${arg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, "i") });
        const target = results.find((o: any) => o.flags.includes("player"));
        if (!target) {
          u.send(`>GAME: No character found matching '${arg}'.`);
          return;
        }
        targetData = (target.data || {}) as Record<string, unknown>;
        targetName = (targetData.name as string) || "Unknown";
      } else {
        targetData = u.me.state as Record<string, unknown>;
        targetName = (targetData.moniker as string) || (targetData.name as string) || u.me.name || "Unknown";
      }

      if (!targetData.sphere) {
        u.send(">GAME: Please start character generation and select your sphere before viewing your +sheet.");
        return;
      }

      const stats = (targetData.stats as Record<string, number>) || {};
      const lines: string[] = [];

      // ================================================================
      // Info header
      // ================================================================
      lines.push(header(`${targetName}'s Sheet`));

      const fullname = (targetData.fullname as string) || "";
      const sphere = (targetData.sphere as string) || "";
      const birthyear = targetData.birthyear as number | undefined;
      const embraceyear = targetData.embraceyear as number | undefined;
      const birth = birthyear ? `${Math.abs(birthyear)} BCE` : "";
      const embrace = embraceyear ? `${Math.abs(embraceyear)} BCE` : "";
      const concept = (targetData.concept as string) || "";
      const nature = (targetData.nature as string) || "";
      const demeanor = (targetData.demeanor as string) || "";
      const sire = (targetData.sire as string) || "";
      const clan = (targetData.clan as string) || "";
      const caste = targetData.caste as string | undefined;
      const clanDisplay = caste ? `${clan} (${caste})` : clan;
      const genVal = stats["Generation Value"] || "";

      lines.push(infoPair("Full name:", fullname, "Sphere:", sphere));
      lines.push(infoPair("Birth year:", birth, "Embrace year:", embrace));
      lines.push(infoPair("Concept:", concept, "Nature:", nature));
      lines.push(infoPair("Demeanor:", demeanor, "Sire:", sire));
      lines.push(infoPair("Clan:", clanDisplay, "Generation:", String(genVal)));

      // ================================================================
      // Attributes (3 columns)
      // ================================================================
      lines.push(header("Attributes", "%cc"));

      const attrHdrs = ["Physical", "Social", "Mental"];
      let hdr = "";
      for (let i = 0; i < attrHdrs.length; i++) {
        const h = attrHdrs[i];
        const padL = Math.floor((COL3 - h.length) / 2);
        const padR = COL3 - padL - h.length;
        hdr += " ".repeat(padL) + h + " ".repeat(padR);
        if (i < 2) hdr += pipe();
      }
      lines.push(hdr);

      const attrCols = [
        ATTR_CATS.Physical.map((n) => [n, stats[n] ?? 1] as [string, number]),
        ATTR_CATS.Social.map((n) => [n, stats[n] ?? 1] as [string, number]),
        ATTR_CATS.Mental.map((n) => [n, stats[n] ?? 1] as [string, number]),
      ];

      const maxAttrRows = Math.max(...attrCols.map((c) => c.length));
      for (let r = 0; r < maxAttrRows; r++) {
        let row = "";
        for (let c = 0; c < 3; c++) {
          const cell = attrCols[c][r];
          row += cell ? dot(cell[0], cell[1], COL3) : " ".repeat(COL3);
          if (c < 2) row += pipe();
        }
        lines.push(row);
      }

      // ================================================================
      // Abilities (3 columns)
      // ================================================================
      lines.push(header("Abilities", "%cc"));

      const abilHdrs = ["Talents", "Skills", "Knowledges"];
      hdr = "";
      for (let i = 0; i < abilHdrs.length; i++) {
        const h = abilHdrs[i];
        const padL = Math.floor((COL3 - h.length) / 2);
        const padR = COL3 - padL - h.length;
        hdr += " ".repeat(padL) + h + " ".repeat(padR);
        if (i < 2) hdr += pipe();
      }
      lines.push(hdr);

      const abilCols = [
        ABIL_CATS.Talents.map((n) => [n, stats[n] ?? 0] as [string, number]),
        ABIL_CATS.Skills.map((n) => [n, stats[n] ?? 0] as [string, number]),
        ABIL_CATS.Knowledges.map((n) => [n, stats[n] ?? 0] as [string, number]),
      ];

      const maxAbilRows = Math.max(...abilCols.map((c) => c.length));
      for (let r = 0; r < maxAbilRows; r++) {
        let row = "";
        for (let c = 0; c < 3; c++) {
          const cell = abilCols[c][r];
          row += cell ? dot(cell[0], cell[1], COL3, true) : " ".repeat(COL3);
          if (c < 2) row += pipe();
        }
        lines.push(row);
      }

      // ================================================================
      // Disciplines (2 columns)
      // ================================================================
      const discList = DISCIPLINE_NAMES
        .filter((n) => (stats[n] || 0) > 0)
        .map((n) => [n, stats[n]] as [string, number]);

      lines.push(header("Disciplines", "%cc"));
      if (discList.length > 0) {
        const lw = 38;
        const rw = 39;
        for (let i = 0; i < discList.length; i += 2) {
          const left = dot(discList[i][0], discList[i][1], lw);
          const right = i + 1 < discList.length
            ? dot(discList[i + 1][0], discList[i + 1][1], rw)
            : " ".repeat(rw);
          lines.push(left + right);
        }
      }

      // ================================================================
      // Bottom section: Advantages | Pools+Virtues | Health
      // ================================================================
      function botHdrCol(label: string, w: number): string {
        const inner = ` ${label} `;
        const padL = Math.floor((w - inner.length) / 2);
        const padR = w - padL - inner.length;
        return `${"=".repeat(Math.max(0, padL))}%cc${inner}%cn${"=".repeat(Math.max(0, padR))}`;
      }

      // Bottom header with spaced pipe separators
      lines.push(
        botHdrCol("Advantages", BOT_L) + pipe() +
        botHdrCol("Pools", BOT_M) + pipe() +
        botHdrCol("Health", BOT_R),
      );

      // --- Left column: Backgrounds / Merits / Flaws ---
      const left: string[] = [];

      const bgEntries = BACKGROUND_NAMES
        .filter((n) => (stats[n] || 0) > 0)
        .map((n) => [n, stats[n]] as [string, number]);
      const padCenter = (s: string, w: number) => {
        const padL = Math.floor((w - s.length) / 2);
        return " ".repeat(padL) + s + " ".repeat(w - padL - s.length);
      };
      left.push(padCenter("Backgrounds", BOT_L));
      for (const [n, v] of bgEntries) left.push(dot(n, v, BOT_L));

      const meritEntries = MERIT_NAMES
        .filter((n) => (stats[n] || 0) > 0)
        .map((n) => [n, stats[n]] as [string, number]);
      if (meritEntries.length > 0) {
        left.push(padCenter("Merits", BOT_L));
        for (const [n, v] of meritEntries) left.push(dot(n, v, BOT_L));
      }

      const flawEntries = FLAW_NAMES
        .filter((n) => (stats[n] || 0) > 0)
        .map((n) => [n, stats[n]] as [string, number]);
      if (flawEntries.length > 0) {
        left.push(padCenter("Flaws", BOT_L));
        for (const [n, v] of flawEntries) left.push(dot(n, v, BOT_L));
      }

      // --- Middle column: Willpower, Blood, Humanitas, Virtues ---
      const mid: string[] = [];
      const wpCur = stats["Willpower Current"] || 0;
      const wpMax = stats["Willpower"] || 0;
      mid.push(dot("Willpower", `${wpCur}/${wpMax}`, BOT_M));

      const bpCur = stats["Blood Pool"] || 0;
      const bpMax = stats["Blood Pool Max"] || 0;
      mid.push(dot("Blood", `${bpCur}/${bpMax}`, BOT_M));
      mid.push(" ".repeat(BOT_M));

      // Path subsection
      const pathLabel = " Path ";
      const ppL = Math.floor((BOT_M - 2 - pathLabel.length) / 2);
      const ppR = BOT_M - 2 - ppL - pathLabel.length;
      mid.push(` ${"-".repeat(ppL)}%cc${pathLabel}%cn${"-".repeat(ppR)} `);
      mid.push(dot("Humanitas", stats["Humanitas"] ?? 10, BOT_M));
      mid.push(" ".repeat(BOT_M));

      // Virtues subsection
      const virtLabel = " Virtues ";
      const vpL = Math.floor((BOT_M - 2 - virtLabel.length) / 2);
      const vpR = BOT_M - 2 - vpL - virtLabel.length;
      mid.push(` ${"-".repeat(vpL)}%cc${virtLabel}%cn${"-".repeat(vpR)} `);
      for (const vname of VIRTUE_NAMES) {
        mid.push(dot(vname, stats[vname] ?? 0, BOT_M));
      }

      // --- Right column: Health track ---
      const right: string[] = [];
      for (const [hname, hpen] of HEALTH) {
        right.push(healthLine(hname, hpen));
      }

      // Pad all columns to the same height
      const maxRows = Math.max(left.length, mid.length, right.length);
      while (left.length < maxRows) left.push(" ".repeat(BOT_L));
      while (mid.length < maxRows) mid.push(" ".repeat(BOT_M));
      while (right.length < maxRows) right.push(" ".repeat(BOT_R));

      for (let i = 0; i < maxRows; i++) {
        lines.push(left[i] + pipe() + mid[i] + pipe() + right[i]);
      }

      // Footer
      lines.push(eqBar());

      u.send(lines.join("\n"));
    },
  });
