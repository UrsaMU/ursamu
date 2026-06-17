// +info <query> — unified detail lookup across CoFD catalogs.

import {
  COFD_VIRTUES,
  COFD_VICES,
  COFD_MERITS,
  CTL_SEEMINGS,
  CTL_KITHS,
  CTL_COURTS,
  CTL_CONTRACTS,
  type CtlContract,
  WTF_AUSPICES,
  WTF_TRIBES,
  WTF_RENOWN,
  WTF_GIFTS,
  WTF_RITES,
  type WtfAuspice,
  type WtfTribe,
  type WtfRenown,
  type WtfGift,
  type WtfFacet,
  type WtfRite,
} from "../dictionary/index.ts";
import { header, divider, footer } from "../support/format.ts";

const WIDTH = 78;
const INDENT = "  ";
const BODY_WIDTH = WIDTH - INDENT.length;

const visualLen = (s: string): number =>
  s.replace(/%c[a-zA-Z]/g, "").replace(/%[nrtbR]/g, "").length;

function wrap(text: string, width = BODY_WIDTH): string[] {
  const out: string[] = [];
  for (const para of String(text ?? "").split("\n")) {
    if (!para.trim()) { out.push(""); continue; }
    const words = para.split(/\s+/);
    let line = words[0];
    for (let i = 1; i < words.length; i++) {
      if (visualLen(line) + 1 + visualLen(words[i]) > width) {
        out.push(line); line = words[i];
      } else { line += " " + words[i]; }
    }
    if (line) out.push(line);
  }
  return out;
}

function body(text: string): string[] {
  return wrap(text).map((l) => l ? INDENT + l : "");
}

function field(label: string, text: string): string[] {
  if (!text) return [];
  const head = `${INDENT}%ch${label}:%cn `;
  const headW = visualLen(head);
  const wrapped = wrap(text, WIDTH - headW);
  if (wrapped.length === 0) return [head.trimEnd()];
  const lines: string[] = [head + wrapped[0]];
  const pad = " ".repeat(headW);
  for (let i = 1; i < wrapped.length; i++) lines.push(pad + wrapped[i]);
  return lines;
}

// --- Resource loaders for conditions, tilts, dread powers ---

interface RawCondition {
  name: string;
  category?: string;
  persistent?: boolean;
  description?: string;
  effect?: string;
  resolution?: string;
  beats?: number;
}

interface RawTilt {
  name: string;
  scope?: string;
  description?: string;
  effect?: string;
  causing?: string;
  ending?: string;
}

interface RawDreadPower {
  key: string;
  label: string;
  kind?: string;
  tierMin?: string;
  cost?: string;
  pool?: string;
  description?: string;
}

const conditionsUrl = new URL("../../resources/conditions.json", import.meta.url);
const tiltsUrl      = new URL("../../resources/tilts.json", import.meta.url);
const dreadUrl      = new URL("../../resources/dread_powers.json", import.meta.url);

const CONDITIONS: Record<string, RawCondition> = JSON.parse(Deno.readTextFileSync(conditionsUrl));
const TILTS:      Record<string, RawTilt>      = JSON.parse(Deno.readTextFileSync(tiltsUrl));
const DREAD:      RawDreadPower[]              = JSON.parse(Deno.readTextFileSync(dreadUrl));

// --- Renderers per source ---

function renderMerit(m: typeof COFD_MERITS[number]): string[] {
  const out: string[] = [];
  out.push(`${INDENT}%ch%cy${m.name}%cn  %ch%cx[Merit / ${m.category}]%cn`);
  out.push("");
  const dots = m.allowedDots.length === 0
    ? "—"
    : (m.allowedDots.length === 1 ? `${m.allowedDots[0]}` : `${Math.min(...m.allowedDots)}-${Math.max(...m.allowedDots)}`);
  out.push(...field("Dots", dots));
  if (m.instanced) out.push(...field("Instanced", "Yes — one purchase per qualifier."));
  if (m.prereqs.length > 0) out.push(...field("Prereqs", m.prereqs.join(", ")));
  if (m.source) out.push(...field("Source", m.source));
  out.push("");
  out.push(...body("No description in catalog. Consult the source book for full mechanical text."));
  return out;
}

