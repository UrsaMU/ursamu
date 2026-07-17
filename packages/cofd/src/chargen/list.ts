// Render `+cg/list` output. Uses the cofd plugin's shared header/divider/
// footer helpers so the formatting matches +look and the rest of +cg.
// All list screens target ≤22 content lines (24-line telnet terminal).
// Long topics use a compact "index" view by default; a <name> filter
// triggers a single-entry "detail" view.

import {
  COFD_VIRTUES,
  COFD_VICES,
  COFD_MERITS,
  CTL_SEEMINGS,
  CTL_COURTS,
  kithsForSeeming,
  findSeeming,
  findCourt,
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
import { header, divider, footer } from "@ursamu/mush";

const WIDTH = 78;
const INDENT = "  ";
const BODY_WIDTH = WIDTH - INDENT.length;

const visualLen = (s: string): number =>
  s.replace(/%c[a-zA-Z]/g, "").replace(/%[nrtbR]/g, "").length;

function wrapBody(text: string, width = BODY_WIDTH): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    if (!para.trim()) {
      out.push("");
      continue;
    }
    const words = para.split(/\s+/);
    let line = words[0];
    for (let i = 1; i < words.length; i++) {
      if (visualLen(line) + 1 + visualLen(words[i]) > width) {
        out.push(line);
        line = words[i];
      } else {
        line += " " + words[i];
      }
    }
    if (line) out.push(line);
  }
  return out;
}

function body(text: string): string[] {
  return wrapBody(text).map((l) => (l ? INDENT + l : ""));
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
  { key: "virtues", note: "CoFD core anchors — pick one" },
  { key: "vices", note: "CoFD core anchors — pick one" },
  { key: "templates", note: "Supernatural templates available on this game" },
  {
    key: "seemings",
    note: "Changeling: the six seemings (add name for detail)",
  },
  { key: "kiths", note: "Changeling: all kiths, or filter by seeming" },
  { key: "courts", note: "Changeling: the four seasonal courts" },
  { key: "regalia", note: "Changeling: the six Contract Regalia" },
  { key: "contracts", note: "Changeling: Contracts by Regalia, Court, or Goblin" },
  {
    key: "auspices",
    note: "Werewolf: the five auspices (add name for detail)",
  },
  {
    key: "tribes",
    note: "Werewolf: the five tribes + Ghost Wolves (add name for detail)",
  },
  { key: "renown", note: "Werewolf: the five Renown" },
  {
    key: "gifts",
    note: "Werewolf: Gifts by kind (add name for facets)",
  },
  {
    key: "rites",
    note: "Werewolf: rites by rank (add name for detail)",
  },
  { key: "merits", note: "Merits by category — or filter by category name" },
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
  out.push(`${INDENT}  +cg/list kiths beast     (kiths for Beast only)`);
  out.push(`${INDENT}  +cg/list auspices Rahu   (detail for one auspice)`);
  out.push(`${INDENT}  +cg/list gifts rage      (facets of Gift of Rage)`);
  out.push("");
  out.push(footer());
  return out.join("\n");
}

// ── Virtues ──────────────────────────────────────────────────────────────────

function renderVirtues(filter?: string): string {
  if (filter) {
    const q = filter.trim().toLowerCase();
    const v = COFD_VIRTUES.find((x) => x.name.toLowerCase() === q);
    if (!v) {
      const out: string[] = [header("Virtues"), ""];
      out.push(...body(`No virtue named '${filter}'.`));
      out.push(
        ...body(`Try: ${COFD_VIRTUES.map((x) => x.name).join(", ")}`),
      );
      out.push(footer());
      return out.join("\n");
    }
    const out: string[] = [header(`Virtue — ${v.name}`), ""];
    out.push(`${INDENT}%ch%cy${v.name}%cn`);
    out.push(...body(v.description));
    out.push("");
    out.push(...fieldBlock("Willpower", v.willpowerTrigger));
    out.push("");
    out.push(footer());
    return out.join("\n");
  }

  // Compact index: 2 cols, name + truncated trigger.
  const out: string[] = [header("Virtues"), ""];
  out.push(...body("Virtues are positive anchors. Add a name for full detail."));
  out.push("");
  for (const v of COFD_VIRTUES) {
    const trigger = v.willpowerTrigger.length > 48
      ? v.willpowerTrigger.slice(0, 45) + "..."
      : v.willpowerTrigger;
    out.push(`${INDENT}%ch%cy${v.name}%cn — ${trigger}`);
  }
  out.push("");
  out.push(
    ...body("Full detail: +cg/list virtues <name>"),
  );
  out.push(footer());
  return out.join("\n");
}

