// Render `+cg/list` output. Uses the cofd plugin's shared header/divider/
// footer helpers so the formatting matches +look and the rest of +cg.

import {
  COFD_VIRTUES,
  COFD_VICES,
  COFD_MERITS,
  CTL_SEEMINGS,
  CTL_COURTS,
  kithsForSeeming,
  findSeeming,
  WTF_AUSPICES,
  WTF_TRIBES,
  WTF_RENOWN,
  WTF_GIFTS,
  WTF_RITES,
  giftsByType,
  findGift,
  type WtfGift,
  CTL_REGALIA,
  CTL_CONTRACTS,
  contractsByRegalia,
  contractsByCourt,
  goblinContracts,
  type CtlContract,
} from "../dictionary/index.ts";
import { COFD_TEMPLATES } from "../gamelines/templates.ts";
import { header, divider, footer } from "../support/format.ts";

const WIDTH = 78;
const INDENT = "  ";
const BODY_WIDTH = WIDTH - INDENT.length;

const visualLen = (s: string): number =>
  s.replace(/%c[a-zA-Z]/g, "").replace(/%[nrtbR]/g, "").length;

function wrapBody(text: string, width = BODY_WIDTH): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
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
  return wrapBody(text).map((l) => l ? INDENT + l : "");
}

function columns(items: string[], cols: number): string[] {
  if (items.length === 0) return [];
  const colW = Math.floor((WIDTH - INDENT.length) / cols);
  const rows: string[] = [];
  for (let i = 0; i < items.length; i += cols) {
    const row = items.slice(i, i + cols).map((c, idx) => {
      if (idx === cols - 1) return c;
      const pad = Math.max(1, colW - visualLen(c));
      return c + " ".repeat(pad);
    });
    rows.push(INDENT + row.join(""));
  }
  return rows;
}

function fieldBlock(label: string, text: string): string[] {
  const head = `${INDENT}%ch${label}:%cn `;
  const headW = visualLen(head);
  const wrapped = wrapBody(text, WIDTH - headW);
  if (wrapped.length === 0) return [head.trimEnd()];
  const out: string[] = [head + wrapped[0]];
  const pad = " ".repeat(headW);
  for (let i = 1; i < wrapped.length; i++) out.push(pad + wrapped[i]);
  return out;
}

const INDEX = [
  { key: "virtues",   note: "CoFD core anchors — pick one" },
  { key: "vices",     note: "CoFD core anchors — pick one" },
  { key: "templates", note: "Supernatural templates available on this game" },
  { key: "seemings",  note: "Changeling: the six seemings, blessings, curses" },
  { key: "kiths",     note: "Changeling: all kiths, or filter by seeming" },
  { key: "courts",    note: "Changeling: the four seasonal courts" },
  { key: "regalia",   note: "Changeling: the six Contract Regalia (favored field)" },
  { key: "contracts", note: "Changeling: Contracts by Regalia, Court, or Goblin" },
  { key: "auspices",  note: "Werewolf: the five auspices, moons, Renown, aspects" },
  { key: "tribes",    note: "Werewolf: the five tribes plus the Ghost Wolves" },
  { key: "renown",    note: "Werewolf: the five Renown" },
  { key: "gifts",     note: "Werewolf: Gifts by kind — or filter by gift name" },
  { key: "rites",     note: "Werewolf: Wolf and Pack rites by rank" },
  { key: "merits",    note: "Merits by category — or filter by category name" },
];

function renderIndex(): string {
  const out: string[] = [];
  out.push(header("Chargen — Available Lists"));
  out.push("");
  out.push(...body("Use +cg/list <topic> to see options for that field."));
  out.push("");
  for (const e of INDEX) {
    out.push(`${INDENT}%ch${e.key.padEnd(11)}%cn  ${e.note}`);
  }
  out.push("");
  out.push(`${INDENT}Examples:`);
  out.push(`${INDENT}  +cg/list virtues`);
  out.push(`${INDENT}  +cg/list kiths           (all kiths)`);
  out.push(`${INDENT}  +cg/list kiths beast     (kiths for Beast only)`);
  out.push(`${INDENT}  +cg/list gifts           (all gifts by kind)`);
  out.push(`${INDENT}  +cg/list gifts rage      (facets of the Gift of Rage)`);
  out.push(`${INDENT}  +cg/list rites           (all rites by rank)`);
  out.push("");
  out.push(...body("Free-form fields (no canonical list): concept, needle, thread, name. Write what fits your character."));
  out.push(footer());
  return out.join("\n");
}