function renderCondition(key: string, c: RawCondition): string[] {
  const out: string[] = [];
  const tag = c.persistent ? "Condition / Persistent" : "Condition";
  out.push(`${INDENT}%ch%cy${c.name}%cn  %ch%cx[${tag}]%cn`);
  out.push("");
  if (c.description) { out.push(...body(c.description)); out.push(""); }
  out.push(...field("Effect", c.effect ?? ""));
  out.push(...field("Resolve", c.resolution ?? ""));
  out.push(...field("Beats", c.beats !== undefined ? String(c.beats) : "—"));
  out.push(...field("Key", key));
  return out;
}

function renderTilt(key: string, t: RawTilt): string[] {
  const out: string[] = [];
  const scope = t.scope ? `Tilt / ${t.scope}` : "Tilt";
  out.push(`${INDENT}%ch%cy${t.name}%cn  %ch%cx[${scope}]%cn`);
  out.push("");
  if (t.description) { out.push(...body(t.description)); out.push(""); }
  out.push(...field("Effect", t.effect ?? ""));
  out.push(...field("Causing", t.causing ?? ""));
  out.push(...field("Ending", t.ending ?? ""));
  out.push(...field("Key", key));
  return out;
}

function renderDread(d: RawDreadPower): string[] {
  const out: string[] = [];
  const tier = d.tierMin ? ` / min ${d.tierMin}` : "";
  out.push(`${INDENT}%ch%cy${d.label}%cn  %ch%cx[Dread Power${tier}]%cn`);
  out.push("");
  if (d.description) { out.push(...body(d.description)); out.push(""); }
  out.push(...field("Cost", d.cost ?? ""));
  out.push(...field("Pool", d.pool ?? ""));
  out.push(...field("Key", d.key));
  return out;
}

function renderVirtue(v: typeof COFD_VIRTUES[number]): string[] {
  const out: string[] = [];
  out.push(`${INDENT}%ch%cy${v.name}%cn  %ch%cx[Virtue]%cn`);
  out.push("");
  out.push(...body(v.description));
  out.push("");
  out.push(...field("Willpower", v.willpowerTrigger));
  return out;
}

function renderVice(v: typeof COFD_VICES[number]): string[] {
  const out: string[] = [];
  out.push(`${INDENT}%ch%cy${v.name}%cn  %ch%cx[Vice]%cn`);
  out.push("");
  out.push(...body(v.description));
  out.push("");
  out.push(...field("Willpower", v.willpowerTrigger));
  return out;
}

function renderSeeming(s: typeof CTL_SEEMINGS[number]): string[] {
  const out: string[] = [];
  out.push(`${INDENT}%ch%cy${s.name}%cn  %ch%cx[Seeming]%cn`);
  out.push("");
  out.push(...body(s.description));
  out.push("");
  out.push(...field("Blessing", s.blessing));
  out.push(...field("Curse", s.curse));
  return out;
}

function renderKith(k: typeof CTL_KITHS[number]): string[] {
  const out: string[] = [];
  out.push(`${INDENT}%ch%cy${k.name}%cn  %ch%cx[Kith / ${k.seeming}]%cn`);
  out.push("");
  out.push(...body(k.description));
  out.push("");
  out.push(...field("Blessing", k.blessing));
  return out;
}

function renderCourt(c: typeof CTL_COURTS[number]): string[] {
  const out: string[] = [];
  out.push(`${INDENT}%ch%cy${c.name}%cn  %ch%cx[Court / ${c.emotion}]%cn`);
  out.push("");
  out.push(...body(c.description));
  out.push("");
  out.push(...field("Mantle", c.mantleNotes));
  out.push(...field("Contracts", c.contractDiscount));
  return out;
}

