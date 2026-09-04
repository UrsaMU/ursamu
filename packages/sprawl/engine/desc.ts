/**
 * Look generator: paragraph base from d66 + optional gear clause.
 * Pronouns from SEX attr (%s/%o/%p family). Custom desc wins.
 */
import type { IDBObj, IUrsamuSDK } from "@ursamu/mush";
import type { ISprawlChar, SprawlItemData } from "../db/schemas.ts";
import {
  ACCESSORIES,
  AFFECTATIONS,
  LOOK_OPENERS,
  find,
  pickByRoll,
  roll2d6Key,
  rollD66,
  type Row,
} from "./catalog.ts";
import { displayName, itemData } from "./items.ts";
import {
  cap,
  pronounsOf,
  type PronounSet,
} from "./pronouns.ts";
import {
  footer,
  W as TERM_W,
  panelClose,
  panelOpen,
  plain as stripCodes,
} from "../commands/chrome.ts";

/** Body content width; frameStreetLook adds 2-space indent → 78. */
const BODY_W = TERM_W - 2;

/** Do not end a line on these (causes "and an\\nOrchard…"). */
const WEAK_END = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "of",
  "to",
  "for",
  "in",
  "on",
  "at",
  "by",
  "as",
  "with",
  "from",
  "into",
  "his",
  "her",
  "their",
  "its",
]);

