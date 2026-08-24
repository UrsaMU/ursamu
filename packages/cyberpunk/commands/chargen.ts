/**
 * +chargen -- Character Generation Wizard
 */
import { addCmd } from "@ursamu/ursamu";
import type { IUrsamuSDK } from "@ursamu/ursamu";
import type { ICPRCharacter, ChargenStage, ILifepath } from "../db/schemas.ts";
import {
  CULTURAL_TABLE, PERSONALITY_TABLE, LIFE_GOAL_TABLE, VALUES_TABLE,
  FAMILY_TABLE, FAMILY_CRISIS_TABLE, FRIEND_TABLE,
  ENEMY_WHO_TABLE, ENEMY_CAUSE_TABLE, ENEMY_RESOURCES_TABLE,
  LIFE_EVENTS_TABLE, ROLE_EVENTS,
} from "./chargen-lifepath-data.ts";
import { ROLES } from "../data/roles.ts";
import {
  handleMethod, handleRole, handleStat, handleSkill,
  handleLifepathSet, handleLifestyleSet, handleDone, handleNotes,
  handleReset,
  handleChrome, handleGear, handleRoll, handleDetail, handleReroll,
} from "./chargen-steps.ts";

// --- Layout helpers (78-char wide, retro-future cyberpunk palette) ----------

import { AsyncLocalStorage } from "node:async_hooks";

export const W = 78;

/**
 * Glyph mode: "ascii" (default, Latin-1 safe) or "utf8" (box-drawing + blocks).
 * Selected per-command from the runner's `utf8` flag via middleware in
 * commands.ts. Helpers consult `mode()` at call time.
 */
export type GlyphMode = "ascii" | "utf8";

const glyphCtx = new AsyncLocalStorage<GlyphMode>();
let forcedMode: GlyphMode | null = null;

/** Run `fn` with `mode` active for all helper calls inside it (and async descendants). */
export const runWithMode = <T>(m: GlyphMode, fn: () => T): T => glyphCtx.run(m, fn);
/** Force every helper inside `fn` to ascii — wrap multi-recipient broadcasts. */
export const withAscii = <T>(fn: () => T): T => glyphCtx.run("ascii", fn);
/** Hard override mode (tests / debugging). Pass `null` to fall back to ALS. */
export const setGlyphs = (m: GlyphMode | null) => { forcedMode = m; };
/** Current effective mode. */
export const getMode = (): GlyphMode => forcedMode ?? glyphCtx.getStore() ?? "ascii";

const GLYPHS = {
  ascii: {
    hrHeavy: "=",     hrLight: "-",
    scan:    "",      // ascii has no half-height rule; scan is omitted
    pipOn:   "#",     pipOff:  "-",
    cornerTL: "+",    cornerTR: "+",
    cornerBL: "+",    cornerBR: "+",
  },
  utf8: {
    hrHeavy: "═", // ═
    hrLight: "─", // ─
    scan:    "▔", // ▔  top-eighth-block (HUD scanline)
    pipOn:   "█", // █
    pipOff:  "░", // ░
    cornerTL: "╔", // ╔
    cornerTR: "╗", // ╗
    cornerBL: "╚", // ╚
    cornerBR: "╝", // ╝
  },
} as const;

const g = () => GLYPHS[getMode()];

/** Cyan heavy rule, full 78 chars. */
export const bar = (ch?: string) => `%cc${(ch ?? g().hrHeavy).repeat(W)}%cn`;
/** Cyan light rule, full 78 chars. */
export const div = () => `%cc${g().hrLight.repeat(W)}%cn`;
/** Centered tagged rule: `═══[ TITLE ]═══`. Yellow tag on cyan rule. 78 wide. */
export const hdr = (t: string) => {
  const heavy = g().hrHeavy;
  const visibleTag = `[ ${t.toUpperCase()} ]`;
  const fill = Math.max(0, W - visibleTag.length - 2); // -2 for the spaces around the tag
  const l = Math.floor(fill / 2);
  const r = fill - l;
  return `%cc${heavy.repeat(l)} %cy${visibleTag}%cn %cc${heavy.repeat(r)}%cn`;
};

/**
 * Top corner frame with optional left title and right context, 78 wide.
 *   utf8:  ╔══[ TITLE ]══...══[ right ]══╗
 *   ascii: +==[ TITLE ]==...==[ right ]==+
 */
export const frameTop = (opts: { title?: string; right?: string } = {}) =>
  framedRule({ ...opts, side: "top" });

/**
 * Bottom corner frame with optional right tag, 78 wide.
 *   utf8:  ╚══...══[ right ]══╝
 *   ascii: +==...==[ right ]==+
 */
export const frameBot = (opts: { right?: string } = {}) =>
  framedRule({ ...opts, side: "bot" });

function framedRule(opts: { title?: string; right?: string; side: "top" | "bot" }): string {
  const cur = g();
  const tl = opts.side === "top" ? cur.cornerTL : cur.cornerBL;
  const tr = opts.side === "top" ? cur.cornerTR : cur.cornerBR;
  const titleTag = opts.title ? `[ ${opts.title.toUpperCase()} ]` : "";
  const rightTag = opts.right ? `[ ${opts.right} ]` : "";
  // Layout: TL + "══" + (titleTag) + "══...══" + (rightTag) + "══" + TR  = W
  // Outer caps consume 2 chars total (corners). After corners we have W-2 cells.
  const heavy = cur.hrHeavy;
  const innerW = W - 2;            // chars between corners
  const leftLead  = heavy.repeat(2);
  const rightLead = heavy.repeat(2);
  const tagsLen   = titleTag.length + rightTag.length;
  const fill = innerW - leftLead.length - rightLead.length - tagsLen;
  if (fill < 1) {
    // Degenerate: tags too wide; truncate right tag and recurse-less
    const safeRight = rightTag.slice(0, Math.max(0, innerW - leftLead.length - rightLead.length - titleTag.length - 1));
    const finalFill = Math.max(1, innerW - leftLead.length - rightLead.length - titleTag.length - safeRight.length);
    return `%cc${tl}${leftLead}%cn%cy${titleTag}%cn%cc${heavy.repeat(finalFill)}%cy${safeRight}%cn%cc${rightLead}${tr}%cn`;
  }
  return `%cc${tl}${leftLead}%cn%cy${titleTag}%cn%cc${heavy.repeat(fill)}%cy${rightTag}%cn%cc${rightLead}${tr}%cn`;
}

/** Single scanline `▔×78` (utf8) or empty string (ascii). Place under frameTop for HUD raster. */
export const scan = (): string => {
  const s = g().scan;
  return s ? `%cc${s.repeat(W)}%cn` : "";
};

/**
 * Status pill: bracketed, fixed 10 visible cells, color by tone.
 * `[ NOMINAL  ]`, `[ HIT      ]`, `[ CRITICAL ]`, etc.
 */
export type PillTone = "ok" | "warn" | "bad" | "info" | "alt";
const PILL_COLOR: Record<PillTone, string> = {
  ok: "%cg", warn: "%cy", bad: "%cr", info: "%cc", alt: "%cm",
};
export const pill = (text: string, tone: PillTone = "info"): string => {
  const inner = 10; // 14 cells total -- room for "JACKED IN", "CRITICAL", etc.
  const t = text.toUpperCase().slice(0, inner).padEnd(inner, " ");
  return `${PILL_COLOR[tone]}[ ${t} ]%cn`;
};