function renderAuspice(a: WtfAuspice): string[] {
  const out: string[] = [];
  out.push(`${INDENT}%ch%cy${a.name}%cn  %ch%cx[Auspice / ${a.moon}]%cn`);
  out.push("");
  out.push(...body(a.description));
  out.push("");
  out.push(...field("Renown", a.renown));
  out.push(...field("Hunter's Aspect", a.hunterAspect));
  out.push(...field("Skills", a.skills.join(", ")));
  out.push(...field("Benefit", a.benefit));
  return out;
}

function renderTribe(t: WtfTribe): string[] {
  const out: string[] = [];
  out.push(`${INDENT}%ch%cy${t.name}%cn  %ch%cx[Tribe]%cn`);
  out.push("");
  out.push(...body(t.description));
  out.push("");
  out.push(...field("Firstborn", t.firstborn));
  out.push(...field("Renown", t.renown));
  out.push(...field("Gifts", t.gifts.length > 0 ? t.gifts.join(", ") : "None"));
  out.push(...field("Ban", t.ban));
  return out;
}

function renderRenownInfo(r: WtfRenown): string[] {
  const out: string[] = [];
  out.push(`${INDENT}%ch%cy${r.name}%cn  %ch%cx[Renown]%cn`);
  out.push("");
  out.push(...body(r.description));
  out.push("");
  out.push(...field("Auspice", r.auspice));
  out.push(...field("Tribe", r.tribe));
  return out;
}

function renderGiftInfo(g: WtfGift): string[] {
  const out: string[] = [];
  const kind = g.type === "moon"
    ? `Moon Gift / ${g.auspice}`
    : g.type === "shadow"
    ? "Shadow Gift"
    : "Wolf Gift";
  out.push(`${INDENT}%ch%cy${g.name}%cn  %ch%cx[${kind}]%cn`);
  out.push("");
  for (const f of g.facets) {
    const dotStr = g.type === "moon" && f.dots ? `${"*".repeat(f.dots)} ` : "";
    out.push(`${INDENT}%ch${f.name}%cn  %cx[${dotStr}${f.renown}]%cn`);
    out.push(...body(f.summary));
  }
  return out;
}

function renderFacet(g: WtfGift, f: WtfFacet): string[] {
  const out: string[] = [];
  const dotStr = g.type === "moon" && f.dots ? ` ${"*".repeat(f.dots)}` : "";
  out.push(`${INDENT}%ch%cy${f.name}%cn  %ch%cx[Facet / ${f.renown}${dotStr}]%cn`);
  out.push("");
  out.push(...body(f.summary));
  out.push("");
  out.push(...field("Gift", g.name));
  out.push(...field("Cost", f.cost));
  out.push(...field("Dice Pool", f.dicePool));
  out.push(...field("Action", f.action));
  out.push(...field("Duration", f.duration));
  return out;
}

function renderRite(r: WtfRite): string[] {
  const out: string[] = [];
  out.push(`${INDENT}%ch%cy${r.name}%cn  %ch%cx[${r.type === "wolf" ? "Wolf" : "Pack"} Rite / ${"*".repeat(r.rank)}]%cn`);
  out.push("");
  out.push(...body(r.summary));
  out.push("");
  out.push(...field("Cost", r.cost));
  out.push(...field("Dice Pool", r.dicePool));
  out.push(...field("Action", r.action));
  out.push(...field("Duration", r.duration));
  return out;
}

function renderContract(c: CtlContract): string[] {
  const out: string[] = [];
  const kind = c.type === "arcadian"
    ? `${c.regalia} Regalia / ${c.tier === "royal" ? "Royal" : "Common"}`
    : c.type === "court"
    ? `${c.court} Court / ${c.tier === "royal" ? "Royal" : "Common"}`
    : "Goblin";
  out.push(`${INDENT}%ch%cy${c.name}%cn  %ch%cx[Contract / ${kind}]%cn`);
  out.push("");
  out.push(...body(c.effect));
  out.push("");
  out.push(...field("Cost", c.cost));
  out.push(...field("Dice Pool", c.dicePool));
  out.push(...field("Action", c.action));
  out.push(...field("Duration", c.duration));
  out.push(...field("Loophole", c.loophole));
  for (const sc of c.seemingClauses) {
    out.push(...field(sc.seeming, sc.effect));
  }
  return out;
}