function renderVices(filter?: string): string {
  if (filter) {
    const q = filter.trim().toLowerCase();
    const v = COFD_VICES.find((x) => x.name.toLowerCase() === q);
    if (!v) {
      const out: string[] = [header("Vices"), ""];
      out.push(...body(`No vice named '${filter}'.`));
      out.push(
        ...body(`Try: ${COFD_VICES.map((x) => x.name).join(", ")}`),
      );
      out.push(footer());
      return out.join("\n");
    }
    const out: string[] = [header(`Vice — ${v.name}`), ""];
    out.push(`${INDENT}%ch%cy${v.name}%cn`);
    out.push(...body(v.description));
    out.push("");
    out.push(...fieldBlock("Willpower", v.willpowerTrigger));
    out.push("");
    out.push(footer());
    return out.join("\n");
  }

  const out: string[] = [header("Vices"), ""];
  out.push(...body("Vices are negative anchors. Add a name for full detail."));
  out.push("");
  for (const v of COFD_VICES) {
    const trigger = v.willpowerTrigger.length > 48
      ? v.willpowerTrigger.slice(0, 45) + "..."
      : v.willpowerTrigger;
    out.push(`${INDENT}%ch%cy${v.name}%cn — ${trigger}`);
  }
  out.push("");
  out.push(...body("Full detail: +cg/list vices <name>"));
  out.push(footer());
  return out.join("\n");
}

// ── Templates ─────────────────────────────────────────────────────────────────

function renderTemplates(): string {
  const out: string[] = [header("Templates"), ""];
  for (const key of Object.keys(COFD_TEMPLATES).sort()) {
    const t = COFD_TEMPLATES[key];
    out.push(`${INDENT}%ch%cy${t.name}%cn  (key: ${key})`);
    out.push(...fieldBlock("Morality", t.moralityName));
    if (t.powerStatName && t.powerStatName !== "None") {
      out.push(...fieldBlock("Power", t.powerStatName));
    }
    if (t.energyName && t.energyName !== "None") {
      out.push(...fieldBlock("Energy", t.energyName));
    }
    if (t.customFields.length > 0) {
      out.push(...fieldBlock("Fields", t.customFields.join(", ")));
    }
    if (t.validPowers.length > 0) {
      out.push(...fieldBlock("Powers", t.validPowers.join(", ")));
    }
    out.push("");
  }
  out.push(footer());
  return out.join("\n");
}

// ── Seemings ──────────────────────────────────────────────────────────────────

