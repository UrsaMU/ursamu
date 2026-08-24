/**
 * HTML character sheet for web /play (+sheet).
 * In-line and compact — deep browse lives on /chargen.
 * Classes: packages/site/public/css/cpr-sheet.css
 */
import type { ICPRCharacter, WoundState } from "../../db/schemas.ts";
import { SKILLS, skillDisplayName } from "../../data/skills.ts";
import { getRole } from "../../data/roles.ts";
import { LIFESTYLES } from "../../data/lifestyles.ts";
import { ensureStunPool, isUnconscious } from "../../engine/stun.ts";
import { cyberpsychosisSeverity } from "../../engine/cyberpsychosis.ts";
import {
  totalDeathSavePenalty,
  woundActionPenalty,
  woundMovePenalty,
} from "../../engine/character.ts";

const SKILL_STAT: Record<string, string> = Object.fromEntries(
  SKILLS.map((s) => [s.name, s.stat.toUpperCase()]),
);

export type SheetView =
  | "overview"
  | "stats"
  | "skills"
  | "cyber"
  | "gear"
  | "combat"
  | "economy";

const STAT_KEYS = [
  "int",
  "ref",
  "dex",
  "tech",
  "cool",
  "will",
  "luck",
  "move",
  "body",
  "emp",
] as const;

function esc(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Letter → hex (matches play.js / play-palette.css). */
const FG: Record<string, string> = {
  x: "000000",
  r: "ff0000",
  g: "00cc00",
  y: "ffff00",
  b: "0000ff",
  m: "ff00ff",
  c: "00ffff",
  w: "ffffff",
};

/**
 * MUSH %c / moniker `<#rrggbb>` → spans (play-palette.css).
 */
export function mushToHtml(raw: string): string {
  if (raw == null || raw === "") return "";
  let s = String(raw)
    .replace(/%r/gi, "\n")
    .replace(/%t/gi, "\t")
    .replace(/%b/gi, " ");

  type Sty = {
    color?: string;
    bold?: boolean;
    underline?: boolean;
    italic?: boolean;
  };
  let style: Sty = {};
  const parts: string[] = [];
  let buf = "";

  const flush = () => {
    if (!buf) return;
    const text = esc(buf);
    buf = "";
    const cls = ["mush-text"];
    if (style.color) cls.push("mush-fg-" + style.color);
    if (style.bold) cls.push("mush-bold");
    if (style.underline) cls.push("mush-u");
    if (style.italic) cls.push("mush-i");
    if (cls.length > 1) {
      parts.push(
        `<span class="${cls.join(" ")}">${text}</span>`,
      );
    } else {
      parts.push(text);
    }
  };

  // %ch bold, %cn reset, %cr…%cw, %c<#rrggbb>, <#rrggbb>
  const re =
    /%c([nNrRgGyYbBmMcCwWxXhHuUiI])|%c<#([0-9a-fA-F]{6})>|<#([0-9a-fA-F]{6})>/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    if (m.index > last) {
      buf += s.slice(last, m.index);
      flush();
    }
    last = m.index + m[0].length;
    flush();
    if (m[2] || m[3]) {
      const hx = (m[2] || m[3] || "").toLowerCase();
      if (/^[0-9a-f]{6}$/.test(hx)) {
        style = { ...style, color: hx };
      }
      continue;
    }
    const code = String(m[1] || "").toLowerCase();
    if (code === "n") {
      style = {};
      continue;
    }
    if (code === "h") {
      style = { ...style, bold: true };
      continue;
    }
    if (code === "u") {
      style = { ...style, underline: true };
      continue;
    }
    if (code === "i") {
      style = { ...style, italic: true };
      continue;
    }
    if (FG[code]) style = { ...style, color: FG[code] };
  }
  if (last < s.length) {
    buf += s.slice(last);
    flush();
  }
  return parts.join("")
    .replace(/%c[a-z]/gi, "")
    .replace(/%x[a-z]/gi, "");
}