// --- Search index ---

interface Hit {
  name: string;
  category: string;
  render: () => string[];
}

function buildHits(query: string): Hit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const hits: Hit[] = [];
  const eq = (a: string) => a.toLowerCase() === q;
  const contains = (a: string) => a.toLowerCase().includes(q);

  for (const m of COFD_MERITS) {
    if (eq(m.name) || eq(m.key)) hits.push({ name: m.name, category: `Merit/${m.category}`, render: () => renderMerit(m) });
  }
  for (const v of COFD_VIRTUES) if (eq(v.name)) hits.push({ name: v.name, category: "Virtue", render: () => renderVirtue(v) });
  for (const v of COFD_VICES)   if (eq(v.name)) hits.push({ name: v.name, category: "Vice", render: () => renderVice(v) });
  for (const s of CTL_SEEMINGS) if (eq(s.name)) hits.push({ name: s.name, category: "Seeming", render: () => renderSeeming(s) });
  for (const k of CTL_KITHS)    if (eq(k.name)) hits.push({ name: k.name, category: `Kith/${k.seeming}`, render: () => renderKith(k) });
  for (const c of CTL_COURTS)   if (eq(c.name)) hits.push({ name: c.name, category: "Court", render: () => renderCourt(c) });
  for (const c of CTL_CONTRACTS) if (eq(c.name)) hits.push({ name: c.name, category: `Contract/${c.type}`, render: () => renderContract(c) });

  for (const [key, c] of Object.entries(CONDITIONS)) {
    if (eq(c.name) || eq(key)) hits.push({ name: c.name, category: "Condition", render: () => renderCondition(key, c) });
  }
  for (const [key, t] of Object.entries(TILTS)) {
    if (eq(t.name) || eq(key)) hits.push({ name: t.name, category: "Tilt", render: () => renderTilt(key, t) });
  }
  for (const d of DREAD) if (eq(d.label) || eq(d.key)) hits.push({ name: d.label, category: "Dread Power", render: () => renderDread(d) });

  for (const a of WTF_AUSPICES) if (eq(a.name)) hits.push({ name: a.name, category: "Auspice", render: () => renderAuspice(a) });
  for (const t of WTF_TRIBES)   if (eq(t.name)) hits.push({ name: t.name, category: "Tribe", render: () => renderTribe(t) });
  for (const r of WTF_RENOWN)   if (eq(r.name)) hits.push({ name: r.name, category: "Renown", render: () => renderRenownInfo(r) });
  for (const g of WTF_GIFTS) {
    if (eq(g.name)) hits.push({ name: g.name, category: `Gift/${g.type}`, render: () => renderGiftInfo(g) });
    for (const f of g.facets) if (eq(f.name)) hits.push({ name: f.name, category: `Facet/${f.renown}`, render: () => renderFacet(g, f) });
  }
  for (const r of WTF_RITES)    if (eq(r.name)) hits.push({ name: r.name, category: `${r.type === "wolf" ? "Wolf" : "Pack"} Rite`, render: () => renderRite(r) });

  if (hits.length > 0) return hits;

  // Fall back to substring match if nothing matched exactly.
  for (const m of COFD_MERITS) {
    if (contains(m.name) || contains(m.key)) hits.push({ name: m.name, category: `Merit/${m.category}`, render: () => renderMerit(m) });
  }
  for (const v of COFD_VIRTUES) if (contains(v.name)) hits.push({ name: v.name, category: "Virtue", render: () => renderVirtue(v) });
  for (const v of COFD_VICES)   if (contains(v.name)) hits.push({ name: v.name, category: "Vice", render: () => renderVice(v) });
  for (const s of CTL_SEEMINGS) if (contains(s.name)) hits.push({ name: s.name, category: "Seeming", render: () => renderSeeming(s) });
  for (const k of CTL_KITHS)    if (contains(k.name)) hits.push({ name: k.name, category: `Kith/${k.seeming}`, render: () => renderKith(k) });
  for (const c of CTL_COURTS)   if (contains(c.name)) hits.push({ name: c.name, category: "Court", render: () => renderCourt(c) });
  for (const c of CTL_CONTRACTS) if (contains(c.name)) hits.push({ name: c.name, category: `Contract/${c.type}`, render: () => renderContract(c) });
  for (const [key, c] of Object.entries(CONDITIONS)) {
    if (contains(c.name) || contains(key)) hits.push({ name: c.name, category: "Condition", render: () => renderCondition(key, c) });
  }
  for (const [key, t] of Object.entries(TILTS)) {
    if (contains(t.name) || contains(key)) hits.push({ name: t.name, category: "Tilt", render: () => renderTilt(key, t) });
  }
  for (const d of DREAD) if (contains(d.label) || contains(d.key)) hits.push({ name: d.label, category: "Dread Power", render: () => renderDread(d) });

  for (const a of WTF_AUSPICES) if (contains(a.name)) hits.push({ name: a.name, category: "Auspice", render: () => renderAuspice(a) });
  for (const t of WTF_TRIBES)   if (contains(t.name)) hits.push({ name: t.name, category: "Tribe", render: () => renderTribe(t) });
  for (const r of WTF_RENOWN)   if (contains(r.name)) hits.push({ name: r.name, category: "Renown", render: () => renderRenownInfo(r) });
  for (const g of WTF_GIFTS) {
    if (contains(g.name)) hits.push({ name: g.name, category: `Gift/${g.type}`, render: () => renderGiftInfo(g) });
    for (const f of g.facets) if (contains(f.name)) hits.push({ name: f.name, category: `Facet/${f.renown}`, render: () => renderFacet(g, f) });
  }
  for (const r of WTF_RITES)    if (contains(r.name)) hits.push({ name: r.name, category: `${r.type === "wolf" ? "Wolf" : "Pack"} Rite`, render: () => renderRite(r) });

  return hits;
}