function wordCore(w: string): string {
  return stripCodes(w).toLowerCase().replace(/[^a-z']/g, "");
}

function isWeakEnd(w: string): boolean {
  return WEAK_END.has(wordCore(w));
}

function visJoin(words: string[]): string {
  return words.join(" ");
}

function visLen(words: string[]): number {
  return stripCodes(visJoin(words)).length;
}

/**
 * Word-wrap on *visible* width only (gradient moniker codes = 0).
 * Peels weak trailers (a/an/and/the…) onto the next line and
 * reflows short orphan tails ("them.").
 */
export function wrapPara(text: string, width = BODY_W): string {
  const words = String(text ?? "").replace(/\s+/g, " ").trim()
    .split(" ").filter(Boolean);
  if (!words.length) return "";

  const lines: string[][] = [];
  let cur: string[] = [];

  const flush = () => {
    if (!cur.length) return;
    const carry: string[] = [];
    while (cur.length > 1 && isWeakEnd(cur[cur.length - 1]!)) {
      carry.unshift(cur.pop()!);
    }
    lines.push(cur);
    cur = carry;
  };

  for (const w of words) {
    const trial = [...cur, w];
    if (visLen(trial) <= width) {
      cur = trial;
      continue;
    }
    if (cur.length) {
      flush();
      const again = [...cur, w];
      if (visLen(again) <= width) {
        cur = again;
      } else if (cur.length) {
        lines.push(cur);
        cur = [w];
      } else {
        cur = [w];
      }
    } else {
      cur = [w];
      lines.push(cur);
      cur = [];
    }
  }
  if (cur.length) lines.push(cur);

  // Fix short last line — merge or steal words from previous
  if (lines.length >= 2) {
    let last = lines[lines.length - 1]!;
    let prev = lines[lines.length - 2]!;
    const lastVis = visLen(last);
    if (lastVis > 0 && lastVis <= 14) {
      const merged = [...prev, ...last];
      if (visLen(merged) <= width) {
        lines.splice(lines.length - 2, 2, merged);
      } else {
        while (prev.length > 2 && visLen(last) <= 14) {
          const w = prev[prev.length - 1]!;
          const trialPrev = prev.slice(0, -1);
          const trialLast = [w, ...last];
          if (visLen(trialLast) > width) break;
          prev = trialPrev;
          last = trialLast;
        }
        lines[lines.length - 2] = prev;
        lines[lines.length - 1] = last;
      }
    }
  }

  return lines.map((ws) => visJoin(ws)).join("\n");
}

function phraseAffect(nameOrSlug: string): string {
  const lc = nameOrSlug.toLowerCase();
  const row = AFFECTATIONS.find((a) =>
    a.slug === lc ||
    String(a.name).toLowerCase() === lc ||
    String(a.name).toLowerCase().includes(lc)
  );
  if (row?.phrase) return String(row.phrase);
  if (row?.blurb) {
    return `${String(row.name).toLowerCase()} (${row.blurb})`;
  }
  return nameOrSlug;
}

function phraseAcc(slugOrName: string): string {
  const lc = slugOrName.toLowerCase();
  const row = ACCESSORIES.find((a) =>
    a.slug === lc || String(a.name).toLowerCase() === lc
  );
  if (row?.phrase) return String(row.phrase);
  return slugOrName;
}

function bgVibe(c: ISprawlChar): string {
  const bg = c.background
    ? find("background", c.background)
    : undefined;
  return c.backgroundName ||
    (bg ? String(bg.name) : "street operator");
}

/** Singular/plural verb forms for opener templates. */
function verbBag(
  p: PronounSet,
): Record<string, string> {
  const s = !!p.s;
  const v = (one: string, many: string) => (s ? one : many);
  return {
    cuts: v("cuts", "cut"),
    looks: v("looks", "look"),
    reads: v("reads", "read"),
    carries: v("carries", "carry"),
    is: p.isAre,
    has: p.hasHave,
    moves: v("moves", "move"),
    comes: v("comes", "come"),
    smells: v("smells", "smell"),
    resolves: v("resolves", "resolve"),
    catches: v("catches", "catch"),
    paints: v("paints", "paint"),
    presents: v("presents", "present"),
    wears: v("wears", "wear"),
    clings: v("clings", "cling"),
    screams: v("screams", "scream"),
    answers: v("answers", "answer"),
    prefers: v("prefers", "prefer"),
    holds: v("holds", "hold"),
    leaves: v("leaves", "leave"),
    turns: v("turns", "turn"),
    stands: v("stands", "stand"),
  };
}

/** Fill {name} {vibe} {subj} {poss} {cuts} … in an opener template. */
export function fillOpener(
  template: string,
  name: string,
  vibe: string,
  p: PronounSet,
): string {
  const verbs = verbBag(p);
  let out = template;
  const map: Record<string, string> = {
    name,
    vibe,
    subj: p.subj,
    Subj: cap(p.subj),
    obj: p.obj,
    poss: p.poss,
    Poss: cap(p.poss),
    ...verbs,
  };
  for (const [k, v] of Object.entries(map)) {
    out = out.replaceAll(`{${k}}`, v);
  }
  return out;
}

/** Sticky opener: reuse c.lookOpener, else roll d66. */
export function resolveOpener(
  c: ISprawlChar,
  rng?: () => number,
): Row {
  if (c.lookOpener) {
    const hit = find("lookOpener", c.lookOpener);
    if (hit) return hit;
  }
  return pickByRoll(LOOK_OPENERS, rollD66(rng)) ??
    LOOK_OPENERS[0];
}

function listPhrase(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${
    items[items.length - 1]
  }`;
}

/** @deprecated Gear is always live; kept for older sheets. */
export function isAutoDesc(_c: ISprawlChar): boolean {
  return true;
}

export type GearSlotItem = {
  name: string;
  kind: string;
  slug: string;
};

export function gearSlots(items: IDBObj[]): {
  worn: string[];
  wielded: string[];
} {
  const d = gearSlotsDetailed(items);
  return {
    worn: d.worn.map((x) => x.name),
    wielded: d.wielded.map((x) => x.name),
  };
}

export function gearSlotsDetailed(items: IDBObj[]): {
  worn: GearSlotItem[];
  wielded: GearSlotItem[];
} {
  const worn: GearSlotItem[] = [];
  const wielded: GearSlotItem[] = [];
  for (const o of items) {
    const d = itemData(o);
    if (!d) continue;
    const row: GearSlotItem = {
      name: displayName(o),
      kind: String(d.kind),
      slug: d.slug,
    };
    if (d.slot === "worn") worn.push(row);
    else if (d.slot === "wielded") wielded.push(row);
  }
  return { worn, wielded };
}

function article(name: string): string {
  return /^[aeiou]/i.test(name) ? "an" : "a";
}

function wieldPhrase(p: PronounSet, g: GearSlotItem): string {
  const a = article(g.name);
  const k = g.kind;
  if (k === "firearm" || k === "heavy" || k === "weapon") {
    return (
      `${a} ${g.name} rides low and mean, ` +
      `safety off, street-ready in ${p.poss} grip`
    );
  }
  if (k === "melee") {
    return (
      `${a} ${g.name} flashes when the neon hits — ` +
      `close-work chrome kept honest`
    );
  }
  return (
    `${a} ${g.name} sits ready in ${p.poss} hand`
  );
}

function wearPhrase(p: PronounSet, names: string[]): string {
  const list = listPhrase(names);
  if (names.length === 1) {
    return (
      `${cap(p.subj)} move${p.s} in ${list}, ` +
      `cut for wet nights and bad lighting`
    );
  }
  return (
    `${cap(p.subj)} layer${p.s} ${list} ` +
    `like armour against the Flow`
  );
}

export type GearClauseOpts = {
  /** Boarded hull display name, if any. */
  vehicleName?: string;
};

/**
 * Gear as cyberpunk street prose (not bullet labels).
 */
export function composeGearClause(
  p: PronounSet,
  items: IDBObj[],
  opts: GearClauseOpts = {},
): string {
  const { worn, wielded } = gearSlotsDetailed(items);
  const bits: string[] = [];

  if (opts.vehicleName) {
    const ride = opts.vehicleName;
    const labeled = /^a |^an |^the /i.test(ride)
      ? ride
      : `the ${ride}`;
    bits.push(
      `${cap(p.subj)} ${p.isAre} jacked into ` +
        `${labeled}, hull between ${p.obj} ` +
        `and the street`,
    );
  }

  const armour = worn.filter((w) =>
    w.kind === "armor" || w.kind === "gear"
  );
  const otherWorn = worn.filter((w) =>
    !armour.some((a) => a.name === w.name)
  );
  if (armour.length) {
    bits.push(wearPhrase(p, armour.map((a) => a.name)));
  }
  if (otherWorn.length) {
    const names = listPhrase(otherWorn.map((w) => w.name));
    bits.push(
      `${p.subj} wear${p.s} ${names} like a second signal`,
    );
  }

  if (wielded.length === 1) {
    bits.push(wieldPhrase(p, wielded[0]));
  } else if (wielded.length > 1) {
    bits.push(
      `${p.subj} keep${p.s} ` +
        `${listPhrase(wielded.map((w) => w.name))} ` +
        `in easy reach — arguments waiting to happen`,
    );
  }

  if (!bits.length) return "";
  if (bits.length === 1) return `${bits[0]}.`;
  if (bits.length === 2) {
    return `${bits[0]}, and ${bits[1]}.`;
  }
  const head = bits.slice(0, -1).join("; ");
  return `${head}; and ${bits[bits.length - 1]}.`;
}

/**
 * Soft cyan hits on street keywords (MUSH colour).
 * Longer phrases first; skips already-tinted spans.
 */
export function tintStreetLook(text: string): string {
  const keys = [
    "jacked into",
    "rain-slick neon",
    "mirrorshades",
    "filter-mask",
    "wetware",
    "vendomat",
    "bandwidth",
    "capsule",
    "chrome",
    "static",
    "neon",
    "jacked",
    "cyber",
    "holo",
    "Flow",
    "Zone",
    "zone",
    "rain",
    "aug",
  ].sort((a, b) => b.length - a.length);
  // Protect existing %c…%cn runs from nested tint.
  const hold: string[] = [];
  let out = text.replace(/%c[a-z][\s\S]*?%cn/gi, (m) => {
    hold.push(m);
    return `\u0000${hold.length - 1}\u0000`;
  });
  for (const k of keys) {
    const re = new RegExp(
      `\\b(${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})\\b`,
      "gi",
    );
    out = out.replace(re, "%cc$1%cn");
  }
  out = out.replace(/\u0000(\d+)\u0000/g, (_, i) => hold[Number(i)]);
  return out;
}

export type ComposeBaseResult = {
  text: string;
  openerSlug: string;
};

/** Stable pick from a list (same key → same line). */
function pickStable(key: string, lines: string[]): string {
  if (!lines.length) return "";
  let h = 0;
  for (let i = 0; i < key.length; i++) {
    h = (h + key.charCodeAt(i) * (i + 1)) % 997;
  }
  return lines[h % lines.length];
}

/** Accessory sentence — varied closers, not one fixed glare. */
function accessoryClause(
  phrases: string[],
  p: PronounSet,
  seed: string,
): string {
  const list = listPhrase(phrases);
  const closers = [
    `finished with ${list}`,
    `${list} riding ${p.poss} kit like a signature`,
    `${list} catching the streetlights on the way past`,
    `${list} worn like ${p.subj} meant to be noticed`,
    `details that read loud up close — ${list}`,
    `${list} tucked where scanners might miss them`,
  ];
  return pickStable(`acc:${seed}:${list}`, closers);
}

function augClause(names: string[], seed: string): string {
  const list = listPhrase(names);
  const lines = [
    `wetware tells — ${list} — under the skin`,
    `chrome tells — ${list} — when the light hits`,
    `aug lines showing ${list}`,
    `wetware hum from ${list}`,
  ];
  return pickStable(`aug:${seed}:${list}`, lines);
}

/**
 * Paragraph base from d66 opener + style tables + SEX pronouns.
 * No inventory gear — that is appended live.
 * Opener slug is sticky via c.lookOpener when set.
 */
export function composeBaseDesc(
  name: string,
  c: ISprawlChar,
  p: PronounSet,
  rng?: () => number,
): ComposeBaseResult {
  const vibe = bgVibe(c);
  const opener = resolveOpener(c, rng);
  const openLine = fillOpener(
    String(opener.template ?? ""),
    name,
    vibe,
    p,
  );
  const parts: string[] = [openLine];

  const collides = p.s ? "collides" : "collide";

  const aff = (c.affectations ?? []).map(phraseAffect);
  if (aff.length === 1) {
    parts.push(
      `${p.poss} silhouette cut hard toward ${aff[0]}`,
    );
  } else if (aff.length > 1) {
    parts.push(
      `${p.subj} ${collides} ${listPhrase(aff)} ` +
        `into one rain-slick street silhouette`,
    );
  } else {
    parts.push(
      `${p.subj} ${p.hasHave} no signature look yet — ` +
        `still shopping the Flow's night tables`,
    );
  }

  const acc = (c.accessories ?? []).map(phraseAcc);
  if (acc.length) {
    parts.push(accessoryClause(acc, p, opener.slug));
  }

  const augs = (c.augs ?? []).slice(0, 3).map((a) => a.name);
  if (augs.length) {
    parts.push(augClause(augs, opener.slug));
  }

  const shards = (c.shards ?? []).slice(0, 2);
  if (shards.length) {
    parts.push(
      `shard ports humming quiet with ` +
        `${listPhrase(shards.map((s) => String(s)))}`,
    );
  }

  const quirks = (c.quirks ?? []).slice(0, 2);
  if (quirks.length) {
    parts.push(
      `street rumour still tagging ${p.obj} as ` +
        `${listPhrase(quirks)}`,
    );
  }

  if (c.critical) {
    parts.push(
      `damage the cameras never miss — ` +
        `${c.critical.location}, ${c.critical.effect}`,
    );
  }

  let body = "";
  if (parts.length === 1) {
    body = `${parts[0]}.`;
  } else if (parts.length === 2) {
    body = `${parts[0]}, ${parts[1]}.`;
  } else {
    const head = parts.slice(0, -1).join(", ");
    body = `${head}, and ${parts[parts.length - 1]}.`;
  }
  return {
    text: wrapPara(body),
    openerSlug: opener.slug,
  };
}