/**
 * Block gauge `[██████░░░░]` (utf8) / `[######----]` (ascii).
 * `cur`/`max` clamped to [0, max]; width = inner cell count, default 10.
 */
export const gauge = (cur: number, max: number, width = 10): string => {
  const c = Math.max(0, Math.min(max, cur));
  const filled = max <= 0 ? 0 : Math.round((c / max) * width);
  const gl = g();
  return `%cc[%cg${gl.pipOn.repeat(filled)}%cw${gl.pipOff.repeat(width - filled)}%cc]%cn`;
};

/** Centered `>> [coloredName]  ::  ROLE <<` — name keeps its own color, rest is yellow. */
export const nameHdr = (coloredName: string, role: string) => {
  const plainName = coloredName.replace(/%c[a-z]|%[rtnb]/gi, "");
  const visible = `>> ${plainName}  ::  ${role.toUpperCase()} <<`;
  const pad = Math.max(0, W - visible.length);
  const l = Math.floor(pad / 2);
  return " ".repeat(l) + `%cy>> %cn${coloredName}%cy  ::  ${role.toUpperCase()} <<%cn`;
};
/** Magenta label, reset after. */
export const lbl  = (s: string) => `%cm${s}%cn`;
/** Cyan value. */
export const val  = (s: string | number) => `%cc${s}%cn`;
/** Blue accent. */
export const acc  = (s: string) => `%cb${s}%cn`;
/** White -- secondary info. */
export const dim  = (s: string) => `%cw${s}%cn`;
/** Green inline text -- success results. */
export const good = (s: string) => `%cg${s}%cn`;
/** Red inline text -- failure / danger results. */
export const bad  = (s: string) => `%cr${s}%cn`;
/** Yellow inline text -- neutral highlights. */
export const ylw  = (s: string) => `%cy${s}%cn`;
/** Prompt arrow prefix. */
export const ARR  = `%cc>>%cn `;
/** Error prefix. */
export const ERR  = `%cr!!%cn `;
/** Success prefix. */
export const OK   = `%cg::%cn `;

/** Two-column label: value row, left=22 visible chars, right fills to 78. */
export function row(label: string, value: string): string {
  const lPad = 22;
  const labelPlain = label.padEnd(lPad);
  return `  ${lbl(labelPlain)} ${value}`;
}

/**
 * Like row() but wraps the value at 78 chars if it is too long.
 * Splits on ", " boundaries; continuation lines align under the value.
 * Returns an array of lines.
 */
export function rowWrap(label: string, value: string): string[] {
  const lPad   = 22;
  const valueW = W - 2 - lPad - 1; // 53
  if (plain(value).length <= valueW) return [row(label, value)];
  const colorMatch = value.match(/^((?:%[a-z]+)+)/i);
  const colorPfx   = colorMatch?.[1] ?? "";
  const colorSfx   = value.endsWith("%cn") ? "%cn" : "";
  const raw        = plain(value);
  // Word-boundary wrap (handles both comma-lists and prose sentences)
  const words = raw.split(" ");
  const segs: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length > valueW && cur) { segs.push(cur); cur = w; }
    else cur = next;
  }
  if (cur) segs.push(cur);
  const labelPlain = label.padEnd(lPad);
  const indent     = " ".repeat(2 + lPad + 1);
  return [
    `  ${lbl(labelPlain)} ${colorPfx}${segs[0]}${colorSfx}`,
    ...segs.slice(1).map((s) => `${indent}${colorPfx}${s}${colorSfx}`),
  ];
}

/** Strip MUSH color codes to measure visible length. */
const plain = (s: string) => s.replace(/%c[a-z]|%[rtnb]/gi, "");

/**
 * Word-wrap `text` at `max` visible chars.
 * Returns an array of lines; each line begins with `indent`.
 */
export function wrap(text: string, max = W - 2, indent = "  "): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let cur = indent;
  for (const word of words) {
    const candidate = cur === indent ? indent + word : cur + " " + word;
    if (plain(candidate).length > max && plain(cur) !== plain(indent)) {
      lines.push(cur);
      cur = indent + word;
    } else {
      cur = candidate;
    }
  }
  if (plain(cur) !== plain(indent)) lines.push(cur);
  return lines.length ? lines : [indent];
}

/**
 * Arrange `items` in a grid of `per` columns inside the 78-char terminal.
 * Each column is padded to equal width.
 */
export function grid(items: string[], per = 4, indent = "    "): string[] {
  const colW = Math.floor((W - plain(indent).length) / per);
  const result: string[] = [];
  for (let i = 0; i < items.length; i += per) {
    const chunk = items.slice(i, i + per);
    const line = indent + chunk
      .map((it) => it + " ".repeat(Math.max(0, colW - plain(it).length)))
      .join("")
      .trimEnd();
    result.push(line);
  }
  return result;
}

/** Pad a string (possibly containing MUSH color codes) to a visible width. */
const padTo      = (s: string, w: number) => s + " ".repeat(Math.max(0, w - plain(s).length));
const padToRight = (s: string, w: number) => " ".repeat(Math.max(0, w - plain(s).length)) + s;

/** Truncate a plain string to at most w visible characters. */
const cutTo = (s: string, w: number) => plain(s).length > w ? plain(s).slice(0, w) : s;

const TBL_W = 78;

/**
 * Render a data table within the 78-char terminal.
 * Header and divider rows are padded to TBL_W. Data cells are truncated at
 * their column width so content never overflows into the next column.
 */
export function tbl(
  cols: { label: string; width: number; align?: "left" | "right" }[],
  rows: string[][],
  indent = "  ",
): string[] {
  const pad = (s: string, c: { width: number; align?: "left" | "right" }) =>
    c.align === "right" ? padToRight(s, c.width) : padTo(s, c.width);
  const hdrJoin  = (cells: string[]) => { const s = indent + cells.join("  "); return s + " ".repeat(Math.max(0, TBL_W - plain(s).length)); };
  const dataJoin = (cells: string[]) => (indent + cells.join("  ")).trimEnd();
  const lines = [
    hdrJoin(cols.map((c) => pad(lbl(c.label), c))),
    hdrJoin(cols.map((c) => dim("-".repeat(c.width)))),
  ];
  for (const r of rows) {
    lines.push(dataJoin(cols.map((c, i) => pad(cutTo(r[i] ?? "", c.width), c))));
  }
  return lines;
}

/**
 * Like tbl() but cell values may contain \n to span multiple lines.
 * Header and divider rows are padded to TBL_W.
 */
export function tblWrap(
  cols: { label: string; width: number }[],
  rows: string[][],
  indent = "  ",
): string[] {
  const hdrJoin  = (cells: string[]) => { const s = indent + cells.join("  "); return s + " ".repeat(Math.max(0, TBL_W - plain(s).length)); };
  const dataJoin = (cells: string[]) => (indent + cells.join("  ")).trimEnd();
  const lines = [
    hdrJoin(cols.map((c) => padTo(lbl(c.label), c.width))),
    hdrJoin(cols.map((c) => dim("-".repeat(c.width)))),
  ];
  for (const r of rows) {
    const splits = r.map((cell) => (cell ?? "").split("\n"));
    const height = Math.max(...splits.map((s) => s.length));
    for (let ln = 0; ln < height; ln++) {
      lines.push(dataJoin(cols.map((c, i) => padTo(cutTo(splits[i]?.[ln] ?? "", c.width), c.width))));
    }
  }
  return lines;
}

