/**
 * HTML character sheet for web /play (+sheet) and chargen parity.
 * Classes match packages/site/public/css/dnd-chargen.css (.dnd-sheet*).
 */
import {
  DND_ABILITIES,
  DND_SKILLS,
  getAbilityMod,
  getProficiencyBonus,
  migrateSheet,
  type DndSheet,
  type DndAbility,
  type DndSkill,
  SKILL_ABILITY_MAP,
} from "../stats/dnd_sheet.ts";
import { formatDeathStatus } from "../stats/death.ts";

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
 * MUSH %c / %ch / truecolor → spans with mush-fg-* classes
 * (styled by play-palette.css under .play-root).
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

  // %ch bold, %cn reset, %cr…%cw fg, %c<#rrggbb>, <#rrggbb>
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
      if (/^[0-9a-f]{6}$/.test(hx)) style = { ...style, color: hx };
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

function titleCase(s: string): string {
  return String(s || "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function fmtMod(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}

function skillTotal(
  sheet: DndSheet,
  sk: DndSkill,
  prof: number,
): number {
  const ab = SKILL_ABILITY_MAP[sk];
  const mod = getAbilityMod(sheet.abilities[ab] ?? 10);
  const p = sheet.skillProficiency[sk] ?? "none";
  const mult = p === "expert" ? 2 : p === "proficient" ? 1 : 0;
  return mod + prof * mult;
}

function stripCodes(s: string): string {
  return s
    .replace(/%c[a-z]/gi, "")
    .replace(/%cn/gi, "")
    .replace(/%[rntb]/gi, "")
    .replace(/<#([0-9a-fA-F]{6})>/g, "");
}

/**
 * Full-width D&D sheet markup for web clients.
 */
export function buildSheetHtml(
  playerName: string,
  sheetIn: DndSheet,
  opts: { footNote?: boolean } = {},
): string {
  const s = migrateSheet(sheetIn);
  const prof = getProficiencyBonus(s.level);
  const dexM = getAbilityMod(s.abilities.dexterity ?? 10);
  const wisM = getAbilityMod(s.abilities.wisdom ?? 10);
  const percP = s.skillProficiency.perception ?? "none";
  const percMult = percP === "expert"
    ? 2
    : percP === "proficient"
    ? 1
    : 0;
  const passive = 10 + wisM + prof * percMult;
  const clsLine = [
    titleCase(s.class || "—"),
    s.subclass ? `(${titleCase(s.subclass)})` : "",
    `· Level ${s.level || 1}`,
  ].filter(Boolean).join(" ");

  let html = '<div class="dnd-sheet" data-dnd-sheet>';

  html += '<header class="dnd-sheet__banner">';
  // Monikers often carry %cy…%cn — render as palette spans, not raw codes
  html += `<p class="dnd-sheet__name">${mushToHtml(playerName)}</p>`;
  html += `<p class="dnd-sheet__class">${esc(clsLine)}</p>`;
  html += `<p class="dnd-sheet__meta">${
    esc(titleCase(s.species || "—"))
  } · ${esc(titleCase(s.background || "—"))} · XP ${
    esc(String(s.xp ?? 0))
  }</p></header>`;

  html += '<div class="dnd-sheet__combat" aria-label="Combat">';
  const combat: [string, string][] = [
    ["AC", String(s.ac ?? 10)],
    ["Initiative", fmtMod(dexM)],
    ["Speed", `${s.speed ?? 30} ft`],
    ["Proficiency", fmtMod(prof)],
    ["Passive Perc", String(passive)],
    ["Status", stripCodes(formatDeathStatus(s))],
  ];
  for (const [lab, val] of combat) {
    html += '<div class="dnd-sheet__stat">' +
      `<span class="dnd-sheet__stat-l">${esc(lab)}</span>` +
      `<span class="dnd-sheet__stat-v">${esc(val)}</span></div>`;
  }
  html += "</div>";

  html += '<div class="dnd-sheet__hp-row">';
  html += '<div class="dnd-sheet__hp">' +
    '<span class="dnd-sheet__stat-l">Hit Points</span>' +
    `<span class="dnd-sheet__hp-val">${esc(String(s.hp.current))} / ${
      esc(String(s.hp.max))
    }` +
    (s.hp.temp
      ? ` <span class="dnd-sheet__temp">+${
        esc(String(s.hp.temp))
      } temp</span>`
      : "") +
    "</span></div>";
  html += '<div class="dnd-sheet__hd">' +
    '<span class="dnd-sheet__stat-l">Hit Dice</span>' +
    `<span class="dnd-sheet__stat-v">${
      esc(String(s.hitDice.current))
    } / ${esc(String(s.hitDice.max))}</span></div>`;
  html += '<div class="dnd-sheet__gold">' +
    '<span class="dnd-sheet__stat-l">Gold</span>' +
    `<span class="dnd-sheet__stat-v">${
      esc(String(s.gold ?? 0))
    } gp</span></div></div>`;

  html += '<div class="dnd-sheet__body">';

  html += '<section class="dnd-sheet__panel">' +
    '<h3 class="dnd-sheet__h">Abilities</h3>' +
    '<ul class="dnd-sheet__abils">';
  for (const a of DND_ABILITIES) {
    const v = s.abilities[a] ?? 10;
    const m = getAbilityMod(v);
    html += '<li class="dnd-sheet__abil">' +
      `<span class="dnd-sheet__abil-name">${
        esc(a.slice(0, 3).toUpperCase())
      }</span>` +
      `<span class="dnd-sheet__abil-mod">${esc(fmtMod(m))}</span>` +
      `<span class="dnd-sheet__abil-score">${esc(String(v))}</span>` +
      "</li>";
  }
  html += "</ul></section>";

  html += '<section class="dnd-sheet__panel">' +
    '<h3 class="dnd-sheet__h">Saving throws</h3>' +
    '<ul class="dnd-sheet__checks dnd-sheet__checks--4">';
  for (const a of DND_ABILITIES) {
    const isP = s.savingThrowProficiency.includes(a);
    const m = getAbilityMod(s.abilities[a] ?? 10) + (isP ? prof : 0);
    html += `<li class="${isP ? "is-prof" : ""}">` +
      `<span class="dnd-sheet__mark" aria-hidden="true">${
        isP ? "●" : "○"
      }</span>` +
      `<span>${esc(titleCase(a))}</span>` +
      `<strong>${esc(fmtMod(m))}</strong></li>`;
  }
  html += "</ul></section>";

  html +=
    '<section class="dnd-sheet__panel dnd-sheet__panel--wide">' +
    '<h3 class="dnd-sheet__h">Skills</h3>' +
    '<ul class="dnd-sheet__checks dnd-sheet__checks--4">';
  for (const sk of DND_SKILLS) {
    const p = s.skillProficiency[sk] ?? "none";
    const isP = p !== "none";
    const total = skillTotal(s, sk, prof);
    const mark = p === "expert" ? "◆" : isP ? "●" : "○";
    const ab = SKILL_ABILITY_MAP[sk].slice(0, 3).toUpperCase();
    html += `<li class="${isP ? "is-prof" : ""}">` +
      `<span class="dnd-sheet__mark" aria-hidden="true">${mark}</span>` +
      `<span>${esc(titleCase(sk))} ` +
      `<span class="dnd-sheet__ab">${esc(ab)}</span></span>` +
      `<strong>${esc(fmtMod(total))}</strong></li>`;
  }
  html += "</ul></section>";

  const feats = s.feats ?? [];
  html += '<section class="dnd-sheet__panel">' +
    '<h3 class="dnd-sheet__h">Feats &amp; features</h3>';
  if (!feats.length) {
    html += '<p class="dnd-sheet__empty">None yet.</p>';
  } else {
    html += '<ul class="dnd-sheet__list">';
    for (const f of feats) {
      html += `<li>${esc(titleCase(f))}</li>`;
    }
    html += "</ul>";
  }
  html += "</section>";

  const gear = s.equipment ?? [];
  html += '<section class="dnd-sheet__panel">' +
    '<h3 class="dnd-sheet__h">Equipment</h3>';
  if (!gear.length) {
    html +=
      '<p class="dnd-sheet__empty">See inventory (+inv).</p>';
  } else {
    html += '<ul class="dnd-sheet__list">';
    for (const g of gear) {
      html += `<li>${esc(titleCase(String(g)))}</li>`;
    }
    html += "</ul>";
  }
  html += "</section>";

  const spells = s.spells ?? [];
  let hasSlots = false;
  for (let si = 1; si <= 9; si++) {
    if ((s.spellSlotsMax[si] || 0) > 0) hasSlots = true;
  }
  if (spells.length || hasSlots) {
    html +=
      '<section class="dnd-sheet__panel dnd-sheet__panel--wide">' +
      '<h3 class="dnd-sheet__h">Spellcasting</h3>';
    if (hasSlots) {
      html += '<ul class="dnd-sheet__slots">';
      for (let si = 1; si <= 9; si++) {
        const mx = s.spellSlotsMax[si] || 0;
        if (!mx) continue;
        const cur = s.spellSlotsCurrent[si] ?? mx;
        html += `<li><span>Level ${si}</span><strong>${cur} / ${mx}` +
          `</strong></li>`;
      }
      html += "</ul>";
    }
    if (spells.length) {
      html += '<ul class="dnd-sheet__list dnd-sheet__list--wrap">';
      for (const sp of spells) {
        html += `<li>${esc(titleCase(sp))}</li>`;
      }
      html += "</ul>";
    }
    html += "</section>";
  }

  html += "</div>"; /* body */

  if (opts.footNote !== false) {
    html += '<p class="dnd-sheet__foot muted">' +
      "In-game: <code>+sheet</code> · " +
      "<code>+inv</code> · <code>+money</code></p>";
  }
  html += "</div>";
  return html;
}

/** Layout bag for u.ui.layout on web. */
export function buildSheetWebLayoutHtml(
  playerName: string,
  sheetIn: DndSheet,
): {
  components: Record<string, unknown>[];
  meta: Record<string, unknown>;
} {
  const s = migrateSheet(sheetIn);
  return {
    components: [
      {
        type: "html",
        content: buildSheetHtml(playerName, s, { footNote: true }),
      },
    ],
    meta: {
      type: "dnd-sheet",
      system: "dnd",
      class: s.class,
      level: s.level,
      className: "play-layout--dnd-sheet",
    },
  };
}