/** base paragraph + optional gear sentence (≤76 plain / line). */
export function assembleLook(
  base: string,
  gearClause: string,
): string {
  const b = wrapPara(base.trim());
  const g = wrapPara(gearClause.trim());
  if (!g) return tintStreetLook(b);
  if (!b) return tintStreetLook(g);
  return tintStreetLook(`${b}\n${g}`);
}

/**
 * Header badge only — plain text (truecolor breaks game.layout).
 */
export function lookHeaderBadge(raw: string): string {
  const p = stripCodes(raw || "STREET").trim() || "STREET";
  return p.toUpperCase().slice(0, 18);
}

export type FrameLookOpts = {
  /**
   * Plain sheet name for badge / width. Moniker is painted into
   * the body prose (not a second name line under the header).
   */
  name?: string;
};

/**
 * Swap plain sheet name in prose for moniker paint.
 * Layout still uses plain length via wrapPara(stripCodes).
 */
export function paintMonikerInProse(
  prose: string,
  plainName: string,
  moniker: string,
): string {
  const plain = stripCodes(plainName).trim();
  const mon = String(moniker ?? "").trim();
  if (!plain || !mon) return prose;
  // Already the same visible text and mon is uncolored — nothing to do
  if (mon === plain) return prose;
  if (stripCodes(mon) === plain && mon === plain) return prose;
  // Only paint when moniker adds color (or differs)
  const monPlain = stripCodes(mon);
  if (!monPlain) return prose;
  const closed = /%cn\s*$/i.test(mon) ? mon : `${mon}%cn`;
  // Replace sheet name tokens (case-insensitive whole word-ish)
  const esc = plain.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  try {
    return prose.replace(new RegExp(esc, "gi"), closed);
  } catch {
    return prose;
  }
}