function renderVirtues(): string {
  const out: string[] = [header("Virtues"), ""];
  for (const v of COFD_VIRTUES) {
    out.push(`${INDENT}%ch%cy${v.name}%cn`);
    out.push(...body(v.description));
    out.push("");
    out.push(...fieldBlock("Willpower", v.willpowerTrigger));
    out.push("");
  }
  out.push(footer());
  return out.join("\n");
}

function renderVices(): string {
  const out: string[] = [header("Vices"), ""];
  for (const v of COFD_VICES) {
    out.push(`${INDENT}%ch%cy${v.name}%cn`);
    out.push(...body(v.description));
    out.push("");
    out.push(...fieldBlock("Willpower", v.willpowerTrigger));
    out.push("");
  }
  out.push(footer());
  return out.join("\n");
}

function renderTemplates(): string {
  const out: string[] = [header("Templates"), ""];
  for (const key of Object.keys(COFD_TEMPLATES).sort()) {
    const t = COFD_TEMPLATES[key];
    out.push(`${INDENT}%ch%cy${t.name}%cn  (key: ${key})`);
    out.push(...fieldBlock("Morality", t.moralityName));
    if (t.powerStatName && t.powerStatName !== "None") out.push(...fieldBlock("Power", t.powerStatName));
    if (t.energyName && t.energyName !== "None") out.push(...fieldBlock("Energy", t.energyName));
    if (t.customFields.length > 0) out.push(...fieldBlock("Fields", t.customFields.join(", ")));
    if (t.validPowers.length > 0) out.push(...fieldBlock("Powers", t.validPowers.join(", ")));
    out.push("");
  }
  out.push(footer());
  return out.join("\n");
}

function renderSeemings(): string {
  const out: string[] = [header("Changeling — Seemings"), ""];
  for (const s of CTL_SEEMINGS) {
    out.push(`${INDENT}%ch%cy${s.name}%cn`);
    out.push(...body(s.description));
    out.push("");
    out.push(...fieldBlock("Blessing", s.blessing));
    out.push(...fieldBlock("Curse", s.curse));
    out.push("");
  }
  out.push(footer());
  return out.join("\n");
}

function renderKiths(filter?: string): string {
  if (filter) {
    const seeming = findSeeming(filter);
    if (!seeming) {
      const out: string[] = [header("Changeling — Kiths"), ""];
      out.push(...body(`No seeming named '${filter}'.`));
      out.push(...body(`Try: ${CTL_SEEMINGS.map((s) => s.name).join(", ")}`));
      out.push("");
      out.push(...body("Or omit the filter: +cg/list kiths"));
      out.push(footer());
      return out.join("\n");
    }
    const out: string[] = [header(`Changeling — Kiths of the ${seeming.name}`), ""];
    for (const k of kithsForSeeming(seeming.name)) {
      out.push(`${INDENT}%ch%cy${k.name}%cn`);
      out.push(...body(k.description));
      out.push("");
      out.push(...fieldBlock("Blessing", k.blessing));
      out.push("");
    }
    out.push(footer());
    return out.join("\n");
  }

  const out: string[] = [header("Changeling — Kiths"), ""];
  for (const s of CTL_SEEMINGS) {
    const ks = kithsForSeeming(s.name);
    if (ks.length === 0) continue;
    out.push(divider(s.name));
    out.push(...columns(ks.map((k) => `%ch%cy${k.name}%cn`), 3));
    out.push("");
  }
  out.push(...body("For details on a seeming's kiths:  +cg/list kiths <seeming>"));
  out.push(footer());
  return out.join("\n");
}

function renderCourts(): string {
  const out: string[] = [header("Changeling — Courts"), ""];
  for (const c of CTL_COURTS) {
    out.push(`${INDENT}%ch%cy${c.name}%cn  (${c.emotion})`);
    out.push(...body(c.description));
    out.push("");
    out.push(...fieldBlock("Mantle", c.mantleNotes));
    out.push(...fieldBlock("Contracts", c.contractDiscount));
    out.push("");
  }
  out.push(footer());
  return out.join("\n");
}