function renderSeemings(filter?: string): string {
  if (filter) {
    const seeming = findSeeming(filter);
    if (!seeming) {
      const out: string[] = [header("Changeling — Seemings"), ""];
      out.push(...body(`No seeming named '${filter}'.`));
      out.push(
        ...body(`Try: ${CTL_SEEMINGS.map((s) => s.name).join(", ")}`),
      );
      out.push(footer());
      return out.join("\n");
    }
    // Single-seeming detail view.
    const out: string[] = [
      header(`Seeming — ${seeming.name}`),
      "",
    ];
    out.push(`${INDENT}%ch%cy${seeming.name}%cn`);
    out.push(...body(seeming.description));
    out.push("");
    out.push(...fieldBlock("Blessing", seeming.blessing));
    out.push(...fieldBlock("Curse", seeming.curse));
    out.push(
      ...fieldBlock("Favored Regalia", seeming.favoredRegalia),
    );
    out.push("");
    out.push(
      ...body(
        `Kiths for this seeming: +cg/list kiths ${seeming.name}`,
      ),
    );
    out.push(footer());
    return out.join("\n");
  }

  // Compact index — name + favored regalia + 1-word blessing hint.
  const out: string[] = [header("Changeling — Seemings"), ""];
  out.push(
    ...body("Six seemings. Add a name for full detail."),
  );
  out.push("");
  const colW = 38;
  for (const s of CTL_SEEMINGS) {
    const left = `%ch%cy${s.name}%cn (${s.favoredRegalia})`;
    const leftVis = visualLen(left);
    const pad = Math.max(1, colW - leftVis);
    const bless = s.blessing.length > 36
      ? s.blessing.slice(0, 33) + "..."
      : s.blessing;
    out.push(`${INDENT}${left}${" ".repeat(pad)}${bless}`);
  }
  out.push("");
  out.push(...body("Full detail: +cg/list seemings <name>"));
  out.push(...body("Kiths for a seeming: +cg/list kiths <seeming>"));
  out.push(footer());
  return out.join("\n");
}

// ── Kiths ─────────────────────────────────────────────────────────────────────