/**
 * Panel chrome for +desc / look.
 * Badge = plain name. Body wrapped to BODY_W then indented (≤78).
 */
export function frameStreetLook(
  body: string,
  opts: FrameLookOpts = {},
): string {
  const badge = lookHeaderBadge(opts.name ?? "STREET");
  const rewrapped = String(body)
    .split(/\n+/)
    .map((para) => wrapPara(para.trim(), BODY_W))
    .filter(Boolean)
    .join("\n");
  const flat = rewrapped.split("\n").map((l) => {
    if (!l.trim()) return "";
    return l.startsWith("  ") ? l : `  ${l}`;
  }).filter((l) => l.trim());
  return [
    panelOpen("LOOK", badge),
    ...flat,
    panelClose("SPRAWL"),
  ].join("\n");
}

/** Visible (code-stripped) width of a terminal line. */
export function visibleWidth(line: string): number {
  return stripCodes(line).length;
}

/** Read object description set by @desc (data/state.description). */
export function objectDesc(obj: IDBObj): string {
  const st = obj.state as Record<string, unknown> | undefined;
  const data = (obj as { data?: Record<string, unknown> }).data;
  const raw = st?.description ?? data?.description ?? "";
  return String(raw ?? "").trim();
}

/**
 * Base paragraph only — never includes gear.
 * Priority: @desc / state.description → baseDesc → generate.
 * Empty on purpose after +desc/clear (no silent re-roll).
 */