/**
 * Render +info <query>. Returns the formatted output string.
 * Empty query shows usage. Multiple hits = list of matches with categories.
 * Single hit = full detail. No hits = friendly error.
 */
export function renderInfo(query: string): string {
  const trimmed = query.trim();
  if (!trimmed) {
    const out: string[] = [header("Info — Usage"), ""];
    out.push(...body("+info <name>  — Look up a merit, condition, tilt, dread power, virtue, vice, seeming, kith, or court."));
    out.push("");
    out.push(...body("For browse lists by topic, see +cg/list."));
    out.push(...body("Disciplines and individual Contracts are not yet catalogued in this game; consult the source books."));
    out.push(footer());
    return out.join("\n");
  }

  const hits = buildHits(trimmed);

  if (hits.length === 0) {
    const out: string[] = [header(`Info — ${trimmed}`), ""];
    out.push(...body(`No catalog entry matches '${trimmed}'.`));
    out.push("");
    out.push(...body("Try +cg/list to browse the catalogs we do have. Disciplines and individual Contracts are not yet catalogued in this game."));
    out.push(footer());
    return out.join("\n");
  }

  if (hits.length === 1) {
    const out: string[] = [header(`Info — ${hits[0].name}`), ""];
    out.push(...hits[0].render());
    out.push(footer());
    return out.join("\n");
  }

  // Multiple hits — list them with tags.
  const out: string[] = [header(`Info — Multiple matches for '${trimmed}'`), ""];
  for (const h of hits.slice(0, 30)) {
    out.push(`${INDENT}%ch%cy${h.name}%cn  %ch%cx[${h.category}]%cn`);
  }
  if (hits.length > 30) {
    out.push("");
    out.push(...body(`...and ${hits.length - 30} more. Narrow your query.`));
  }
  out.push("");
  out.push(...body("Repeat with the exact name (case-insensitive) for full detail."));
  out.push(divider("", "-"));
  out.push(footer());
  return out.join("\n");
}