function renderAuspices(): string {
  const out: string[] = [header("Werewolf — Auspices"), ""];
  for (const a of WTF_AUSPICES) {
    out.push(`${INDENT}%ch%cy${a.name}%cn  (${a.moon})`);
    out.push(...body(a.description));
    out.push("");
    out.push(...fieldBlock("Renown", a.renown));
    out.push(...fieldBlock("Aspect", a.hunterAspect));
    out.push(...fieldBlock("Skills", a.skills.join(", ")));
    out.push(...fieldBlock("Benefit", a.benefit));
    out.push("");
  }
  out.push(footer());
  return out.join("\n");
}

function renderTribes(): string {
  const out: string[] = [header("Werewolf — Tribes"), ""];
  for (const t of WTF_TRIBES) {
    out.push(`${INDENT}%ch%cy${t.name}%cn`);
    out.push(...body(t.description));
    out.push("");
    out.push(...fieldBlock("Firstborn", t.firstborn));
    out.push(...fieldBlock("Renown", t.renown));
    out.push(...fieldBlock("Gifts", t.gifts.length > 0 ? t.gifts.join(", ") : "None"));
    out.push(...fieldBlock("Ban", t.ban));
    out.push("");
  }
  out.push(footer());
  return out.join("\n");
}

function renderRenown(): string {
  const out: string[] = [header("Werewolf — Renown"), ""];
  for (const r of WTF_RENOWN) {
    out.push(`${INDENT}%ch%cy${r.name}%cn`);
    out.push(...body(r.description));
    out.push("");
    out.push(...fieldBlock("Auspice", r.auspice));
    out.push(...fieldBlock("Tribe", r.tribe));
    out.push("");
  }
  out.push(footer());
  return out.join("\n");
}

const GIFT_KIND_LABELS: Record<string, string> = {
  moon: "Moon Gifts",
  shadow: "Shadow Gifts",
  wolf: "Wolf Gifts",
};

function dotMark(n: number): string {
  return "*".repeat(Math.max(0, Math.min(5, n)));
}

function findGiftFuzzy(filter: string): WtfGift | WtfGift[] | null {
  const q = filter.trim().toLowerCase();
  const exact = findGift(filter);
  if (exact) return exact;
  // Strip the common scaffolding words so "rage" matches "Gift of Rage" and
  // "crescent" matches "Crescent Moon's Gift".
  const matches = WTF_GIFTS.filter((g) => {
    const core = g.name.toLowerCase()
      .replace(/^gift of (the )?/, "")
      .replace(/'s gift$/, "")
      .replace(/ moon$/, "");
    return g.name.toLowerCase().includes(q) || core.includes(q) || q.includes(core);
  });
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) return matches;
  return null;
}

function renderGifts(filter?: string): string {
  if (filter) {
    const found = findGiftFuzzy(filter);
    if (Array.isArray(found)) {
      const out: string[] = [header("Werewolf — Gifts"), ""];
      out.push(...body(`Several gifts match '${filter}'. Did you mean:`));
      out.push("");
      out.push(...columns(found.map((g) => `%ch%cy${g.name}%cn`), 2));
      out.push(footer());
      return out.join("\n");
    }
    const gift = found;
    if (!gift) {
      const out: string[] = [header("Werewolf — Gifts"), ""];
      out.push(...body(`No gift named '${filter}'.`));
      out.push(...body("Tip: try the short name, e.g. 'rage' for Gift of Rage, or 'crescent' for the Crescent Moon's Gift."));
      out.push("");
      out.push(...body("Or omit the filter: +cg/list gifts"));
      out.push(footer());
      return out.join("\n");
    }
    const kindNote = gift.type === "moon"
      ? `Moon Gift — ${gift.auspice} (${gift.renownAffinity})`
      : gift.type === "shadow"
      ? "Shadow Gift"
      : "Wolf Gift";
    const out: string[] = [header(`Werewolf — ${gift.name}`), ""];
    out.push(...body(kindNote));
    out.push("");
    for (const f of gift.facets) {
      const tag = gift.type === "moon" && f.dots
        ? `%ch%cx[${dotMark(f.dots)} ${f.renown}]%cn`
        : `%ch%cx[${f.renown}]%cn`;
      out.push(`${INDENT}%ch%cy${f.name}%cn  ${tag}`);
      out.push(...body(f.summary));
      const meta: string[] = [];
      if (f.cost && f.cost !== "—") meta.push(`Cost: ${f.cost}`);
      if (f.dicePool && f.dicePool !== "—") meta.push(`Pool: ${f.dicePool}`);
      if (f.action && f.action !== "—") meta.push(`Action: ${f.action}`);
      if (f.duration && f.duration !== "—") meta.push(`Duration: ${f.duration}`);
      for (const m of meta) out.push(...fieldBlock(m.split(":")[0], m.split(":").slice(1).join(":").trim()));
      out.push("");
    }
    out.push(footer());
    return out.join("\n");
  }

  const out: string[] = [header("Werewolf — Gifts"), ""];
  for (const kind of ["moon", "shadow", "wolf"] as const) {
    const list = giftsByType(kind);
    if (list.length === 0) continue;
    out.push(divider(GIFT_KIND_LABELS[kind]));
    out.push(...columns(list.map((g) => `%ch%cy${g.name}%cn`), 2));
    out.push("");
  }
  out.push(...body("For the facets of a gift:  +cg/list gifts <gift name>"));
  out.push(footer());
  return out.join("\n");
}