export function baseParagraph(
  name: string,
  c: ISprawlChar,
  p: PronounSet,
  obj?: IDBObj,
): string {
  // @desc me=… wins as the stored base body
  if (obj) {
    const d = objectDesc(obj);
    if (d) return d;
  }
  const stored = (c.baseDesc ?? "").trim();
  if (stored) return stored;
  // No stored base and no sticky opener → blank (cleared / never rolled)
  if (!c.lookOpener) return "";
  return composeBaseDesc(name, c, p).text;
}

/**
 * Always: base (@desc or generator) + live worn/wielded names.
 */
function boardedVehicleName(
  c: ISprawlChar,
  items: IDBObj[],
): string | undefined {
  const id = c.activeVehicleId;
  if (!id) return undefined;
  const v = items.find((o) => o.id === id);
  if (v) return displayName(v);
  // Boarded but vehicle not in inventory scan
  return "a street ride";
}

export async function resolveLook(
  u: IUrsamuSDK,
  target: IDBObj,
  c: ISprawlChar,
  items: IDBObj[],
): Promise<string> {
  const p = await pronounsOf(u, target);
  // Build with plain sheet name (stable storage / wrap counts).
  const plainName = stripCodes(
    String(c.name || "Goon"),
  ).trim() || "Goon";
  let base = baseParagraph(plainName, c, p, target);
  try {
    if (u.util?.parseDesc && base) {
      base = await u.util.parseDesc(base, u.me, target);
      // Undo moniker injection from %n — we paint moniker next.
      if (base.includes("<#")) base = stripCodes(base);
    }
  } catch {
    /* keep raw base */
  }
  // Display: swap plain name → @moniker / gradient in the prose.
  const moniker = String(
    u.util.displayName?.(target, u.me) ??
      target.name ??
      plainName,
  );
  base = paintMonikerInProse(base, plainName, moniker);
  const gear = composeGearClause(p, items, {
    vehicleName: boardedVehicleName(c, items),
  });
  return assembleLook(base, gear);
}