function renderKiths(filter?: string): string {
  if (filter) {
    const seeming = findSeeming(filter);
    if (!seeming) {
      const out: string[] = [header("Changeling — Kiths"), ""];
      out.push(...body(`No seeming named '${filter}'.`));
      out.push(
        ...body(`Try: ${CTL_SEEMINGS.map((s) => s.name).join(", ")}`),
      );
      out.push("");
      out.push(...body("Or omit the filter: +cg/list kiths"));
      out.push(footer());
      return out.join("\n");
    }
    const out: string[] = [
      header(`Changeling — Kiths of the ${seeming.name}`),
      "",
    ];
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
  out.push(
    ...body("For details on a seeming's kiths:  +cg/list kiths <seeming>"),
  );
  out.push(footer());
  return out.join("\n");
}

// ── Courts ────────────────────────────────────────────────────────────────────

function renderCourts(filter?: string): string {
  if (filter) {
    const q = filter.trim().toLowerCase();
    const court = CTL_COURTS.find((c) => c.name.toLowerCase() === q);
    if (!court) {
      const out: string[] = [header("Changeling — Courts"), ""];
      out.push(...body(`No court named '${filter}'.`));
      out.push(
        ...body(`Try: ${CTL_COURTS.map((c) => c.name).join(", ")}`),
      );
      out.push(footer());
      return out.join("\n");
    }
    const out: string[] = [
      header(`Court — ${court.name}`),
      "",
    ];
    out.push(
      `${INDENT}%ch%cy${court.name}%cn  (${court.emotion})`,
    );
    out.push(...body(court.description));
    out.push("");
    out.push(...fieldBlock("Mantle", court.mantleNotes));
    out.push(...fieldBlock("Contracts", court.contractDiscount));
    out.push("");
    out.push(footer());
    return out.join("\n");
  }

  // Compact index — 2-col name + emotion.
  const out: string[] = [header("Changeling — Courts"), ""];
  out.push(
    ...body("Four seasonal courts. Add a name for full detail."),
  );
  out.push("");
  for (const c of CTL_COURTS) {
    out.push(
      `${INDENT}%ch%cy${c.name}%cn  (${c.emotion})`,
    );
    const desc = c.description.length > 60
      ? c.description.slice(0, 57) + "..."
      : c.description;
    out.push(`${INDENT}  ${desc}`);
    out.push("");
  }
  out.push(...body("Full detail: +cg/list courts <name>"));
  out.push(footer());
  return out.join("\n");
}

// ── Auspices ─────────────────────────────────────────────────────────────────

function renderAuspices(filter?: string): string {
  if (filter) {
    const q = filter.trim().toLowerCase();
    const a = WTF_AUSPICES.find((x) => x.name.toLowerCase() === q);
    if (!a) {
      const out: string[] = [header("Werewolf — Auspices"), ""];
      out.push(...body(`No auspice named '${filter}'.`));
      out.push(
        ...body(`Try: ${WTF_AUSPICES.map((x) => x.name).join(", ")}`),
      );
      out.push(footer());
      return out.join("\n");
    }
    // Single-auspice detail.
    const out: string[] = [
      header(`Auspice — ${a.name}`),
      "",
    ];
    out.push(`${INDENT}%ch%cy${a.name}%cn  (${a.moon})`);
    out.push(...body(a.description));
    out.push("");
    out.push(...fieldBlock("Renown", a.renown));
    out.push(...fieldBlock("Aspect", a.hunterAspect));
    out.push(...fieldBlock("Skills", a.skills.join(", ")));
    out.push(...fieldBlock("Benefit", a.benefit));
    out.push("");
    out.push(footer());
    return out.join("\n");
  }

  // Compact index table — name + moon + renown on one line each.
  const out: string[] = [header("Werewolf — Auspices"), ""];
  out.push(
    ...body(
      "Five auspices. Add a name for full detail.",
    ),
  );
  out.push("");
  const COL = 22;
  const hdr =
    `${INDENT}` +
    `${"Name".padEnd(COL)}` +
    `${"Moon".padEnd(COL)}` +
    `Renown`;
  out.push(`%ch${hdr}%cn`);
  out.push(`${INDENT}${"-".repeat(WIDTH - INDENT.length)}`);
  for (const a of WTF_AUSPICES) {
    const name = a.name.padEnd(COL);
    const moon = a.moon.padEnd(COL);
    out.push(`${INDENT}%cy${name}%cn${moon}${a.renown}`);
  }
  out.push("");
  out.push(...body("Full detail: +cg/list auspices <name>"));
  out.push(footer());
  return out.join("\n");
}

// ── Tribes ────────────────────────────────────────────────────────────────────

function renderTribes(filter?: string): string {
  if (filter) {
    const q = filter.trim().toLowerCase();
    const t = WTF_TRIBES.find((x) => x.name.toLowerCase() === q);
    if (!t) {
      const out: string[] = [header("Werewolf — Tribes"), ""];
      out.push(...body(`No tribe named '${filter}'.`));
      out.push(
        ...body(`Try: ${WTF_TRIBES.map((x) => x.name).join(", ")}`),
      );
      out.push(footer());
      return out.join("\n");
    }
    // Single-tribe detail.
    const out: string[] = [header(`Tribe — ${t.name}`), ""];
    out.push(`${INDENT}%ch%cy${t.name}%cn`);
    out.push(...body(t.description));
    out.push("");
    out.push(...fieldBlock("Firstborn", t.firstborn));
    out.push(...fieldBlock("Renown", t.renown));
    out.push(
      ...fieldBlock(
        "Gifts",
        t.gifts.length > 0 ? t.gifts.join(", ") : "None",
      ),
    );
    out.push(...fieldBlock("Ban", t.ban));
    out.push("");
    out.push(footer());
    return out.join("\n");
  }

  // Compact 2-col index — name + firstborn.
  const out: string[] = [header("Werewolf — Tribes"), ""];
  out.push(
    ...body(
      "Six tribes (including Ghost Wolves). Add a name for full detail.",
    ),
  );
  out.push("");
  for (const t of WTF_TRIBES) {
    const renown = t.renown || "—";
    out.push(
      `${INDENT}%ch%cy${t.name}%cn  Renown: ${renown}`,
    );
    out.push(`${INDENT}  Firstborn: ${t.firstborn}`);
    out.push("");
  }
  out.push(...body("Full detail: +cg/list tribes <name>"));
  out.push(footer());
  return out.join("\n");
}

// ── Renown ────────────────────────────────────────────────────────────────────

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

// ── Gifts ─────────────────────────────────────────────────────────────────────

const GIFT_KIND_LABELS: Record<string, string> = {
  moon: "Moon Gifts",
  shadow: "Shadow Gifts",
  wolf: "Wolf Gifts",
};

function dotMark(n: number): string {
  return "*".repeat(Math.max(0, Math.min(6, n)));
}

function findGiftFuzzy(filter: string): WtfGift | WtfGift[] | null {
  const q = filter.trim().toLowerCase();
  const exact = findGift(filter);
  if (exact) return exact;
  const matches = WTF_GIFTS.filter((g) => {
    const core = g.name
      .toLowerCase()
      .replace(/^gift of (the )?/, "")
      .replace(/'s gift$/, "")
      .replace(/ moon$/, "");
    return (
      g.name.toLowerCase().includes(q) ||
      core.includes(q) ||
      q.includes(core)
    );
  });
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) return matches;
  return null;
}

/** Short gift label for 3-col index ("Gift of Rage" → "Rage"). */
function giftShortName(name: string): string {
  return name
    .replace(/^Gift of (the )?/, "")
    .replace(/'s Gift$/, "")
    .replace(/ Moon$/, "");
}

function renderGifts(filter?: string): string {
  if (filter) {
    const found = findGiftFuzzy(filter);
    if (Array.isArray(found)) {
      const out: string[] = [header("Werewolf — Gifts")];
      out.push(
        ...body(`Several gifts match '${filter}'. Did you mean:`),
      );
      out.push(
        ...columns(found.map((g) => `%ch%cy${g.name}%cn`), 2),
      );
      out.push(footer());
      return out.join("\n");
    }
    const gift = found;
    if (!gift) {
      const out: string[] = [header("Werewolf — Gifts")];
      out.push(...body(`No gift named '${filter}'.`));
      out.push(
        ...body(
          "Tip: short name works, e.g. 'rage' for Gift of Rage.",
        ),
      );
      out.push(...body("Or omit the filter: +cg/list gifts"));
      out.push(footer());
      return out.join("\n");
    }
    // Compact facet index — one line per facet; full text via +info.
    const kindNote =
      gift.type === "moon"
        ? `Moon — ${gift.auspice} (${gift.renownAffinity})`
        : gift.type === "shadow"
        ? "Shadow Gift"
        : "Wolf Gift";
    const out: string[] = [header(`Werewolf — ${gift.name}`)];
    out.push(...body(kindNote));
    for (const f of gift.facets) {
      const tag =
        gift.type === "moon" && f.dots
          ? `%ch%cx[${dotMark(f.dots)} ${f.renown}]%cn`
          : `%ch%cx[${f.renown}]%cn`;
      // One line: name + tag + truncated summary (≤78 cols).
      const head = `${INDENT}%ch%cy${f.name}%cn  ${tag}  `;
      const room = Math.max(12, WIDTH - visualLen(head));
      const sum =
        f.summary.length > room
          ? f.summary.slice(0, room - 3) + "..."
          : f.summary;
      out.push(head + sum);
    }
    out.push(
      ...body("Full facet detail: +info <facet name>"),
    );
    out.push(footer());
    return out.join("\n");
  }

  // Compact index: thin kind labels + 3-col short names (≤22 lines).
  // Avoid mush divider() chrome — it costs 2–3 lines per section.
  const out: string[] = [header("Werewolf — Gifts")];
  out.push(...body("Gifts by kind. Add a name for facets."));
  for (const kind of ["moon", "shadow", "wolf"] as const) {
    const list = giftsByType(kind);
    if (list.length === 0) continue;
    out.push(`${INDENT}%ch${GIFT_KIND_LABELS[kind]}:%cn`);
    out.push(
      ...columns(
        list.map(
          (g) => `%ch%cy${giftShortName(g.name)}%cn`,
        ),
        3,
      ),
    );
  }
  out.push(
    ...body("Facets: +cg/list gifts <name>  (e.g. rage)"),
  );
  out.push(footer());
  return out.join("\n");
}

// ── Rites ─────────────────────────────────────────────────────────────────────

function findRiteFuzzy(filter: string) {
  const q = filter.trim().toLowerCase();
  const exact = WTF_RITES.find(
    (r) => r.name.toLowerCase() === q,
  );
  if (exact) return exact;
  const matches = WTF_RITES.filter((r) =>
    r.name.toLowerCase().includes(q),
  );
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) return matches;
  return null;
}

function ritesOfKind(kind: "wolf" | "pack") {
  return WTF_RITES.filter((r) => r.type === kind)
    .slice()
    .sort(
      (a, b) =>
        a.rank - b.rank || a.name.localeCompare(b.name),
    );
}

/** Compact kind list: Name [***] in 2 cols (fits ≤22 lines). */
function renderRiteKindList(kind: "wolf" | "pack"): string {
  const list = ritesOfKind(kind);
  const title = kind === "wolf" ? "Wolf Rites" : "Pack Rites";
  const out: string[] = [header(`Werewolf — ${title}`)];
  out.push(
    ...body(
      `${list.length} rites. Add a name for full detail.`,
    ),
  );
  const entries = list.map(
    (r) =>
      `%ch%cy${r.name}%cn %ch%cx[${dotMark(r.rank)}]%cn`,
  );
  out.push(...columns(entries, 2));
  out.push(
    ...body("Full detail: +cg/list rites <name>"),
  );
  out.push(footer());
  return out.join("\n");
}

function renderRites(filter?: string): string {
  if (filter) {
    const q = filter.trim().toLowerCase();
    // Kind index first so "pack" / "wolf" are not fuzzy name hits.
    if (q === "wolf" || q === "wolves") {
      return renderRiteKindList("wolf");
    }
    if (q === "pack" || q === "packs") {
      return renderRiteKindList("pack");
    }

    const found = findRiteFuzzy(filter);
    if (Array.isArray(found)) {
      const out: string[] = [header("Werewolf — Rites")];
      out.push(...body(`Several rites match '${filter}':`));
      out.push(
        ...columns(
          found.map((r) => `%ch%cy${r.name}%cn`),
          2,
        ),
      );
      out.push(footer());
      return out.join("\n");
    }
    if (!found) {
      const out: string[] = [header("Werewolf — Rites")];
      out.push(...body(`No rite named '${filter}'.`));
      out.push(
        ...body(
          "Try: +cg/list rites wolf | pack | <name>",
        ),
      );
      out.push(footer());
      return out.join("\n");
    }
    const kind = found.type === "wolf" ? "Wolf" : "Pack";
    const out: string[] = [header(`Rite — ${found.name}`)];
    out.push(
      `${INDENT}%ch%cy${found.name}%cn  ` +
        `%ch%cx[${kind} / ${dotMark(found.rank)}]%cn`,
    );
    out.push(...body(found.summary));
    if (found.cost && found.cost !== "—") {
      out.push(...fieldBlock("Cost", found.cost));
    }
    if (found.dicePool && found.dicePool !== "—") {
      out.push(...fieldBlock("Pool", found.dicePool));
    }
    if (found.action && found.action !== "—") {
      out.push(...fieldBlock("Action", found.action));
    }
    if (found.duration && found.duration !== "—") {
      out.push(...fieldBlock("Duration", found.duration));
    }
    out.push(footer());
    return out.join("\n");
  }

  // Top index only — full lists are under wolf / pack filters.
  const wolfN = ritesOfKind("wolf").length;
  const packN = ritesOfKind("pack").length;
  const out: string[] = [header("Werewolf — Rites")];
  out.push(
    ...body(
      "Rites come in two kinds. Filter to list names:",
    ),
  );
  out.push(
    `${INDENT}%chwolf%cn   ${wolfN} rites` +
      `  +cg/list rites wolf`,
  );
  out.push(
    `${INDENT}%chpack%cn   ${packN} rites` +
      `  +cg/list rites pack`,
  );
  out.push(
    ...body("One rite: +cg/list rites <name>"),
  );
  out.push(footer());
  return out.join("\n");
}

// ── Regalia ───────────────────────────────────────────────────────────────────

function renderRegalia(): string {
  const out: string[] = [header("Changeling — Regalia"), ""];
  out.push(
    ...body(
      "The six Arcadian Regalia. Each seeming has one favored Regalia; " +
        "you choose a second for the 'favored' field in chargen.",
    ),
  );
  out.push("");
  for (const r of CTL_REGALIA) {
    out.push(`${INDENT}%ch%cy${r.name}%cn  (favored by ${r.favoredBy})`);
    out.push(...body(r.description));
    out.push(
      ...fieldBlock(
        "Contracts",
        `${contractsByRegalia(r.name).length}` +
          ` — see +cg/list contracts ${r.name.toLowerCase()}`,
      ),
    );
    out.push("");
  }
  out.push(footer());
  return out.join("\n");
}

// ── Contracts ─────────────────────────────────────────────────────────────────

function contractEntry(c: CtlContract): string {
  const tag =
    c.tier === "royal" ? "*" : c.tier === "goblin" ? "+" : "";
  return `%ch%cy${c.name}%cn${tag}`;
}

function renderContracts(filter?: string): string {
  if (filter) {
    const q = filter.trim().toLowerCase();
    const reg = CTL_REGALIA.find((r) => r.name.toLowerCase() === q);
    if (reg) {
      const list = contractsByRegalia(reg.name);
      const out: string[] = [
        header(`Contracts — ${reg.name} Regalia`),
        "",
      ];
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
      out.push(
        ...body(
          "+ = Goblin (incurs Goblin Debt).  +info <name> for full detail.",
        ),
      );
      out.push(footer());
      return out.join("\n");
    }
    const court = CTL_COURTS.find((c) => c.name.toLowerCase() === q);
    if (court) {
      const list = contractsByCourt(court.name);
      const out: string[] = [
        header(`Contracts — ${court.name} Court`),
        "",
      ];
      out.push(...columns(list.map(contractEntry), 2));
      out.push("");
      out.push(...body("* = Royal.  +info <name> for full detail."));
      out.push(footer());
      return out.join("\n");
    }
    const out: string[] = [header("Contracts"), ""];
    out.push(
      ...body(`No Regalia, Court, or 'goblin' named '${filter}'.`),
    );
    out.push(
      ...body(`Regalia: ${CTL_REGALIA.map((r) => r.name).join(", ")}.`),
    );
    out.push(
      ...body(
        `Courts: ${CTL_COURTS.map((c) => c.name).join(", ")}.  Plus: goblin.`,
      ),
    );
    out.push(footer());
    return out.join("\n");
  }

  const out: string[] = [header("Contracts"), ""];
  out.push(
    ...body(
      "Contracts come in three kinds. Filter with +cg/list contracts <group>.",
    ),
  );
  out.push("");
  out.push(divider("Arcadian Regalia"));
  for (const r of CTL_REGALIA) {
    out.push(
      `${INDENT}%ch${r.name.padEnd(8)}%cn ` +
        `${contractsByRegalia(r.name).length} contracts` +
        `  (favored by ${r.favoredBy})`,
    );
  }
  out.push("");
  out.push(divider("Courts"));
  for (const c of CTL_COURTS) {
    out.push(
      `${INDENT}%ch${c.name.padEnd(8)}%cn ` +
        `${contractsByCourt(c.name).length} contracts`,
    );
  }
  out.push("");
  out.push(divider("Goblin"));
  out.push(
    `${INDENT}%chgoblin%cn   ${goblinContracts().length} contracts`,
  );
  out.push("");
  out.push(
    ...body(
      `${CTL_CONTRACTS.length} Contracts total.` +
        `  Example: +cg/list contracts crown`,
    ),
  );
  out.push(footer());
  return out.join("\n");
}

// ── Merits ────────────────────────────────────────────────────────────────────

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
    const match = Array.from(cats.keys()).find(
      (c) => c.toLowerCase() === q,
    );
    if (!match) {
      const out: string[] = [header("Merits"), ""];
      out.push(...body(`No merit category named '${filter}'.`));
      out.push(...body(`Try: ${Array.from(cats.keys()).join(", ")}`));
      out.push("");
      out.push(...body("Or omit the filter: +cg/list merits"));
      out.push(footer());
      return out.join("\n");
    }
    const list = cats
      .get(match)!
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name));
    const entries = list.map((m) => {
      const d = dots(m.allowedDots);
      const dotStr = d ? ` (${d})` : "";
      const inst = m.instanced ? "*" : "";
      return `%ch%cy${m.name}%cn${dotStr}${inst}`;
    });
    const out: string[] = [header(`Merits — ${match}`), ""];
    out.push(...columns(entries, 2));
    out.push("");
    out.push(
      ...body(
        "* = instanced (one purchase per qualifier," +
          " e.g. Language: Spanish vs. Russian).",
      ),
    );
    out.push(footer());
    return out.join("\n");
  }

  const out: string[] = [header("Merits"), ""];
  for (const cat of Array.from(cats.keys()).sort()) {
    out.push(divider(cat));
    out.push(
      ...body(
        `${cats.get(cat)!.length} merits.` +
          `  +cg/list merits ${cat.toLowerCase()}`,
      ),
    );
    out.push("");
  }
  out.push(
    ...body(
      "Use +cg/list merits <category> to see merit names and dot ranges.",
    ),
  );
  out.push(footer());
  return out.join("\n");
}