function renderRites(): string {
  const out: string[] = [header("Werewolf — Rites"), ""];
  for (const kind of ["wolf", "pack"] as const) {
    const list = WTF_RITES.filter((r) => r.type === kind)
      .slice()
      .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
    if (list.length === 0) continue;
    out.push(divider(kind === "wolf" ? "Wolf Rites" : "Pack Rites"));
    for (const r of list) {
      out.push(`${INDENT}%ch%cy${r.name}%cn  %ch%cx[${dotMark(r.rank)}]%cn`);
      out.push(...body(r.summary));
      out.push("");
    }
  }
  out.push(footer());
  return out.join("\n");
}

function renderRegalia(): string {
  const out: string[] = [header("Changeling — Regalia"), ""];
  out.push(...body("The six Arcadian Regalia. Each seeming has one favored Regalia; you choose a second for the 'favored' field in chargen."));
  out.push("");
  for (const r of CTL_REGALIA) {
    out.push(`${INDENT}%ch%cy${r.name}%cn  (favored by ${r.favoredBy})`);
    out.push(...body(r.description));
    out.push(...fieldBlock("Contracts", `${contractsByRegalia(r.name).length} — see +cg/list contracts ${r.name.toLowerCase()}`));
    out.push("");
  }
  out.push(footer());
  return out.join("\n");
}

function contractEntry(c: CtlContract): string {
  const tag = c.tier === "royal" ? "*" : c.tier === "goblin" ? "+" : "";
  return `%ch%cy${c.name}%cn${tag}`;
}

function renderContracts(filter?: string): string {
  if (filter) {
    const q = filter.trim().toLowerCase();
    const reg = CTL_REGALIA.find((r) => r.name.toLowerCase() === q);
    if (reg) {
      const list = contractsByRegalia(reg.name);
      const out: string[] = [header(`Contracts — ${reg.name} Regalia`), ""];
      out.push(...body(reg.description));
      out.push("");
      out.push(...columns(list.map(contractEntry), 2));
      out.push("");
      out.push(...body("* = Royal.  +info <name> for full detail."));
      out.push(footer());
      return out.join("\n");
    }
    if (q === "goblin") {
      const out: string[] = [header("Contracts — Goblin"), ""];
      out.push(...columns(goblinContracts().map(contractEntry), 2));
      out.push("");
      out.push(...body("+ = Goblin (incurs Goblin Debt).  +info <name> for full detail."));
      out.push(footer());
      return out.join("\n");
    }
    const court = CTL_COURTS.find((c) => c.name.toLowerCase() === q);
    if (court) {
      const list = contractsByCourt(court.name);
      const out: string[] = [header(`Contracts — ${court.name} Court`), ""];
      out.push(...columns(list.map(contractEntry), 2));
      out.push("");
      out.push(...body("* = Royal.  +info <name> for full detail."));
      out.push(footer());
      return out.join("\n");
    }
    const out: string[] = [header("Contracts"), ""];
    out.push(...body(`No Regalia, Court, or 'goblin' named '${filter}'.`));
    out.push(...body(`Regalia: ${CTL_REGALIA.map((r) => r.name).join(", ")}.`));
    out.push(...body(`Courts: ${CTL_COURTS.map((c) => c.name).join(", ")}.  Plus: goblin.`));
    out.push(footer());
    return out.join("\n");
  }

  const out: string[] = [header("Contracts"), ""];
  out.push(...body("Contracts come in three kinds. Filter with +cg/list contracts <group>."));
  out.push("");
  out.push(divider("Arcadian Regalia"));
  for (const r of CTL_REGALIA) {
    out.push(`${INDENT}%ch${r.name.padEnd(8)}%cn ${contractsByRegalia(r.name).length} contracts  (favored by ${r.favoredBy})`);
  }
  out.push("");
  out.push(divider("Courts"));
  for (const c of CTL_COURTS) {
    out.push(`${INDENT}%ch${c.name.padEnd(8)}%cn ${contractsByCourt(c.name).length} contracts`);
  }
  out.push("");
  out.push(divider("Goblin"));
  out.push(`${INDENT}%chgoblin%cn   ${goblinContracts().length} contracts`);
  out.push("");
  out.push(...body(`${CTL_CONTRACTS.length} Contracts total. Example: +cg/list contracts crown`));
  out.push(footer());
  return out.join("\n");
}