/** Sync fallback when no SDK (tests) — neutral pronouns. */
export function resolveLookSync(
  name: string,
  c: ISprawlChar,
  items: IDBObj[],
  p?: PronounSet,
  obj?: IDBObj,
): string {
  const pr = p ?? {
    subj: "they",
    obj: "them",
    poss: "their",
    abs: "theirs",
    isAre: "are",
    hasHave: "have",
    wasWere: "were",
    s: "",
  };
  const base = baseParagraph(name, c, pr, obj);
  return assembleLook(
    base,
    composeGearClause(pr, items, {
      vehicleName: boardedVehicleName(c, items),
    }),
  );
}

export function generateLook(
  name: string,
  c: ISprawlChar,
  items: IDBObj[],
): string {
  return resolveLookSync(name, c, items);
}

export function rollAffectation(
  have: string[] = [],
  rng?: () => number,
): { slug: string; name: string; phrase: string } | null {
  const haveLc = new Set(have.map((h) => h.toLowerCase()));
  for (let i = 0; i < 12; i++) {
    const row = pickByRoll(AFFECTATIONS, rollD66(rng));
    if (!row) continue;
    const name = String(row.name);
    if (haveLc.has(name.toLowerCase()) || haveLc.has(row.slug)) {
      continue;
    }
    return {
      slug: row.slug,
      name,
      phrase: String(row.phrase ?? name),
    };
  }
  return null;
}

export function rollAccessory(
  have: string[] = [],
  rng?: () => number,
): { slug: string; name: string; phrase: string } | null {
  const haveLc = new Set(have.map((h) => h.toLowerCase()));
  for (let i = 0; i < 12; i++) {
    const row = pickByRoll(ACCESSORIES, roll2d6Key(rng));
    if (!row) continue;
    if (
      haveLc.has(row.slug) ||
      haveLc.has(String(row.name).toLowerCase())
    ) {
      continue;
    }
    return {
      slug: row.slug,
      name: String(row.name),
      phrase: String(row.phrase ?? row.name),
    };
  }
  return null;
}

export function defaultSlotFor(
  d: SprawlItemData,
): "worn" | "wielded" | "carried" {
  const k = d.kind;
  if (
    k === "firearm" || k === "melee" || k === "heavy" ||
    k === "weapon"
  ) {
    return "wielded";
  }
  if (k === "armor") return "worn";
  return "carried";
}

/**
 * Persist base paragraph via the same field @desc uses
 * (data.description → state.description). Gear is never stored —
 * look hooks append it live.
 */
export async function publishLook(
  u: IUrsamuSDK,
  opts: {
    /** Base paragraph (table gen, +desc/set, or @desc text). */
    base?: string;
    openerSlug?: string;
    items?: IDBObj[];
    /** Force a new opener roll (e.g. +desc/roll). */
    rerollOpener?: boolean;
  },
): Promise<string> {
  const { getChar, saveChar } = await import("./sheet-io.ts");
  const c = getChar(u.me);
  if (!c) return "";

  const p = await pronounsOf(u, u.me);
  const name = String(c.name || u.me.name || "Goon");
  let base = (opts.base ?? "").trim();
  let openerSlug = opts.openerSlug ?? c.lookOpener;

  if (!base) {
    const draft = opts.rerollOpener
      ? { ...c, lookOpener: undefined }
      : c;
    const composed = composeBaseDesc(name, draft, p);
    base = composed.text;
    openerSlug = composed.openerSlug;
  }

  const items = opts.items ?? [];
  // Full look for return value / display only — not written as @desc body
  const full = assembleLook(
    base,
    composeGearClause(p, items, {
      vehicleName: boardedVehicleName(c, items),
    }),
  );
  const next = {
    ...c,
    baseDesc: base,
    lookOpener: openerSlug,
    lookDesc: base, // base only (legacy field)
  };
  await saveChar(u, next);
  // Same path as @desc: data.description (mirrored to state)
  u.me.state = {
    ...u.me.state,
    sprawl: next,
    description: base,
  };
  await u.db.modify(u.me.id, "$set", {
    "data.description": base,
    "state.sprawl": next,
  });
  return full;
}

/**
 * Gear is live at look time — no need to rewrite @desc body.
 * Kept as a no-op hook for wear/stow callers.
 */
export async function refreshGearLook(
  _u: IUrsamuSDK,
  _items: IDBObj[],
): Promise<string | null> {
  return null;
}