/** Plain text moniker (no codes) for attrs / chips. */
export function stripMoniker(raw: string): string {
  return String(raw ?? "")
    .replace(/%c<#([0-9a-fA-F]{6})>/gi, "")
    .replace(/<#([0-9a-fA-F]{6})>/g, "")
    .replace(/%c[a-z]/gi, "")
    .replace(/%[rntb]/gi, "")
    .trim();
}

function titleCase(s: string): string {
  return String(s || "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function gearFmtEb(n: number): string {
  const v = Math.floor(Number(n) || 0);
  return v.toLocaleString("en-US") + " eb";
}

function woundClass(ws: string): string {
  const w = String(ws || "healthy").toLowerCase();
  if (w === "healthy") return "is-ok";
  if (w === "lightly") return "is-warn";
  if (w === "seriously" || w === "mortally") return "is-crit";
  if (w === "dead") return "is-dead";
  return "";
}

function barTone(cur: number, max: number, kind: string): string {
  if (max <= 0) return "";
  const r = cur / max;
  if (kind === "hp" || kind === "stun") {
    if (r <= 0.25) return "is-crit";
    if (r <= 0.5) return "is-warn";
  }
  if (kind === "emp") {
    if (r <= 0.3) return "is-crit";
    if (r <= 0.5) return "is-warn";
  }
  return "";
}

function vitalBar(cur: number, max: number, kind: string): string {
  const m = Math.max(0, Math.floor(max));
  const c = Math.max(0, Math.min(m, Math.floor(cur)));
  if (m <= 0) {
    return '<span class="cpr-vbar cpr-vbar--empty">—</span>';
  }
  const segs = Math.min(20, m);
  const on = Math.round((c / m) * segs);
  const tone = barTone(c, m, kind);
  let html =
    '<div class="cpr-vbar cpr-vbar--' + esc(kind) +
    (tone ? " " + tone : "") +
    '"><div class="cpr-vbar__track" aria-hidden="true">';
  for (let i = 0; i < segs; i++) {
    html +=
      '<span class="cpr-vbar__seg' +
      (i < on ? " is-on" : "") +
      '"></span>';
  }
  html +=
    '</div><span class="cpr-vbar__num">' +
    esc(String(c)) + "/" + esc(String(m)) +
    "</span></div>";
  return html;
}

function armorRow(
  label: string,
  arm: { name: string; sp: number; currentSp: number } | null,
): string {
  if (!arm || !arm.name) {
    return (
      '<div class="cpr-live__arm cpr-live__arm--empty">' +
      '<span class="cpr-live__vlbl">' + esc(label) +
      '</span><span class="muted">no armor</span></div>'
    );
  }
  return (
    '<div class="cpr-live__arm">' +
    '<span class="cpr-live__vlbl">' + esc(label) + "</span>" +
    '<span class="cpr-live__arm-name">' +
    esc(titleCase(arm.name)) + "</span>" +
    vitalBar(
      arm.currentSp != null ? arm.currentSp : arm.sp,
      arm.sp,
      "sp",
    ) +
    "</div>"
  );
}

/** Build +sheet[/view] [target] for play-cmd chips. */
export function sheetCmd(
  view: SheetView,
  targetArg = "",
): string {
  const t = String(targetArg || "").trim();
  const tail = t ? " " + t : "";
  if (view === "overview") return "+sheet" + tail;
  return "+sheet/" + view + tail;
}

function normalizeView(raw: string | undefined): SheetView {
  const v = String(raw || "overview").toLowerCase().trim();
  if (v === "full" || v === "" || v === "overview") return "overview";
  if (
    v === "stats" || v === "skills" || v === "cyber" ||
    v === "chrome" || v === "gear" || v === "combat" ||
    v === "economy"
  ) {
    if (v === "chrome") return "cyber";
    return v as SheetView;
  }
  return "overview";
}

/** Compact chip row — stays in the chat flow, not a side rail. */
function chipRow(view: SheetView, targetArg: string): string {
  const items: Array<{ id: SheetView; label: string }> = [
    { id: "overview", label: "Full" },
    { id: "stats", label: "Stats" },
    { id: "skills", label: "Skills" },
    { id: "cyber", label: "Chrome" },
    { id: "gear", label: "Gear" },
    { id: "combat", label: "Combat" },
    { id: "economy", label: "Economy" },
  ];
  let html =
    '<div class="cpr-sheet__chips" role="navigation" ' +
    'aria-label="Sheet sections">';
  for (const it of items) {
    const cur = it.id === view;
    const cmd = sheetCmd(it.id, targetArg);
    html +=
      '<button type="button" class="cpr-sheet__chip' +
      (cur ? " is-current" : "") +
      '" data-play-cmd="' + esc(cmd) + '"' +
      (cur ? ' aria-current="page"' : "") +
      ' title="' + esc(cmd) + '">' +
      esc(it.label) +
      "</button>";
  }
  html += "</div>";
  return html;
}

export function buildVitalsHtml(cpr: ICPRCharacter): string {
  const s = cpr.stats;
  const stunChar = ensureStunPool(cpr);
  const stunCur = stunChar.stun!.current;
  const stunMax = stunChar.stun!.max;
  const ko = isUnconscious(stunChar);
  const empBase = s.empBase != null ? s.empBase : s.emp;
  const empCur = s.emp != null ? s.emp : empBase;
  const luckCur = cpr.luckRemaining != null
    ? cpr.luckRemaining
    : s.luck;
  const luckMax = s.luck != null ? s.luck : luckCur;
  const hl = cpr.humanityLoss != null ? cpr.humanityLoss : 0;
  const eb = cpr.eurodollars != null ? cpr.eurodollars : 0;
  const wound = String(cpr.woundState || "healthy") as WoundState;
  const sw = cpr.swThreshold != null
    ? cpr.swThreshold
    : Math.ceil((cpr.hp?.max ?? 0) / 2);
  const sev = cyberpsychosisSeverity(empCur, empBase, hl);

  let html =
    '<section class="cpr-live__block cpr-live__block--vitals" ' +
    'aria-label="Vitals">' +
    '<div class="cpr-live__vitals">' +
    '<div class="cpr-live__vrow">' +
    '<span class="cpr-live__vlbl">HP</span>' +
    vitalBar(cpr.hp.current, cpr.hp.max, "hp") +
    "</div>" +
    '<div class="cpr-live__vrow">' +
    '<span class="cpr-live__vlbl">Stun</span>' +
    vitalBar(stunCur, stunMax, "stun") +
    (ko
      ? ' <span class="cpr-badge cpr-badge--wound is-crit">KO</span>'
      : "") +
    "</div>" +
    '<div class="cpr-live__vrow">' +
    '<span class="cpr-live__vlbl">EMP</span>' +
    vitalBar(empCur, empBase || 1, "emp") +
    "</div>" +
    '<div class="cpr-live__vrow">' +
    '<span class="cpr-live__vlbl">Luck</span>' +
    vitalBar(luckCur, luckMax || 1, "luck") +
    "</div>" +
    '<div class="cpr-live__badges">' +
    '<span class="cpr-badge cpr-badge--wound ' +
    woundClass(wound) + '">' +
    esc(wound.toUpperCase()) +
    "</span>" +
    '<span class="cpr-badge">SW ' + esc(String(sw)) +
    "</span>" +
    '<span class="cpr-badge">DEATH ' +
    esc(String(
      (cpr.deathSave ?? 0) - totalDeathSavePenalty(cpr),
    )) +
    "</span>" +
    '<span class="cpr-badge">HL ' + esc(String(hl)) +
    "</span>" +
    '<span class="cpr-badge">EB ' +
    esc(gearFmtEb(eb)) +
    "</span>";
  if (sev !== "none" && sev !== "mild") {
    html +=
      '<span class="cpr-badge cpr-badge--wound is-crit">' +
      esc(sev.toUpperCase()) +
      "</span>";
  }
  html += "</div>";
  html += '<div class="cpr-live__armor">';
  html += armorRow("Body", cpr.armorBody);
  html += armorRow("Head", cpr.armorHead);
  html += "</div></div></section>";
  return html;
}

/**
 * +score body HTML — combat strip / vitals panel.
 * Matches chargen right-rail vitals (HP, stun, EMP, luck, armor).
 */
export function buildScoreWebHtml(
  playerName: string,
  cpr: ICPRCharacter,
): string {
  const role = getRole(cpr.role);
  const roleName = role?.displayName || titleCase(cpr.role || "");
  const rank = cpr.roleRank != null ? cpr.roleRank : 4;
  const approved = !!(
    cpr.chargenComplete || cpr.chargenStatus === "approved"
  );
  const nameHtml = mushToHtml(playerName || "Runner") ||
    esc(stripMoniker(playerName || "Runner") || "Runner");

  return (
    '<div class="cpr-sheet cpr-sheet--score cpr-live" ' +
    'data-cpr-score>' +
    '<header class="cpr-live__id cpr-score__head">' +
    '<p class="cpr-live__hint muted">Vitals</p>' +
    '<p class="cpr-live__name">' +
    esc(roleName) +
    "</p>" +
    '<p class="cpr-live__meta">' +
    "Rank " + esc(String(rank)) +
    (approved
      ? ' · <span class="cpr-live__ok">Approved</span>'
      : "") +
    "</p>" +
    '<p class="cpr-score__who muted">' + nameHtml +
    "</p>" +
    "</header>" +
    buildVitalsHtml(cpr) +
    '<p class="cpr-sheet__foot muted">' +
    "<code>+sheet</code> full · " +
    "<code>+sheet/combat</code> detail</p>" +
    "</div>"
  );
}

/** Layout bag for u.ui.layout — same shape as +sheet. */
export function buildScoreWebLayout(
  playerName: string,
  cpr: ICPRCharacter,
): {
  components: Record<string, unknown>[];
  meta: Record<string, unknown>;
} {
  return {
    components: [
      {
        type: "html",
        content: buildScoreWebHtml(playerName, cpr),
      },
    ],
    meta: {
      type: "cpr-score",
      system: "cpr",
      view: "score",
      role: cpr.role,
      className: "play-layout--cpr-score",
    },
  };
}

function headerHtml(
  playerName: string,
  cpr: ICPRCharacter,
): string {
  const role = getRole(cpr.role);
  const roleName = role?.displayName || titleCase(cpr.role || "");
  const rank = cpr.roleRank != null ? cpr.roleRank : 4;
  const ls = LIFESTYLES.find((l) => l.name === cpr.lifestyle?.tier);
  // Moniker may include <#rrggbb> / %c codes — render, don't esc raw
  const nameHtml = mushToHtml(playerName || "Runner") ||
    esc(stripMoniker(playerName || "Runner") || "Runner");
  return (
    '<header class="cpr-live__id">' +
    '<p class="cpr-live__name">' +
    nameHtml +
    ' <span class="cpr-live__rank">' +
    esc(roleName) + " r" + esc(String(rank)) +
    "</span></p>" +
    '<p class="cpr-live__meta">' +
    esc(titleCase(cpr.chargenMethod || "")) +
    " · " +
    esc(ls?.displayName || "no lifestyle") +
    ' · <span class="cpr-live__ok">REP ' +
    esc(String(cpr.reputation ?? 0)) +
    "</span></p>" +
    "</header>"
  );
}

function block(title: string, body: string, label?: string): string {
  return (
    '<section class="cpr-live__block" aria-label="' +
    esc(label || title) + '">' +
    '<h3 class="cpr-live__h">' + esc(title) + "</h3>" +
    body +
    "</section>"
  );
}

function skillMeter(rank: number): string {
  const r = Math.max(0, Math.min(10, Math.floor(rank) || 0));
  let html =
    '<span class="cpr-skill-meter" aria-hidden="true" ' +
    'data-rank="' + esc(String(r)) + '">';
  for (let i = 0; i < 10; i++) {
    html +=
      '<span class="cpr-skill-meter__seg' +
      (i < r ? " is-on" : "") +
      '"></span>';
  }
  return html + "</span>";
}

function skillRow(name: string, rank: number): string {
  const r = Number(rank) || 0;
  const stat = SKILL_STAT[name] || "";
  const cls = [
    "cpr-skill",
    r >= 6 ? "is-hot" : "",
    r <= 0 ? "is-empty" : "",
  ].filter(Boolean).join(" ");

  const badges = stat
    ? '<span class="cpr-skill__stat">' + esc(stat) + "</span>"
    : "";

  return (
    '<li class="' + cls + '" data-skill="' + esc(name) + '">' +
    '<div class="cpr-skill__top">' +
    '<span class="cpr-skill__name">' +
    esc(skillDisplayName(name)) + "</span>" +
    '<span class="cpr-skill__badges">' + badges + "</span>" +
    '<strong class="cpr-skill__rank">' + esc(String(r)) +
    "</strong></div>" +
    skillMeter(r) +
    "</li>"
  );
}

/** Inventory side meter (HL / SP). */
function invMeter(n: number, max = 10, kind = ""): string {
  const m = Math.max(1, max);
  const v = Math.max(0, Math.min(m, Math.floor(Number(n)) || 0));
  const segs = 10;
  const on = Math.round((v / m) * segs);
  let html =
    '<span class="cpr-inv__meter' +
    (kind ? " cpr-inv__meter--" + kind : "") +
    '" aria-hidden="true">';
  for (let i = 0; i < segs; i++) {
    html +=
      '<span class="cpr-inv__meter-seg' +
      (i < on ? " is-on" : "") +
      '"></span>';
  }
  return html + "</span>";
}

function invStatus(
  label: string,
  value: string,
  barPct?: number,
  barKind?: string,
): string {
  let html =
    '<div class="cpr-inv-status__cell">' +
    '<span class="cpr-inv-status__lbl">' + esc(label) +
    "</span>" +
    '<span class="cpr-inv-status__val">' + value + "</span>";
  if (barPct != null) {
    html +=
      '<div class="cpr-inv-status__bar">' +
      '<div class="cpr-inv-status__fill' +
      (barKind ? " cpr-inv-status__fill--" + barKind : "") +
      '" style="width:' +
      Math.max(0, Math.min(100, Math.round(barPct))) +
      '%"></div></div>';
  }
  return html + "</div>";
}

/** Mini fill under each stat tile (0–10 scale). */
function statMeter(n: number, max = 10): string {
  const m = Math.max(1, max);
  const v = Math.max(0, Math.min(m, Math.floor(n) || 0));
  const segs = 10;
  const on = Math.round((v / m) * segs);
  let html = '<span class="cpr-stat-meter" aria-hidden="true">';
  for (let i = 0; i < segs; i++) {
    html +=
      '<span class="cpr-stat-meter__seg' +
      (i < on ? " is-on" : "") +
      '"></span>';
  }
  return html + "</span>";
}

function statTileHtml(
  k: string,
  s: ICPRCharacter["stats"],
): string {
  if (k === "emp") {
    const cur = s.emp != null ? Number(s.emp) : 0;
    const base = s.empBase != null ? Number(s.empBase) : cur;
    const display = `${s.emp ?? "—"}/${s.empBase ?? "—"}`;
    return (
      '<li class="cpr-stat cpr-stat--emp" data-stat="emp">' +
      '<span class="cpr-stat__lbl">EMP</span>' +
      '<strong class="cpr-stat__val">' + esc(display) +
      "</strong>" +
      statMeter(cur, Math.max(base || 10, 1)) +
      "</li>"
    );
  }
  const raw = s[k as keyof typeof s];
  const n = raw != null ? Number(raw) : NaN;
  const display = Number.isFinite(n) ? String(n) : "—";
  const meterN = Number.isFinite(n) ? n : 0;
  const hot = Number.isFinite(n) && n >= 8 ? " is-hot" : "";
  return (
    '<li class="cpr-stat' + hot + '" data-stat="' + esc(k) +
    '">' +
    '<span class="cpr-stat__lbl">' + esc(k.toUpperCase()) +
    "</span>" +
    '<strong class="cpr-stat__val">' + esc(display) +
    "</strong>" +
    statMeter(meterN) +
    "</li>"
  );
}

/** Default +sheet: identity, stats strip, street chips, vitals. */
function overviewBody(cpr: ICPRCharacter): string {
  const s = cpr.stats || ({} as ICPRCharacter["stats"]);
  const role = getRole(cpr.role);
  const roleName = role?.displayName || titleCase(cpr.role || "");
  const rank = cpr.roleRank != null ? cpr.roleRank : 4;
  const ls = LIFESTYLES.find((l) => l.name === cpr.lifestyle?.tier);
  const chromeN = (cpr.cyberware || []).length;

  let list = '<ul class="cpr-live__stats">';
  for (const k of STAT_KEYS) {
    list += statTileHtml(k, s);
  }
  list += "</ul>";

  let html = block("Stats", list);
  html +=
    '<ul class="cpr-sheet__street" aria-label="Street">' +
    '<li class="cpr-sheet__street-chip"><em>Role</em> ' +
    "<strong>" + esc(roleName) + " r" + esc(String(rank)) +
    "</strong></li>" +
    '<li class="cpr-sheet__street-chip"><em>EB</em> ' +
    "<strong>" + esc(gearFmtEb(cpr.eurodollars ?? 0)) +
    "</strong></li>" +
    '<li class="cpr-sheet__street-chip"><em>Life</em> ' +
    "<strong>" + esc(ls?.displayName ?? "none") +
    "</strong></li>" +
    '<li class="cpr-sheet__street-chip"><em>Chrome</em> ' +
    "<strong>" + esc(String(chromeN)) +
    "</strong></li>" +
    '<li class="cpr-sheet__street-chip"><em>Luck</em> ' +
    "<strong>" +
    esc(String(cpr.luckRemaining ?? s.luck ?? 0)) +
    "/" + esc(String(s.luck ?? 0)) +
    "</strong></li></ul>";
  html += buildVitalsHtml(cpr);
  return html;
}

function statsBody(cpr: ICPRCharacter): string {
  const s = cpr.stats || ({} as ICPRCharacter["stats"]);
  const dsPen = totalDeathSavePenalty(cpr);
  let list = '<ul class="cpr-live__stats">';
  for (const k of STAT_KEYS) {
    list += statTileHtml(k, s);
  }
  list += "</ul>";
  if (s.luck != null) {
    list +=
      '<ul class="cpr-facts cpr-sheet__list-gap">' +
      '<li class="is-accent"><span>Luck pool</span><strong>' +
      esc(String(cpr.luckRemaining ?? s.luck)) +
      " / " + esc(String(s.luck)) +
      "</strong></li>" +
      "<li><span>Death save</span><strong>" +
      esc(String((cpr.deathSave ?? 0) - dsPen)) +
      "</strong></li>" +
      "<li><span>Base / penalty</span><strong>" +
      esc(String(cpr.deathSave ?? 0)) + " / −" +
      esc(String(dsPen)) +
      "</strong></li></ul>";
  }
  return block("Stats", list);
}

/** Full skill catalog — every skill, rank 0 if untrained. */
function skillsBody(cpr: ICPRCharacter): string {
  const sk = cpr.skills || {};
  const names = SKILLS.map((s) => s.name).slice().sort((a, b) =>
    skillDisplayName(a).localeCompare(skillDisplayName(b))
  );
  let list = '<ul class="cpr-live__skills">';
  for (const name of names) {
    list += skillRow(name, Number(sk[name]) || 0);
  }
  list += "</ul>";
  return block("Skills · " + names.length, list, "Skills");
}

function cyberBody(cpr: ICPRCharacter): string {
  const s = cpr.stats;
  const chrome = cpr.cyberware || [];
  const hl = Number(cpr.humanityLoss ?? 0);
  const byCat: Record<string, typeof chrome> = {};
  for (const c of chrome) {
    const cat = String(
      (c as { category?: string }).category || "other",
    );
    if (!byCat[cat]) byCat[cat] = [];
    byCat[cat].push(c);
  }
  const order = [
    "fashionware", "neuralware", "chipware", "cyberoptics",
    "cyberaudio", "internal", "external", "cyberlimb",
    "borgware", "other",
  ];
  const cats = order.filter((c) => byCat[c]?.length);
  for (const c of Object.keys(byCat)) {
    if (!cats.includes(c)) cats.push(c);
  }

  let body =
    '<div class="cpr-inv-status">' +
    invStatus(
      "EMP",
      esc(String(s.emp)) +
        ' <span class="muted">/ ' +
        esc(String(s.empBase)) + "</span>",
    ) +
    invStatus(
      "Humanity loss",
      esc(String(hl)) +
        ' <span class="muted">/ 60</span>',
      (hl / 60) * 100,
      "hl",
    ) +
    invStatus(
      "Installed",
      esc(String(chrome.length)) +
        ' <span class="muted">piece' +
        (chrome.length === 1 ? "" : "s") + "</span>",
    ) +
    "</div>";

  if (!chrome.length) {
    body +=
      '<p class="cpr-inv__empty">Meat only — no cyberware.' +
      "</p>";
  } else {
    for (const cat of cats) {
      body +=
        '<p class="cpr-inv__cat">' + esc(titleCase(cat)) +
        " · " + byCat[cat].length +
        '</p><ul class="cpr-inv">';
      for (const c of byCat[cat]) {
        const pieceHl = c.hl != null ? Number(c.hl) : 0;
        body +=
          '<li class="cpr-inv__row is-on">' +
          '<div class="cpr-inv__main">' +
          '<p class="cpr-inv__name">' +
          esc(titleCase(c.name || "")) +
          "</p>" +
          '<p class="cpr-inv__meta">HL ' +
          esc(String(pieceHl)) +
          "</p></div>" +
          '<div class="cpr-inv__side">' +
          '<div><span class="cpr-inv__val-lbl">HL</span>' +
          '<span class="cpr-inv__val">' +
          esc(String(pieceHl)) +
          "</span></div>" +
          invMeter(pieceHl, 14, "hl") +
          "</div></li>";
      }
      body += "</ul>";
    }
  }

  if (cpr.bodysculpt && cpr.bodysculpt.length) {
    body +=
      '<p class="cpr-inv__cat">Bodysculpt</p>' +
      '<ul class="cpr-inv">';
    for (const bs of cpr.bodysculpt) {
      body +=
        '<li class="cpr-inv__row is-on">' +
        '<div class="cpr-inv__main">' +
        '<p class="cpr-inv__name">' +
        esc(titleCase(bs.modification)) +
        "</p>" +
        (bs.exotic
          ? '<p class="cpr-inv__meta">exotic</p>'
          : "") +
        "</div></li>";
    }
    body += "</ul>";
  }

  const sev = cyberpsychosisSeverity(
    s.emp,
    s.empBase,
    cpr.humanityLoss,
  );
  if (sev !== "none" && sev !== "mild") {
    body +=
      '<p class="cpr-live__hint"><span class="cpr-badge ' +
      'cpr-badge--wound is-crit">' +
      esc(sev.toUpperCase()) +
      "</span></p>";
  }
  return block(
    "Chrome" + (chrome.length ? " · " + chrome.length : ""),
    body,
    "Chrome",
  );
}

function gearBody(cpr: ICPRCharacter): string {
  const rd = (cpr.roleData || {}) as Record<string, unknown>;
  const loadout = Array.isArray(rd.startingGear)
    ? (rd.startingGear as string[])
    : [];
  const bodyArm = cpr.armorBody;
  const headArm = cpr.armorHead;
  const eb = cpr.eurodollars ?? 0;

  let body =
    '<div class="cpr-inv-status">' +
    invStatus(
      "Eddies",
      esc(gearFmtEb(eb)),
    ) +
    invStatus(
      "Loadout",
      esc(String(loadout.length)) +
        ' <span class="muted">item' +
        (loadout.length === 1 ? "" : "s") + "</span>",
    ) +
    "</div>";

  body +=
    '<p class="cpr-inv__cat">Armor</p><ul class="cpr-inv">';
  const armRow = (
    label: string,
    arm: { name?: string; sp?: number; currentSp?: number;
      penalty?: number } | null | undefined,
  ): string => {
    if (arm && arm.name) {
      const sp = arm.currentSp != null ? arm.currentSp : arm.sp;
      const spMax = arm.sp != null ? arm.sp : sp;
      return (
        '<li class="cpr-inv__row is-on">' +
        '<div class="cpr-inv__main">' +
        '<p class="cpr-inv__name">' +
        esc(titleCase(arm.name)) +
        "</p>" +
        '<p class="cpr-inv__meta">' + esc(label) +
        (arm.penalty != null
          ? " · pen " + esc(String(arm.penalty))
          : "") +
        "</p></div>" +
        '<div class="cpr-inv__side">' +
        '<div><span class="cpr-inv__val-lbl">SP</span>' +
        '<span class="cpr-inv__val">' +
        esc(String(sp ?? "?")) + "/" +
        esc(String(spMax ?? "?")) +
        "</span></div>" +
        invMeter(
          Number(sp) || 0,
          Math.max(Number(spMax) || 1, 1),
          "sp",
        ) +
        "</div></li>"
      );
    }
    return (
      '<li class="cpr-inv__row is-blocked">' +
      '<div class="cpr-inv__main">' +
      '<p class="cpr-inv__name">' + esc(label) + "</p>" +
      '<p class="cpr-inv__meta muted">no armor</p>' +
      "</div></li>"
    );
  };
  body += armRow("Body", bodyArm) + armRow("Head", headArm);
  body += "</ul>";

  if (loadout.length) {
    body +=
      '<p class="cpr-inv__cat">Loadout · ' + loadout.length +
      '</p><ul class="cpr-inv">';
    for (const n of loadout) {
      body +=
        '<li class="cpr-inv__row is-on">' +
        '<div class="cpr-inv__main">' +
        '<p class="cpr-inv__name">' +
        esc(titleCase(String(n))) +
        "</p></div></li>";
    }
    body += "</ul>";
  } else {
    body +=
      '<p class="cpr-inv__empty">No weapons or kit listed.' +
      "</p>";
  }

  return block(
    "Gear" + (loadout.length ? " · " + loadout.length : ""),
    body,
    "Gear",
  );
}

function combatBody(cpr: ICPRCharacter): string {
  const stunChar = ensureStunPool(cpr);
  const ko = isUnconscious(stunChar);
  const wc = String(cpr.woundState || "healthy");
  const dmgPen = woundActionPenalty(
    cpr.woundState,
    cpr.cyberware,
  );
  const movePen = woundMovePenalty(cpr.woundState);
  const dsPen = totalDeathSavePenalty(cpr);

  let body =
    '<div class="cpr-live__vitals">' +
    '<div class="cpr-live__vrow">' +
    '<span class="cpr-live__vlbl">HP</span>' +
    vitalBar(cpr.hp.current, cpr.hp.max, "hp") +
    "</div>" +
    '<div class="cpr-live__vrow">' +
    '<span class="cpr-live__vlbl">Stun</span>' +
    vitalBar(
      stunChar.stun!.current,
      stunChar.stun!.max,
      "stun",
    ) +
    (ko
      ? ' <span class="cpr-badge cpr-badge--wound is-crit">KO</span>'
      : "") +
    "</div></div>" +
    '<div class="cpr-live__badges cpr-sheet__list-gap">' +
    '<span class="cpr-badge cpr-badge--wound ' +
    woundClass(wc) + '">' + esc(wc.toUpperCase()) +
    "</span>" +
    '<span class="cpr-badge">SW ' +
    esc(String(cpr.swThreshold ?? "—")) +
    "</span>" +
    '<span class="cpr-badge">Death ' +
    esc(String((cpr.deathSave ?? 0) - dsPen)) +
    "</span></div>" +
    '<div class="cpr-live__armor">' +
    armorRow("Body", cpr.armorBody) +
    armorRow("Head", cpr.armorHead) +
    "</div>";

  if (dmgPen !== 0) {
    body +=
      '<p class="cpr-live__hint">Penalties: ' +
      esc(String(dmgPen)) + " action / " +
      esc(String(movePen)) + " move</p>";
  }

  if (cpr.criticalInjuries && cpr.criticalInjuries.length) {
    body +=
      '<p class="cpr-live__h cpr-sheet__subh">' +
      "Critical injuries</p>" +
      '<ul class="cpr-live__skills">';
    for (const inj of cpr.criticalInjuries) {
      body +=
        "<li><span>" +
        esc("[" + inj.location.toUpperCase() + "] " + inj.name) +
        "</span><strong>" +
        esc(inj.treated ? "treated" : "open") +
        "</strong></li>";
    }
    body += "</ul>";
  }

  if (cpr.activeEffects && cpr.activeEffects.length) {
    body +=
      '<p class="cpr-live__h cpr-sheet__subh">' +
      "Active effects</p>" +
      '<ul class="cpr-live__skills">';
    for (const eff of cpr.activeEffects) {
      const mins = Math.max(
        0,
        Math.round((eff.expiresAt - Date.now()) / 60000),
      );
      body +=
        "<li><span>" + esc(eff.drug) +
        "</span><strong>" + esc(String(mins)) +
        "m</strong></li>";
    }
    body += "</ul>";
  }

  return block("Combat", body);
}

function economyBody(cpr: ICPRCharacter): string {
  const ls = LIFESTYLES.find((l) => l.name === cpr.lifestyle?.tier);
  let body =
    '<ul class="cpr-live__skills">' +
    "<li><span>Eddies</span><strong>" +
    esc(gearFmtEb(cpr.eurodollars ?? 0)) +
    "</strong></li>" +
    "<li><span>Lifestyle</span><strong>" +
    esc(ls?.displayName ?? "none") +
    "</strong></li>" +
    "<li><span>Monthly</span><strong>" +
    esc(gearFmtEb(ls?.monthlyCostEb ?? 0)) +
    "</strong></li>" +
    "<li><span>Reputation</span><strong>" +
    esc(String(cpr.reputation ?? 0)) +
    "</strong></li></ul>";

  if (cpr.reputationDeeds && cpr.reputationDeeds.length) {
    body +=
      '<p class="cpr-live__h cpr-sheet__subh">Known for</p>' +
      '<ul class="cpr-live__skills">';
    for (const d of cpr.reputationDeeds.slice(0, 8)) {
      body +=
        "<li><span>" + esc(d) +
        "</span><strong></strong></li>";
    }
    body += "</ul>";
  }
  return block("Economy", body);
}

function viewBody(view: SheetView, cpr: ICPRCharacter): string {
  switch (view) {
    case "stats":
      return statsBody(cpr);
    case "skills":
      return skillsBody(cpr);
    case "cyber":
      return cyberBody(cpr);
    case "gear":
      return gearBody(cpr);
    case "combat":
      return combatBody(cpr);
    case "economy":
      return economyBody(cpr);
    default:
      return overviewBody(cpr);
  }
}

export type SheetHtmlOpts = {
  view?: SheetView | string;
  /** Other player's bare name for nav cmds; omit for self. */
  targetArg?: string;
  footNote?: boolean;
};

/**
 * In-line play sheet: header + chips + one view body.
 * Deep browse (left rail) is /chargen, not +sheet.
 */
export function buildSheetHtml(
  playerName: string,
  cpr: ICPRCharacter,
  opts: SheetHtmlOpts = {},
): string {
  const view = normalizeView(opts.view);
  const targetArg = String(opts.targetArg || "").trim();

  let html =
    '<div class="cpr-sheet cpr-sheet--inline cpr-live" ' +
    'data-cpr-sheet data-cpr-view="' + esc(view) + '">' +
    headerHtml(playerName, cpr) +
    chipRow(view, targetArg) +
    '<div class="cpr-sheet__inline-body">' +
    viewBody(view, cpr) +
    "</div>";

  if (opts.footNote !== false) {
    html +=
      '<p class="cpr-sheet__foot muted">' +
      "Full sheet on <code>/chargen</code> · " +
      "<code>+score</code> combat strip</p>";
  }
  html += "</div>";
  return html;
}

/** Layout bag for u.ui.layout on web /play. */
export function buildSheetWebLayoutHtml(
  playerName: string,
  cpr: ICPRCharacter,
  opts: SheetHtmlOpts = {},
): {
  components: Record<string, unknown>[];
  meta: Record<string, unknown>;
} {
  const view = normalizeView(opts.view);
  return {
    components: [
      {
        type: "html",
        content: buildSheetHtml(playerName, cpr, {
          ...opts,
          view,
          footNote: opts.footNote !== false,
        }),
      },
    ],
    meta: {
      type: "cpr-sheet",
      system: "cpr",
      view,
      role: cpr.role,
      className: "play-layout--cpr-sheet",
    },
  };
}