const STAGE_ORDER: ChargenStage[] = [
  "method", "role_select",
  "lifepath_cultural", "lifepath_personality", "lifepath_motivations",
  "lifepath_family", "lifepath_friends", "lifepath_enemies",
  "lifepath_events", "lifepath_role",
  "stats", "skills", "lifestyle", "cyberware", "equipment", "review",
];

export const nextChargenStage = (current: ChargenStage): ChargenStage => {
  const idx = STAGE_ORDER.indexOf(current);
  if (idx < 0 || idx >= STAGE_ORDER.length - 1) return "review";
  return STAGE_ORDER[idx + 1] as ChargenStage;
};

// --- Command -----------------------------------------------------------------

addCmd({
  name: "+chargen",
  pattern: /^\+chargen(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Cyberpunk RED",
  help: `+chargen[/<switch>] [<argument>]  -- Step through character generation.

Switches:
  /method <streetrat|edgerunner|complete>  Creation method.
  /role <role>                   Select your role.
  /roll [<stage>] [<n>]          Auto-roll or designate any lifepath result.
  /reroll [friends|enemies]      Re-roll the entire friends or enemies bundle.
  /detail <stage> <n>            Show full entry with mechanical notes.
  /next                          Advance through lifepath stages.
  /stat <stat>=<value>           Allocate a stat (complete method only).
  /skill <skill>=<value>         Set skill level.
  /lifestyle <tier>              Choose lifestyle tier.
  /chrome <list|name>            Browse or install starting cyberware.
  /gear <list|name>              Browse or add starting weapons and armor.
  /done                          Finalize and complete chargen.
  /reset <name>                  (Wizard+) Wipe draft or approved sheet.

Examples:
  +chargen                       Show current stage and roll tables.
  +chargen/method complete       Begin the Complete Package.
  +chargen/role solo             Choose the Solo role.
  +chargen/roll                  Auto-roll the current lifepath table.
  +chargen/roll family           Auto-roll family background (any stage).
  +chargen/reroll friends        Re-roll the entire friends bundle.
  +chargen/reroll enemies        Re-roll the entire enemies bundle.
  +chargen/detail enemies 7      Read full entry for enemies roll 7.
  +chargen/next                  Move to the next lifepath stage.
  +chargen/stat ref=7            Set REF to 7.
  +chargen/skill handgun=6       Set Handgun to 6.
  +chargen/notes <text>          Set concept / background notes.
  +chargen/done                  Submit for staff approval (needs notes).
  +chargen/reset Sable           (Wizard+) Wipe Sable's sheet.`,

  exec: async (u: IUrsamuSDK) => {
    const sw  = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const arg = u.util.stripSubs(u.cmd.args[1] ?? "").trim();

    // Staff wipe must run even when the wizard is themselves approved.
    if (sw === "reset") {
      await handleReset(u, arg);
      return;
    }

    const cpr = u.me.state.cpr as ICPRCharacter | undefined;

    if (cpr?.chargenComplete || cpr?.chargenStatus === "approved") {
      u.send(
        `${ARR}Your chrome is already set. Type ${val("+sheet")} ` +
          `to view your character. Staff: ` +
          `${val("+chargen/reset <name>")} or ` +
          `${val("+cprreset <name>")}.`,
      );
      return;
    }

    if (cpr?.chargenStatus === "pending" && sw &&
      sw !== "notes" && sw !== "done" && sw !== "reset") {
      u.send(
        `${ARR}Pending staff review — cannot edit. ` +
          `Wait for approval or ask staff to reject.`,
      );
      return;
    }

    if (!cpr) { await initCharacter(u); return; }

    if (!sw) { showCurrentStage(u, cpr); return; }

    switch (sw) {
      case "method":    await handleMethod(u, cpr, arg); break;
      case "role":      await handleRole(u, cpr, arg); break;
      case "set":       await handleLifepathSet(u, cpr, arg); break;
      case "next":      await advanceLifepathStage(u, cpr); break;
      case "stat":      await handleStat(u, cpr, arg); break;
      case "skill":     await handleSkill(u, cpr, arg); break;
      case "chrome":    await handleChrome(u, cpr, arg); break;
      case "gear":      await handleGear(u, cpr, arg); break;
      case "lifestyle": await handleLifestyleSet(u, cpr, arg); break;
      case "roll":      await handleRoll(u, cpr, arg); break;
      case "reroll":    await handleReroll(u, cpr, arg); break;
      case "detail":    handleDetail(u, cpr, arg); break;
      case "notes":     await handleNotes(u, cpr, arg); break;
      case "done":      await handleDone(u, cpr, arg); break;
      default:
        u.send(
          `${ERR}Unknown switch ${val("/" + sw)}. ` +
            `Type ${val("+chargen")} for help.`,
        );
    }
  },
});

// --- Init (first time) -------------------------------------------------------

async function initCharacter(u: IUrsamuSDK): Promise<void> {
  const fresh: ICPRCharacter = {
    stats: { int: 2, ref: 2, dex: 2, tech: 2, cool: 2, will: 2, luck: 2, move: 2, body: 2, emp: 6, empBase: 6 },
    hp: { max: 12, current: 12 }, swThreshold: 6, deathSave: 2, deathSavePenalty: 0,
    role: "solo", roleRank: 4, roleData: {},
    skills: {}, luckRemaining: 2, woundState: "healthy",
    criticalInjuries: [], armorBody: null, armorHead: null,
    cyberware: [], humanityLoss: 0, bodysculpt: [], gear: [], activeEffects: [],
    reputation: 0, reputationDeeds: [], eurodollars: 0, lifestyle: null,
    lifepath: {}, chargenComplete: false, chargenStatus: "draft",
    conceptNotes: "", chargenRejectReason: "",
    chargenStage: "method", chargenMethod: null,
    chargenStatPool: 62, chargenSkillPool: 86,
    restTimer: null, humanityGainedAt: null, locationEffects: [],
  };
  await u.db.modify(u.me.id, "$set", { "state.cpr": fresh });

  u.send([
    bar(),
    hdr("NIGHT CITY DATATERM :: CHARGEN v2.0.77"),
    bar(),
    row("STAGE",    val("METHOD")),
    row("PROGRESS", `${"%cm[..............................]%cn"} ${dim("1/16 (6%)")}`),
    row("METHOD",   dim("not set")),
    row("ROLE",     dim("not set")),
    div(),
    ...wrap("Jacking into the grid. Welcome to the future.", W - 2),
    "",
    `  ${ARR}Choose your creation method:`,
    "",
    `    ${val("+chargen/method streetrat")}`,
    ...wrap("Quick start -- preset stats optimized for your role.", W - 4, "      "),
    "",
    `    ${val("+chargen/method edgerunner")}`,
    ...wrap("Fast & dirty -- roll each STAT on the template.", W - 4, "      "),
    "",
    `    ${val("+chargen/method complete")}`,
    ...wrap(`Full point-buy -- ${acc("62")} stat points, ${acc("86")} career skill points.`, W - 4, "      "),
    bar(),
  ].join("\r\n"));
}

// --- Progress header (reused by every step handler) --------------------------

/** Render the progress header block. Returns lines ready to join("\r\n"). */
export function stageHeader(cpr: ICPRCharacter): string[] {
  const stage  = cpr.chargenStage ?? "method";
  const idx    = STAGE_ORDER.indexOf(stage);
  const total  = STAGE_ORDER.length;
  const pct    = Math.round(((idx + 1) / total) * 100);
  const filled = Math.round((pct / 100) * 30);
  const progressBar = `%cm[${"#".repeat(filled)}${".".repeat(30 - filled)}]%cn`;
  return [
    bar(),
    hdr("CHARACTER GENERATION"),
    bar(),
    row("STAGE",    val(stage.replace(/_/g, " ").toUpperCase())),
    row("PROGRESS", `${progressBar} ${dim(`${idx + 1}/${total} (${pct}%)`)}`),
    row("METHOD",   cpr.chargenMethod ? val(cpr.chargenMethod.toUpperCase()) : dim("not set")),
    row("ROLE",     cpr.role ? val(cpr.role.toUpperCase()) : dim("not set")),
    div(),
  ];
}

// --- Show current stage ------------------------------------------------------

function showCurrentStage(u: IUrsamuSDK, cpr: ICPRCharacter): void {
  const stage = cpr.chargenStage ?? "method";
  u.send([
    ...stageHeader(cpr),
    ...stagePromptLines(cpr, stage),
    bar(),
  ].join("\r\n"));
}

// --- Stage prompt lines ------------------------------------------------------

function stagePromptLines(cpr: ICPRCharacter, stage: ChargenStage): string[] {
  const lp   = cpr.lifepath ?? {};
  const selN = (n: number | string, selected: boolean): string =>
    selected ? `${acc("►")}${acc(String(n))}` : String(n);
  const lpFooter = `  ${ARR}${val("+chargen/roll [<n>]")}  |  ${val("+chargen/detail <n>")}  |  ${val("+chargen/next")}`;

  switch (stage) {
    case "method":
      return [
        `  ${ARR}Choose your creation method:`,
        "",
        `  ${val("+chargen/method streetrat")}`,
        ...wrap("Preset stats tuned for your role.", W - 4, "    "),
        "",
        `  ${val("+chargen/method edgerunner")}`,
        ...wrap("Fast & dirty -- roll each STAT independently.", W - 4, "    "),
        "",
        `  ${val("+chargen/method complete")}`,
        ...wrap(`Full point-buy -- ${acc("62")} stat points.`, W - 4, "    "),
      ];

    case "role_select":
      return [
        `  ${ARR}Select your role:`,
        `    ${val("+chargen/role <role>")}`,
        "",
        `  ${dim("Available roles:")}`,
        ...grid(ROLES.map((r) => acc(r.name)), 4, "    "),
      ];

    case "lifepath_cultural": {
      const sel = lp.culturalOrigin ?? "";
      return [
        ...wrap("Where did your people come from? Roll 1d10 or pick your region. Your native language starts at rank 4.", W - 2),
        ...(sel ? ["", row("ORIGIN",   val(sel)), row("LANGUAGE", `${val(lp.language ?? "--")} ${dim("(native · rank 4)")}`), div()] : [""]),
        ...tblWrap(
          [{ label: "D10", width: 3 }, { label: "REGION", width: 24 }, { label: "LANGUAGES", width: 34 }],
          [
            [selN(1,  sel === "North American"),           "North American",           "Chinese, Cree, Creole, English,\nFrench, Navajo, Spanish"],
            [selN(2,  sel === "South/Central American"),   "South/Central American",   "Creole, English, German, Guarani,\nMayan, Portuguese, Spanish"],
            [selN(3,  sel === "Western European"),         "Western European",         "Dutch, English, French, German,\nItalian, Norwegian, Spanish"],
            [selN(4,  sel === "Eastern European"),         "Eastern European",         "English, Finnish, Polish, Romanian,\nRussian, Ukrainian"],
            [selN(5,  sel === "Middle Eastern/N African"), "Middle Eastern/N African", "Arabic, Berber, English, Farsi,\nFrench, Hebrew, Turkish"],
            [selN(6,  sel === "Sub-Saharan African"),      "Sub-Saharan African",      "Arabic, English, French, Hausa,\nLingala, Swahili, Yoruba"],
            [selN(7,  sel === "South Asian"),              "South Asian",              "Bengali, Dari, English, Hindi,\nNepali, Tamil, Urdu"],
            [selN(8,  sel === "South East Asian"),         "South East Asian",         "Arabic, Burmese, English, Filipino,\nIndonesian, Vietnamese"],
            [selN(9,  sel === "East Asian"),               "East Asian",               "Cantonese, English, Japanese,\nKorean, Mandarin, Mongolian"],
            [selN(10, sel === "Oceania/Pacific Islander"), "Oceania/Pacific Islander", "English, French, Hawaiian, Maori,\nPama-Nyungan, Tahitian"],
          ],
        ),
        "",
        lpFooter,
      ];
    }

    case "lifepath_personality": {
      const selP = lp.personality ?? "";
      return [
        ...wrap("In the Dark Future, your look is your armor. What do you project to the Street? Roll or choose.", W - 2),
        ...(selP ? ["", row("PERSONALITY", val(selP)), row("STYLE", val(lp.clothingStyle ?? "--")), row("HAIR", val(lp.hairstyle ?? "--")), div()] : [""]),
        ...tbl(
          [{ label: "D10", width: 3 }, { label: "PERSONALITY", width: 32 }, { label: "STYLE", width: 16 }, { label: "HAIR", width: 18 }],
          [
            [selN(1,  selP === "Shy and secretive"),               "Shy and secretive",               "Generic Chic",    "Mohawk"],
            [selN(2,  selP === "Rebellious, antisocial, violent"),  "Rebellious, antisocial, violent",  "Leisurewear",     "Long and ratty"],
            [selN(3,  selP === "Arrogant, proud, aloof"),           "Arrogant, proud, aloof",           "Urban Flash",     "Short and spiked"],
            [selN(4,  selP === "Moody, rash, headstrong"),          "Moody, rash, headstrong",          "Businesswear",    "Wild and all over"],
            [selN(5,  selP === "Picky, fussy, nervous"),            "Picky, fussy, nervous",            "High Fashion",    "Bald"],
            [selN(6,  selP === "Stable and serious"),               "Stable and serious",               "Bohemian",        "Striped"],
            [selN(7,  selP === "Silly and fluff-headed"),           "Silly and fluff-headed",           "Bag Lady Chic",   "Wild colors"],
            [selN(8,  selP === "Sneaky and deceptive"),             "Sneaky and deceptive",             "Gang Colors",     "Neat and short"],
            [selN(9,  selP === "Intellectual and detached"),        "Intellectual and detached",        "Nomad Leathers",  "Short and curly"],
            [selN(10, selP === "Friendly and outgoing"),            "Friendly and outgoing",            "Asia Pop",        "Long and straight"],
          ],
        ),
        "",
        lpFooter,
      ];
    }

    case "lifepath_motivations": {
      const selGoal  = lp.lifeGoal ?? "";
      const selThing = lp.mostValuableThing ?? "";
      return [
        ...wrap("What keeps you breathing? Roll or choose for each column.", W - 2),
        ...(selGoal ? ["", row("LIFE GOAL", val(selGoal)), row("FEEL ABOUT PEOPLE", val(lp.feelingAboutPeople ?? "--")), div()] : [""]),
        ...tbl(
          [{ label: "D10", width: 3 }, { label: "LIFE GOAL", width: 34 }, { label: "FEEL ABOUT PEOPLE", width: 32 }],
          [
            [selN(1,  selGoal === "Get rid of a bad reputation."),    "Get rid of a bad reputation.",    "I stay neutral."],
            [selN(2,  selGoal === "Gain power and control."),         "Gain power and control.",         "I stay neutral."],
            [selN(3,  selGoal === "Get off the Street."),             "Get off the Street.",             "I like almost everyone."],
            [selN(4,  selGoal === "Make those who crossed you pay."), "Make those who crossed you pay.", "I hate almost everyone."],
            [selN(5,  selGoal === "Live down your past life."),       "Live down your past life.",       "People are tools. Use them."],
            [selN(6,  selGoal === "Hunt down the responsible."),      "Hunt down the responsible.",      "Every person is valuable."],
            [selN(7,  selGoal === "Get what is rightfully yours."),   "Get what is rightfully yours.",   "People are obstacles."],
            [selN(8,  selGoal === "Save someone from your past."),    "Save someone from your past.",    "People are untrustworthy."],
            [selN(9,  selGoal === "Gain fame and recognition."),      "Gain fame and recognition.",      "Wipe em all out."],
            [selN(10, selGoal === "Make this a better world."),       "Make this a better world.",       "People are wonderful!"],
          ],
        ),
        "",
        ...(selThing ? [row("MOST VALUED THING",  val(selThing)), row("MOST VALUED PERSON", val(lp.mostValuablePerson ?? "--")), row("WHAT YOU VALUE", val(lp.whatYouValue ?? "--")), div()] : [""]),
        ...tbl(
          [{ label: "D10", width: 3 }, { label: "MOST VALUED THING", width: 22 }, { label: "MOST VALUED PERSON", width: 22 }, { label: "WHAT YOU VALUE", width: 18 }],
          [
            [selN(1,  selThing === "A weapon"),             "A weapon",             "A parent",          "Money"],
            [selN(2,  selThing === "A tool"),               "A tool",               "A sibling",         "Honor"],
            [selN(3,  selThing === "A piece of clothing"),  "A piece of clothing",  "A lover",           "Your word"],
            [selN(4,  selThing === "A photograph"),         "A photograph",         "A friend",          "Honesty"],
            [selN(5,  selThing === "A book or diary"),      "A book or diary",      "Yourself",          "Knowledge"],
            [selN(6,  selThing === "A recording"),          "A recording",          "A pet",             "Vengeance"],
            [selN(7,  selThing === "A musical instrument"), "A musical instrument", "A mentor",          "Love"],
            [selN(8,  selThing === "A piece of jewelry"),   "A piece of jewelry",   "A public figure",   "Power"],
            [selN(9,  selThing === "A toy"),                "A toy",                "A personal hero",   "Family"],
            [selN(10, selThing === "A letter"),             "A letter",             "No one",            "Friendship"],
          ],
        ),
        "",
        lpFooter,
      ];
    }

    case "lifepath_family": {
      const selBg     = lp.familyBackground ?? "";
      const selCrisis = lp.familyCrisis ?? "";
      return [
        ...wrap("The world that made you. Who raised you, and what happened to them?", W - 2),
        ...(selBg ? ["", row("BACKGROUND",    val(selBg)), row("CHILDHOOD ENV", val(lp.childhoodEnvironment ?? "--")), div()] : [""]),
        ...tbl(
          [{ label: "D10", width: 3 }, { label: "ORIGINAL BACKGROUND", width: 22 }, { label: "CHILDHOOD ENVIRONMENT", width: 47 }],
          [
            [selN(1,  selBg === "Corporate Execs"),       "Corporate Execs",       "Ran on the Street, no adult supervision."],
            [selN(2,  selBg === "Corporate Managers"),    "Corporate Managers",    "Safe Corp Zone, walled off from the City."],
            [selN(3,  selBg === "Corporate Technicians"), "Corporate Technicians", "In a Nomad pack moving place to place."],
            [selN(4,  selBg === "Nomad Pack"),            "Nomad Pack",            "Nomad pack rooted in transport (ships, trucks)."],
            [selN(5,  selBg === "Ganger Family"),         "Ganger Family",         "Decaying neighborhood, holding off boosters."],
            [selN(6,  selBg === "Combat Zoners"),         "Combat Zoners",         "Heart of the Combat Zone, squatting in ruins."],
            [selN(7,  selBg === "Urban Homeless"),        "Urban Homeless",        "Huge megastructure controlled by a Corp."],
            [selN(8,  selBg === "Megastructure Rats"),    "Megastructure Rats",    "Ruins of a deserted town taken by Reclaimers."],
            [selN(9,  selBg === "Reclaimers"),            "Reclaimers",            "A Drift Nation -- floating offshore city."],
            [selN(10, selBg === "Edgerunners"),           "Edgerunners",           "Corporate luxury starscraper, above the rabble."],
          ],
        ),
        "",
        ...(selCrisis ? [row("FAMILY CRISIS", val(selCrisis)), div()] : [""]),
        ...tbl(
          [{ label: "D10", width: 3 }, { label: "FAMILY CRISIS", width: 68 }],
          [
            [selN(1,  selCrisis === "Your family lost everything through betrayal."),                     "Your family lost everything through betrayal."],
            [selN(2,  selCrisis === "Your family lost everything through bad management."),               "Your family lost everything through bad management."],
            [selN(3,  selCrisis === "Your family was exiled from their home, nation, or Corp."),         "Your family was exiled from their home, nation, or Corp."],
            [selN(4,  selCrisis === "Your family is imprisoned. You alone escaped."),                    "Your family is imprisoned. You alone escaped."],
            [selN(5,  selCrisis === "Your family vanished. You are the only remaining member."),         "Your family vanished. You are the only remaining member."],
            [selN(6,  selCrisis === "Your family was killed. You were the only survivor."),              "Your family was killed. You were the only survivor."],
            [selN(7,  selCrisis === "Your family is part of a conspiracy or crime organization."),       "Your family is part of a conspiracy or crime organization."],
            [selN(8,  selCrisis === "Your family was scattered to the winds by misfortune."),            "Your family was scattered to the winds by misfortune."],
            [selN(9,  selCrisis === "Your family carries a hereditary feud lasting generations."),       "Your family carries a hereditary feud lasting generations."],
            [selN(10, selCrisis === "You inherited a family debt you must honor before moving on."),     "You inherited a family debt you must honor before moving on."],
          ],
        ),
        "",
        lpFooter,
      ];
    }

    case "lifepath_friends": {
      const friends   = lp.friends ?? (lp.friendHow ? [lp.friendHow] : []);
      const hasRolled = lp._friendCount !== undefined || lp.friendHow !== undefined;
      const rerollFooter = `  ${ARR}${val("+chargen/reroll friends")}  ${dim("·")}  ${val("+chargen/next")} ${dim("to accept")}`;

      if (hasRolled) {
        return [
          ...wrap("It is not all grim. You linked up with people who have your back.", W - 2),
          "",
          row("FRIENDS", val(String(friends.length))),
          ...(friends.length > 0 ? friends.map((f, i) => row(`  FRIEND ${i + 1}`, val(f))) : [dim("  -- none in this life.")]),
          div(),
          rerollFooter,
        ];
      }

      return [
        ...wrap("It is not all grim. Sometimes you link up with people who have your back. Roll 1d10 - 7 (min 0) for count -- all rolled at once.", W - 2),
        "",
        ...tbl(
          [{ label: "D10", width: 3 }, { label: "FRIEND'S RELATIONSHIP TO YOU", width: 66 }],
          [
            ["1",  "Like an older sibling to you."],
            ["2",  "Like a younger sibling to you."],
            ["3",  "A teacher or mentor."],
            ["4",  "A partner or coworker."],
            ["5",  "A former lover."],
            ["6",  "An old enemy -- complicated."],
            ["7",  "Like a parent to you."],
            ["8",  "An old childhood friend."],
            ["9",  "Someone you know from the Street."],
            ["10", "Someone with a common interest or goal."],
          ],
        ),
        "",
        `  ${ARR}${val("+chargen/roll")} ${dim("-- generate full bundle")}  ${dim("·")}  ${val("+chargen/next")}`,
      ];
    }

    case "lifepath_enemies": {
      const enemies   = lp.enemies ?? [];
      const hasRolled = lp._enemyCount !== undefined;
      const rerollFooter = `  ${ARR}${val("+chargen/reroll enemies")}  ${dim("·")}  ${val("+chargen/next")} ${dim("to accept")}`;

      if (hasRolled) {
        return [
          ...wrap("Enemies are a fact of life out here. They found you.", W - 2),
          "",
          row("ENEMIES", val(String(enemies.length))),
          ...(enemies.length > 0
            ? enemies.map((e, i) => [
                row(`  ENEMY ${i + 1}`, `${val(e.description)}  ${dim("|")}  ${dim(e.causeOfEnmity)}`),
                row("",                 `${dim("resources:")} ${dim(e.whatTheyHave)}`),
              ]).flat()
            : [dim("  -- none. Yet.")]),
          div(),
          rerollFooter,
        ];
      }

      return [
        ...wrap("Enemies are a fact of life out here. Roll 1d10 - 7 (min 0) for count -- all rolled at once.", W - 2),
        "",
        ...tbl(
          [{ label: "D10", width: 3 }, { label: "WHO", width: 20 }, { label: "CAUSE", width: 28 }, { label: "RESOURCES", width: 18 }],
          [
            ["1",  "Ex-friend",           "Loss of face or status.",      "Just themselves."],
            ["2",  "Ex-lover",            "Caused loss of loved one.",    "Themselves only."],
            ["3",  "Estranged relative",  "Major public humiliation.",    "Them + 1 friend."],
            ["4",  "Childhood enemy",     "Accused of cowardice.",        "Them + ~3 allies."],
            ["5",  "Someone you employ",  "Deserted or betrayed you.",    "Them + ~5 allies."],
            ["6",  "Your employer",       "Turned down job or romance.",  "A gang (~15)."],
            ["7",  "Partner/coworker",    "Do not like each other.",      "Local cops."],
            ["8",  "Corporate exec",      "Romantic rivalry.",            "Gang lord/sm. Corp."],
            ["9",  "Government official", "Business rivalry.",            "A powerful Corp."],
            ["10", "Boosterganger",       "Set up for a crime.",          "City/government."],
          ],
        ),
        "",
        `  ${ARR}${val("+chargen/roll")} ${dim("-- generate full bundle")}  ${dim("·")}  ${val("+chargen/next")}`,
      ];
    }

    case "lifepath_events": {
      const lifeEvents = lp.lifeEvents ?? [];
      return [
        ...wrap("Life in the Time of the Red leaves marks. What happened to you? Roll 1d10 for each significant event.", W - 2),
        ...(lifeEvents.length > 0
          ? ["", ...lifeEvents.map((e, i) => row(`EVENT ${i + 1}`, val(e.slice(0, 53)))), div()]
          : [""]),
        ...tbl(
          [{ label: "D10", width: 3 }, { label: "LIFE EVENT", width: 66 }],
          [
            ["1",  "You were imprisoned for a crime, guilty or not."],
            ["2",  "Your home was destroyed -- fire, disaster, or demolition."],
            ["3",  "You discovered something valuable and it made you enemies."],
            ["4",  "You ran with a gang for a while. It did not end well."],
            ["5",  "You crossed a corporation. They have not forgotten."],
            ["6",  "You lost everything on a deal gone bad."],
            ["7",  "You were cybered up against your will, or made a bad deal."],
            ["8",  "You were betrayed by someone you trusted completely."],
            ["9",  "You killed someone. It was necessary. Probably."],
            ["10", "You found something in the Ruins that changed everything."],
          ],
        ),
        "",
        lpFooter,
      ];
    }

    case "lifepath_role": {
      const role = (cpr.role ?? "solo").toLowerCase();
      const roleEvents = lp.roleEvents ?? [];
      const roleTable = ROLE_EVENTS[role] ?? ROLE_EVENTS.solo;
      return [
        ...wrap(`What made you the ${role.toUpperCase()} you are? Roll or pick one of these defining moments.`, W - 2),
        ...(roleEvents.length > 0
          ? ["", ...roleEvents.map((e, i) => row(`MOMENT ${i + 1}`, val(e.slice(0, 53)))), div()]
          : [""]),
        ...tbl(
          [{ label: "D6", width: 2 }, { label: "DEFINING MOMENT", width: 67 }],
          roleTable.slice(1).map((text, i) => [selN(i + 1, roleEvents.includes(text)), text]),
        ),
        "",
        lpFooter,
      ];
    }

    case "stats": {
      const statKeys = ["int","ref","dex","tech","cool","will","luck","move","body","emp"];
      return cpr.chargenMethod === "complete"
        ? [
          `  ${ARR}Allocate stat points.`,
          row("POOL",  `${val(`${cpr.chargenStatPool ?? 0}`)} ${dim("points remaining")}`),
          row("RANGE", `${acc("2")} min  ${dim("/")}  ${acc("8")} max per stat`),
          "",
          `    ${val("+chargen/stat <stat>=<value>")}`,
          `    ${val("+chargen/stat confirm")}  ${dim("-- lock in stats, proceed to skills")}`,
          "",
          `  ${dim("Stats:")}`,
          ...grid(statKeys.map(acc), 5, "    "),
        ]
        : [
          `  ${ARR}Stats preset by ${acc("streetrat")} template.`,
          row("ROLE", val(cpr.role?.toUpperCase() ?? "--")),
          "",
          `    ${val("+chargen/stat confirm")}  ${dim("-- accept stats and proceed to skills")}`,
        ];
    }

    case "skills":
      return [
        `  ${ARR}Allocate career skill points.`,
        row("CAREER POOL", `${val(`${cpr.chargenSkillPool ?? 0}`)} ${dim("points remaining")}`),
        "",
        `    ${val("+chargen/skill <skill>=<value>")}`,
        `    ${val("+chargen/next")}  ${dim("-- done with skills")}`,
        "",
        `  ${dim("Type")} ${val("+skills")} ${dim("to browse all available skills.")}`,
      ];

    case "cyberware":
      return [
        `  ${ARR}Install starting chrome.`,
        ...wrap("Browse available cyberware and install up to your humanity budget. Skip with /next if you want to stay pure meat.", W - 4, "    "),
        "",
        `    ${val("+chargen/chrome list")}           ${dim("-- browse available chrome")}`,
        `    ${val("+chargen/chrome <name>")}         ${dim("-- install a piece of chrome")}`,
        `    ${val("+chargen/chrome remove <name>")}  ${dim("-- remove before finalizing")}`,
        `    ${val("+chargen/next")}                  ${dim("-- done with chrome")}`,
        "",
        row("EMP",       val(`${cpr.stats?.emp ?? 6}`)),
        row("HUMANITY",  `${val(`${(cpr.stats?.emp ?? 6) * 10}`)} ${dim("/ 60 max")} ${dim("(HL 0 so far)")}`),
      ];

    case "equipment":
      return [
        `  ${ARR}Gear up.`,
        ...wrap(
          "Streetrat/Edgerunner: Role kit is free; spend pocket 500eb. " +
            "Complete: buy from your 2,550eb budget. Skip with /next if done.",
          W - 4,
          "    ",
        ),
        "",
        `    ${val("+chargen/gear list")}           ${dim("-- browse available gear")}`,
        `    ${val("+chargen/gear <name>")}         ${dim("-- add item to loadout")}`,
        `    ${val("+chargen/gear remove <name>")}  ${dim("-- drop an item")}`,
        `    ${val("+chargen/next")}                ${dim("-- done with gear")}`,
        "",
        row("EDDIES", val(`${(cpr.eurodollars ?? 0).toLocaleString()} eb`)),
      ];

    case "lifestyle": {
      const tiers = ["kibble","streetrat","good_prepak","moderate","corporate","luxury"];
      return [
        `  ${ARR}Choose your lifestyle tier.`,
        ...wrap(
          "Tier sets monthly rent/food. First month free. " +
            "Does not change your starting EB.",
          W - 4,
          "    ",
        ),
        "",
        `    ${val("+chargen/lifestyle <tier>")}`,
        "",
        `  ${dim("Tiers:")}`,
        ...grid(tiers.map(acc), 3, "    "),
      ];
    }

    case "review":
      return [
        `  ${ARR}Your character is ready for review.`,
        "",
        `    ${val("+sheet")}         ${dim("-- preview your full sheet")}`,
        `    ${val("+chargen/done")}  ${dim("-- finalize and enter Night City")}`,
      ];

    default:
      return [`  ${ARR}Type ${val("+chargen/done")} to complete.`];
  }
}

// --- stageRollResult ---------------------------------------------------------

function rollCultural(n: number): { lines: string[]; patch: Partial<ILifepath> } {
  const [region, langs] = CULTURAL_TABLE[n] ?? ["", ""];
  const firstLang = langs.split(",")[0].trim();
  return {
    patch: { culturalOrigin: region, language: firstLang },
    lines: [
      row("REGION",    val(region)),
      ...rowWrap("LANGUAGES", dim(langs)),
      "",
      ...wrap("Your native language starts at Rank 4.", W - 2),
    ],
  };
}

function rollPersonality(n: number): { lines: string[]; patch: Partial<ILifepath> } {
  const [personality, clothingStyle, hairstyle] = PERSONALITY_TABLE[n] ?? ["", "", ""];
  return {
    patch: { personality, clothingStyle, hairstyle },
    lines: [
      row("PERSONALITY", val(personality)),
      row("STYLE",       val(clothingStyle)),
      row("HAIR",        val(hairstyle)),
    ],
  };
}

function rollMotivations(n: number): { lines: string[]; patch: Partial<ILifepath> } {
  const [lifeGoal, feelingAboutPeople] = LIFE_GOAL_TABLE[n] ?? ["", ""];
  const n2 = Math.ceil(Math.random() * 10);
  const [mostValuableThing, mostValuablePerson, whatYouValue] = VALUES_TABLE[n2] ?? ["", "", ""];
  return {
    patch: { lifeGoal, feelingAboutPeople, mostValuableThing, mostValuablePerson, whatYouValue },
    lines: [
      dim(`  Table 1 roll: ${n}  /  Table 2 roll: ${n2}`),
      "",
      row("LIFE GOAL",        val(lifeGoal)),
      row("FEEL ABOUT PEOPLE",val(feelingAboutPeople)),
      "",
      row("MOST VALUED THING", val(mostValuableThing)),
      row("MOST VALUED PERSON",val(mostValuablePerson)),
      row("WHAT YOU VALUE",    val(whatYouValue)),
    ],
  };
}

function rollFamily(n: number, rollCrisis = false): { lines: string[]; patch: Partial<ILifepath> } {
  if (rollCrisis) {
    const crisis = FAMILY_CRISIS_TABLE[n] ?? "";
    return {
      patch: { familyCrisis: crisis },
      lines: [...rowWrap("FAMILY CRISIS", val(crisis))],
    };
  }
  const [familyBackground, childhoodEnvironment] = FAMILY_TABLE[n] ?? ["", ""];
  return {
    patch: { familyBackground, childhoodEnvironment },
    lines: [
      row("BACKGROUND",   val(familyBackground)),
      row("CHILDHOOD ENV",val(childhoodEnvironment)),
    ],
  };
}

function rollFriend(n: number): { lines: string[]; patch: Partial<ILifepath> } {
  const how = FRIEND_TABLE[n] ?? "";
  return {
    patch: { friendHow: how },
    lines: [
      row("RELATIONSHIP", val(how)),
      "",
      ...wrap("Use +bg to name this ally and write how you met.", W - 2),
    ],
  };
}

function rollEnemy(n: number): { lines: string[]; patch: Partial<ILifepath> } {
  const who       = ENEMY_WHO_TABLE[n] ?? "";
  const causeN    = Math.ceil(Math.random() * 10);
  const resourceN = Math.ceil(Math.random() * 10);
  const cause     = ENEMY_CAUSE_TABLE[causeN]     ?? "";
  const resources = ENEMY_RESOURCES_TABLE[resourceN] ?? "";
  const entry = { description: who, causeOfEnmity: cause, whatTheyHave: resources, numPeople: 1 };
  return {
    patch: { enemies: [entry] } as Partial<ILifepath>,
    lines: [
      row("WHO",       val(who)),
      row("CAUSE",     val(cause)),
      ...wrap(`RESOURCES  ${resources}`, W - 2),
    ],
  };
}

function rollEvent(n: number): { lines: string[]; patch: Partial<ILifepath> } {
  const event = LIFE_EVENTS_TABLE[n] ?? "";
  return {
    patch: { lifeEvents: [event] } as Partial<ILifepath>,
    lines: [
      ...wrap(val(event), W - 2),
      "",
      ...wrap("Use +bg to develop the details.", W - 2),
    ],
  };
}

function rollRoleEvent(n: number, role = "solo"): { lines: string[]; patch: Partial<ILifepath> } {
  const table  = ROLE_EVENTS[role] ?? ROLE_EVENTS.solo;
  const event  = table[n] ?? "";
  return {
    patch: { roleEvents: [event] } as Partial<ILifepath>,
    lines: [...wrap(val(event), W - 2)],
  };
}

/**
 * Given a stage, a die roll, and optional role, return formatted display lines
 * and the ILifepath fields to patch for this roll.
 */
export function stageRollResult(
  stage: ChargenStage,
  n: number,
  role?: string,
  rollCrisis?: boolean,
): { lines: string[]; patch: Partial<ILifepath> } {
  switch (stage) {
    case "lifepath_cultural":     return rollCultural(n);
    case "lifepath_personality":  return rollPersonality(n);
    case "lifepath_motivations":  return rollMotivations(n);
    case "lifepath_family":       return rollFamily(n, rollCrisis);
    case "lifepath_friends":      return rollFriend(n);
    case "lifepath_enemies":      return rollEnemy(n);
    case "lifepath_events":       return rollEvent(n);
    case "lifepath_role":         return rollRoleEvent(n, role);
    default:
      return { lines: [`  ${ERR}No roll table for this stage.`], patch: {} };
  }
}

// --- stageDetailLines --------------------------------------------------------

function detailCultural(n: number): string[] {
  const [region, langs] = CULTURAL_TABLE[n] ?? ["", ""];
  return [
    div(),
    `  ${lbl(`LIFEPATH CULTURAL ORIGIN -- ENTRY ${n}`)}`,
    div(),
    "",
    row("REGION",    val(region)),
    row("LANGUAGES", dim(langs)),
    "",
    ...wrap("Your native language starts at Rank 4.", W - 2),
    div(),
    `  ${dim("+chargen/detail <1-10> for another entry")}`,
  ];
}

function detailPersonality(n: number): string[] {
  const [personality, clothingStyle, hairstyle] = PERSONALITY_TABLE[n] ?? ["", "", ""];
  return [
    div(),
    `  ${lbl(`LIFEPATH PERSONALITY -- ENTRY ${n}`)}`,
    div(),
    "",
    row("PERSONALITY", val(personality)),
    row("STYLE",       val(clothingStyle)),
    row("HAIR",        val(hairstyle)),
    div(),
    `  ${dim("+chargen/detail <1-10> for another entry")}`,
  ];
}

function detailMotivations(n: number): string[] {
  const [lifeGoal, feelingAboutPeople] = LIFE_GOAL_TABLE[n] ?? ["", ""];
  const [thing, person, value]         = VALUES_TABLE[n]     ?? ["", "", ""];
  return [
    div(),
    `  ${lbl(`LIFEPATH MOTIVATIONS -- ENTRY ${n}`)}`,
    div(),
    "",
    row("LIFE GOAL",         val(lifeGoal)),
    row("FEEL ABOUT PEOPLE", val(feelingAboutPeople)),
    "",
    row("MOST VALUED THING", val(thing)),
    row("MOST VALUED PERSON",val(person)),
    row("WHAT YOU VALUE",    val(value)),
    div(),
    `  ${dim("+chargen/detail <1-10> for another entry")}`,
  ];
}

function detailFamily(n: number): string[] {
  const [background, env] = FAMILY_TABLE[n]       ?? ["", ""];
  const crisis            = FAMILY_CRISIS_TABLE[n] ?? "";
  return [
    div(),
    `  ${lbl(`LIFEPATH FAMILY -- ENTRY ${n}`)}`,
    div(),
    "",
    row("BACKGROUND",        val(background)),
    ...rowWrap("CHILDHOOD ENV", val(env)),
    ...rowWrap("FAMILY CRISIS", val(crisis)),
    div(),
    `  ${dim("+chargen/detail <1-10> for another entry")}`,
  ];
}

function detailEnemy(n: number): string[] {
  const who       = ENEMY_WHO_TABLE[n]       ?? "";
  const cause     = ENEMY_CAUSE_TABLE[n]     ?? "";
  const resources = ENEMY_RESOURCES_TABLE[n] ?? "";
  return [
    div(),
    `  ${lbl(`LIFEPATH ENEMIES -- ENTRY ${n}`)}`,
    div(),
    "",
    row("WHO",   val(who)),
    row("CAUSE", val(cause)),
    ...wrap(`RESOURCES  ${resources}`, W - 2),
    div(),
    `  ${dim("+chargen/detail <1-10> for another entry")}`,
  ];
}

function detailEvent(n: number): string[] {
  const event = LIFE_EVENTS_TABLE[n] ?? "";
  return [
    div(),
    `  ${lbl(`LIFEPATH EVENTS -- ENTRY ${n}`)}`,
    div(),
    "",
    ...wrap(event, W - 2),
    div(),
    `  ${dim("+chargen/detail <1-10> for another entry")}`,
  ];
}

function detailRoleEvent(n: number, role = "solo"): string[] {
  const table = ROLE_EVENTS[role] ?? ROLE_EVENTS.solo;
  const event = table[n] ?? "";
  return [
    div(),
    `  ${lbl(`ROLE EVENTS (${role.toUpperCase()}) -- ENTRY ${n}`)}`,
    div(),
    "",
    ...wrap(event, W - 2),
    div(),
    `  ${dim("+chargen/detail <1-6> for another entry")}`,
  ];
}

/**
 * Read-only lookup -- returns formatted display lines with full text and
 * mechanical notes for the given stage/entry. No patch returned.
 */
export function stageDetailLines(stage: ChargenStage, n: number, role?: string): string[] {
  switch (stage) {
    case "lifepath_cultural":     return detailCultural(n);
    case "lifepath_personality":  return detailPersonality(n);
    case "lifepath_motivations":  return detailMotivations(n);
    case "lifepath_family":       return detailFamily(n);
    case "lifepath_friends": {
      const how = FRIEND_TABLE[n] ?? "";
      return [
        div(),
        `  ${lbl(`LIFEPATH FRIENDS -- ENTRY ${n}`)}`,
        div(),
        "",
        row("RELATIONSHIP", val(how)),
        div(),
        `  ${dim("+chargen/detail <1-10> for another entry")}`,
      ];
    }
    case "lifepath_enemies":      return detailEnemy(n);
    case "lifepath_events":       return detailEvent(n);
    case "lifepath_role":         return detailRoleEvent(n, role);
    default:
      return [`  ${ERR}No detail table for this stage.`];
  }
}

// --- Advance lifepath stage --------------------------------------------------

async function advanceLifepathStage(u: IUrsamuSDK, cpr: ICPRCharacter): Promise<void> {
  const stage = cpr.chargenStage ?? "method";
  const nextableStages = ["skills", "cyberware", "equipment"];
  if (!stage.startsWith("lifepath_") && !nextableStages.includes(stage)) {
    u.send(`${ERR}Use ${val("+chargen/next")} only during lifepath, skill, chrome, or gear stages.`);
    return;
  }
  const next = nextChargenStage(stage);
  const nextCpr = { ...cpr, chargenStage: next };
  await u.db.modify(u.me.id, "$set", { "state.cpr.chargenStage": next });

  u.send([
    ...stageHeader(nextCpr),
    ...stagePromptLines(nextCpr, next),
    bar(),
  ].join("\r\n"));
}