// ── Public router ─────────────────────────────────────────────────────────────

/**
 * Render the +cg/list output. `arg` is the raw text after `/list ` —
 * `""` shows the index; otherwise it's a topic name with optional filter.
 */
export function renderCgList(arg: string): string {
  const trimmed = arg.trim();
  if (!trimmed) return renderIndex();

  const parts = trimmed.split(/\s+/);
  const topic = parts[0].toLowerCase();
  const filter = parts.slice(1).join(" ");

  switch (topic) {
    case "virtue":
    case "virtues":
      return renderVirtues(filter || undefined);
    case "vice":
    case "vices":
      return renderVices(filter || undefined);
    case "template":
    case "templates":
      return renderTemplates();
    case "seeming":
    case "seemings":
      return renderSeemings(filter || undefined);
    case "kith":
    case "kiths":
      return renderKiths(filter || undefined);
    case "court":
    case "courts":
      return renderCourts(filter || undefined);
    case "regalia":
      return renderRegalia();
    case "contract":
    case "contracts":
      return renderContracts(filter || undefined);
    case "auspice":
    case "auspices":
      return renderAuspices(filter || undefined);
    case "tribe":
    case "tribes":
      return renderTribes(filter || undefined);
    case "renown":
      return renderRenown();
    case "gift":
    case "gifts":
      return renderGifts(filter || undefined);
    case "rite":
    case "rites":
      return renderRites(filter || undefined);
    case "merit":
    case "merits":
      return renderMerits(filter || undefined);
    default: {
      const out: string[] = [header("Chargen — List"), ""];
      out.push(...body(`Unknown topic '${trimmed}'.`));
      out.push("");
      out.push(
        ...body("Try: +cg/list  (no arg)  to see the available topics."),
      );
      out.push(footer());
      return out.join("\n");
    }
  }
}