function dots(allowed: number[]): string {
  if (allowed.length === 0) return "";
  if (allowed.length === 1) return `${allowed[0]}`;
  const sorted = [...allowed].sort((a, b) => a - b);
  return `${sorted[0]}-${sorted[sorted.length - 1]}`;
}

function renderMerits(filter?: string): string {
  const cats = new Map<string, typeof COFD_MERITS>();
  for (const m of COFD_MERITS) {
    if (!cats.has(m.category)) cats.set(m.category, []);
    cats.get(m.category)!.push(m);
  }

  if (filter) {
    const q = filter.trim().toLowerCase();
    const match = Array.from(cats.keys()).find((c) => c.toLowerCase() === q);
    if (!match) {
      const out: string[] = [header("Merits"), ""];
      out.push(...body(`No merit category named '${filter}'.`));
      out.push(...body(`Try: ${Array.from(cats.keys()).join(", ")}`));
      out.push("");
      out.push(...body("Or omit the filter: +cg/list merits"));
      out.push(footer());
      return out.join("\n");
    }
    const list = cats.get(match)!.slice().sort((a, b) => a.name.localeCompare(b.name));
    const entries = list.map((m) => {
      const d = dots(m.allowedDots);
      const dotStr = d ? ` (${d})` : "";
      const inst = m.instanced ? "*" : "";
      return `%ch%cy${m.name}%cn${dotStr}${inst}`;
    });
    const out: string[] = [header(`Merits — ${match}`), ""];
    out.push(...columns(entries, 2));
    out.push("");
    out.push(...body("* = instanced (one purchase per qualifier, e.g. Language: Spanish vs. Russian)."));
    out.push(footer());
    return out.join("\n");
  }

  const out: string[] = [header("Merits"), ""];
  for (const cat of Array.from(cats.keys()).sort()) {
    out.push(divider(cat));
    out.push(...body(`${cats.get(cat)!.length} merits.  +cg/list merits ${cat.toLowerCase()}`));
    out.push("");
  }
  out.push(...body("Use +cg/list merits <category> to see merit names and dot ranges."));
  out.push(footer());
  return out.join("\n");
}

/**
 * Render the +cg/list output. `arg` is the raw text after `/list ` —
 * `""` shows the index, otherwise it's a topic name (with optional filter).
 */
export function renderCgList(arg: string): string {
  const trimmed = arg.trim();
  if (!trimmed) return renderIndex();

  const parts = trimmed.split(/\s+/);
  const topic = parts[0].toLowerCase();
  const filter = parts.slice(1).join(" ");

  switch (topic) {
    case "virtue": case "virtues":     return renderVirtues();
    case "vice": case "vices":         return renderVices();
    case "template": case "templates": return renderTemplates();
    case "seeming": case "seemings":   return renderSeemings();
    case "kith": case "kiths":         return renderKiths(filter);
    case "court": case "courts":       return renderCourts();
    case "regalia":                    return renderRegalia();
    case "contract": case "contracts": return renderContracts(filter);
    case "auspice": case "auspices":   return renderAuspices();
    case "tribe": case "tribes":       return renderTribes();
    case "renown":                     return renderRenown();
    case "gift": case "gifts":         return renderGifts(filter);
    case "rite": case "rites":         return renderRites();
    case "merit": case "merits":       return renderMerits(filter);
    default: {
      const out: string[] = [header("Chargen — List"), ""];
      out.push(...body(`Unknown topic '${trimmed}'.`));
      out.push("");
      out.push(...body("Try: +cg/list  (no arg)  to see the available topics."));
      out.push(footer());
      return out.join("\n");
    }
  }
}
