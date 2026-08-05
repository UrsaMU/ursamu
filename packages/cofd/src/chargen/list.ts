// Render `+cg/list` output. Uses the cofd plugin's shared header/divider/
// footer helpers so the formatting matches +look and the rest of +cg.
// All list screens target ≤22 content lines (24-line telnet terminal).
// Long topics use a compact "index" view by default; a <name> filter
// triggers a single-entry "detail" view.

import {
  COFD_VIRTUES,
  COFD_VICES,
  CTL_COURTS,
  findSeeming,
  findGift,
  type WtfGift,
  CTL_REGALIA,
  contractsByRegalia,
  contractsByCourt,
  goblinContracts,
  type CtlContract,
  type MeritDefinition,
} from "../dictionary/index.ts";
import { chargenTemplates } from "../gamelines/templates.ts";
import { header, divider, footer } from "@ursamu/mush";
import type { CofdSheet } from "../stats/index.ts";
import {
  listSheetOrDefault,
  eligibleMerits,
  eligibleSeemings,
  eligibleKiths,
  eligibleCourts,
  eligibleRegalia,
  eligibleAuspices,
  eligibleTribes,
  eligibleRenown,
  eligibleGifts,
  eligibleRites,
  eligibleContracts,
  eligibleListTopics,
  wrongTemplateMsg,
  isChangeling,
  isWerewolf,
  type ListSheet,
} from "./list_eligible.ts";

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

function renderIndex(sheet: CofdSheet): string {
  const allowed = eligibleListTopics(sheet);
  const out: string[] = [];
  out.push(header("Chargen — Available Lists"));
  out.push("");
  out.push(
    ...body(
      "Use +cg/list <topic> to see options you can take " +
        "with your current sheet.",
    ),
  );
  out.push("");
  for (const e of INDEX) {
    if (!allowed.has(e.key)) continue;
    out.push(`${INDENT}%ch${e.key.padEnd(11)}%cn  ${e.note}`);
  }
  out.push("");
  out.push(`${INDENT}Examples:`);
  out.push(`${INDENT}  +cg/list virtues`);
  out.push(`${INDENT}  +cg/list merits physical`);
  if (isChangeling(sheet)) {
    out.push(
      `${INDENT}  +cg/list kiths beast     (kiths for Beast)`,
    );
  }
  if (isWerewolf(sheet)) {
    out.push(
      `${INDENT}  +cg/list gifts rage      (facets of Gift of Rage)`,
    );
  }
  out.push("");
  out.push(footer());
  return out.join("\n");
}

function lockedTopic(
  title: string,
  need: "changeling" | "werewolf",
): string {
  const out: string[] = [header(title), ""];
  out.push(...body(wrongTemplateMsg(title, need)));
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
  for (const t of chargenTemplates()) {
    out.push(`${INDENT}%ch%cy${t.name}%cn  (key: ${t.key})`);
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

function renderSeemings(sheet: CofdSheet, filter?: string): string {
  if (!isChangeling(sheet)) {
    return lockedTopic("Seemings", "changeling");
  }
  const pool = eligibleSeemings(sheet);
  if (filter) {
    const seeming = findSeeming(filter);
    if (!seeming || !pool.some((s) => s.name === seeming.name)) {
      const out: string[] = [header("Changeling — Seemings"), ""];
      out.push(...body(`No seeming named '${filter}'.`));
      out.push(
        ...body(`Try: ${pool.map((s) => s.name).join(", ")}`),
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
  for (const s of pool) {
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

function renderKiths(sheet: CofdSheet, filter?: string): string {
  if (!isChangeling(sheet)) {
    return lockedTopic("Kiths", "changeling");
  }
  const takeable = eligibleKiths(sheet);
  const sheetSeeming = (sheet.customFields?.seeming ?? "")
    .trim();
  // When seeming is set, only that seeming's kiths are takeable.
  const seemings = sheetSeeming
    ? eligibleSeemings(sheet).filter(
      (s) =>
        s.name.toLowerCase() === sheetSeeming.toLowerCase(),
    )
    : eligibleSeemings(sheet);

  if (filter) {
    const seeming = findSeeming(filter);
    const ok = seeming &&
      seemings.some(
        (s) => s.name.toLowerCase() === seeming.name.toLowerCase(),
      );
    if (!seeming || !ok) {
      const out: string[] = [header("Changeling — Kiths"), ""];
      if (sheetSeeming) {
        out.push(
          ...body(
            `Your seeming is ${sheetSeeming}. ` +
              `Only its kiths are listed.`,
          ),
        );
        out.push(
          ...body(
            `Try: +cg/list kiths ${sheetSeeming}`,
          ),
        );
      } else {
        out.push(...body(`No seeming named '${filter}'.`));
        out.push(
          ...body(
            `Try: ${seemings.map((s) => s.name).join(", ")}`,
          ),
        );
      }
      out.push("");
      out.push(...body("Or omit the filter: +cg/list kiths"));
      out.push(footer());
      return out.join("\n");
    }
    const list = takeable.filter(
      (k) =>
        k.seeming.toLowerCase() === seeming.name.toLowerCase(),
    );
    const out: string[] = [
      header(`Changeling — Kiths of the ${seeming.name}`),
      "",
    ];
    for (const k of list) {
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
  if (sheetSeeming) {
    out.push(
      ...body(
        `Kiths for your seeming (${sheetSeeming}).`,
      ),
    );
    out.push("");
  }
  for (const s of seemings) {
    const ks = takeable.filter(
      (k) =>
        k.seeming.toLowerCase() === s.name.toLowerCase(),
    );
    if (ks.length === 0) continue;
    out.push(divider(s.name));
    out.push(...columns(ks.map((k) => `%ch%cy${k.name}%cn`), 3));
    out.push("");
  }
  if (!sheetSeeming) {
    out.push(
      ...body(
        "For details on a seeming's kiths:  " +
          "+cg/list kiths <seeming>",
      ),
    );
  }
  out.push(footer());
  return out.join("\n");
}

// ── Courts ────────────────────────────────────────────────────────────────────

function renderCourts(sheet: CofdSheet, filter?: string): string {
  if (!isChangeling(sheet)) {
    return lockedTopic("Courts", "changeling");
  }
  const pool = eligibleCourts(sheet);
  if (filter) {
    const q = filter.trim().toLowerCase();
    const court = pool.find((c) => c.name.toLowerCase() === q);
    if (!court) {
      const out: string[] = [header("Changeling — Courts"), ""];
      out.push(...body(`No court named '${filter}'.`));
      out.push(
        ...body(`Try: ${pool.map((c) => c.name).join(", ")}`),
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
  for (const c of pool) {
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

function renderAuspices(sheet: CofdSheet, filter?: string): string {
  if (!isWerewolf(sheet)) {
    return lockedTopic("Auspices", "werewolf");
  }
  const pool = eligibleAuspices(sheet);
  if (filter) {
    const q = filter.trim().toLowerCase();
    const a = pool.find((x) => x.name.toLowerCase() === q);
    if (!a) {
      const out: string[] = [header("Werewolf — Auspices"), ""];
      out.push(...body(`No auspice named '${filter}'.`));
      out.push(
        ...body(`Try: ${pool.map((x) => x.name).join(", ")}`),
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
  for (const a of pool) {
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

function renderTribes(sheet: CofdSheet, filter?: string): string {
  if (!isWerewolf(sheet)) {
    return lockedTopic("Tribes", "werewolf");
  }
  const pool = eligibleTribes(sheet);
  if (filter) {
    const q = filter.trim().toLowerCase();
    const t = pool.find((x) => x.name.toLowerCase() === q);
    if (!t) {
      const out: string[] = [header("Werewolf — Tribes"), ""];
      out.push(...body(`No tribe named '${filter}'.`));
      out.push(
        ...body(`Try: ${pool.map((x) => x.name).join(", ")}`),
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
  for (const t of pool) {
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

function renderRenown(sheet: CofdSheet): string {
  if (!isWerewolf(sheet)) {
    return lockedTopic("Renown", "werewolf");
  }
  const pool = eligibleRenown(sheet);
  const out: string[] = [header("Werewolf — Renown"), ""];
  for (const r of pool) {
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

function findGiftFuzzy(
  filter: string,
  pool: WtfGift[],
): WtfGift | WtfGift[] | null {
  const q = filter.trim().toLowerCase();
  const catalog = findGift(filter);
  if (
    catalog &&
    pool.some(
      (g) =>
        g.name.toLowerCase() === catalog.name.toLowerCase(),
    )
  ) {
    return pool.find(
      (g) =>
        g.name.toLowerCase() === catalog.name.toLowerCase(),
    )!;
  }
  const exact = pool.find((g) => g.name.toLowerCase() === q);
  if (exact) return exact;
  const matches = pool.filter((g) => {
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

function renderGifts(sheet: CofdSheet, filter?: string): string {
  if (!isWerewolf(sheet)) {
    return lockedTopic("Gifts", "werewolf");
  }
  const pool = eligibleGifts(sheet);
  if (filter) {
    const found = findGiftFuzzy(filter, pool);
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
          "Only gifts you can take are listed. " +
            "Set auspice/tribe first; short names work " +
            "(e.g. 'rage').",
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
  const out: string[] = [header("Werewolf — Gifts")];
  out.push(
    ...body(
      "Gifts you can take (by kind). Add a name for facets.",
    ),
  );
  if (pool.length === 0) {
    out.push(
      ...body(
        "Set your auspice (and tribe) in Stage 3 to unlock " +
          "Moon and Shadow Gifts.",
      ),
    );
    out.push(footer());
    return out.join("\n");
  }
  for (const kind of ["moon", "shadow", "wolf"] as const) {
    const list = pool.filter((g) => g.type === kind);
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

function findRiteFuzzy(
  filter: string,
  pool: ReturnType<typeof eligibleRites>,
) {
  const q = filter.trim().toLowerCase();
  const exact = pool.find((r) => r.name.toLowerCase() === q);
  if (exact) return exact;
  const matches = pool.filter((r) =>
    r.name.toLowerCase().includes(q),
  );
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) return matches;
  return null;
}

function ritesOfKind(
  kind: "wolf" | "pack",
  pool: ReturnType<typeof eligibleRites>,
) {
  return pool
    .filter((r) => r.type === kind)
    .slice()
    .sort(
      (a, b) =>
        a.rank - b.rank || a.name.localeCompare(b.name),
    );
}

/** Compact kind list: Name [***] in 2 cols (fits ≤22 lines). */
function renderRiteKindList(
  kind: "wolf" | "pack",
  pool: ReturnType<typeof eligibleRites>,
): string {
  const list = ritesOfKind(kind, pool);
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

function renderRites(sheet: CofdSheet, filter?: string): string {
  if (!isWerewolf(sheet)) {
    return lockedTopic("Rites", "werewolf");
  }
  const pool = eligibleRites(sheet);
  if (filter) {
    const q = filter.trim().toLowerCase();
    // Kind index first so "pack" / "wolf" are not fuzzy name hits.
    if (q === "wolf" || q === "wolves") {
      return renderRiteKindList("wolf", pool);
    }
    if (q === "pack" || q === "packs") {
      return renderRiteKindList("pack", pool);
    }

    const found = findRiteFuzzy(filter, pool);
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
  const wolfN = ritesOfKind("wolf", pool).length;
  const packN = ritesOfKind("pack", pool).length;
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

function renderRegalia(sheet: CofdSheet): string {
  if (!isChangeling(sheet)) {
    return lockedTopic("Regalia", "changeling");
  }
  const pool = eligibleRegalia(sheet);
  const takeable = eligibleContracts(sheet);
  const out: string[] = [header("Changeling — Regalia"), ""];
  out.push(
    ...body(
      "The six Arcadian Regalia. Each seeming has one favored " +
        "Regalia; you choose a second for the 'favored' field.",
    ),
  );
  out.push("");
  for (const r of pool) {
    const n = takeable.filter(
      (c) =>
        c.type === "arcadian" &&
        (c.regalia ?? "").toLowerCase() === r.name.toLowerCase(),
    ).length;
    out.push(
      `${INDENT}%ch%cy${r.name}%cn  (favored by ${r.favoredBy})`,
    );
    out.push(...body(r.description));
    out.push(
      ...fieldBlock(
        "Contracts",
        `${n} you can take` +
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

function renderContracts(
  sheet: CofdSheet,
  filter?: string,
): string {
  if (!isChangeling(sheet)) {
    return lockedTopic("Contracts", "changeling");
  }
  const takeable = eligibleContracts(sheet);
  const takeSet = new Set(
    takeable.map((c) => c.name.toLowerCase()),
  );
  const filterTakeable = (
    list: readonly CtlContract[],
  ): CtlContract[] =>
    list.filter((c) => takeSet.has(c.name.toLowerCase()));

  if (filter) {
    const q = filter.trim().toLowerCase();
    const reg = CTL_REGALIA.find(
      (r) => r.name.toLowerCase() === q,
    );
    if (reg) {
      const list = filterTakeable(
        contractsByRegalia(reg.name),
      );
      const out: string[] = [
        header(`Contracts — ${reg.name} Regalia`),
        "",
      ];
      out.push(...body(reg.description));
      out.push("");
      if (list.length === 0) {
        out.push(
          ...body(
            "No contracts from this Regalia that you can " +
              "take right now (check favored Regalia).",
          ),
        );
      } else {
        out.push(...columns(list.map(contractEntry), 2));
      }
      out.push("");
      out.push(
        ...body("* = Royal.  +info <name> for full detail."),
      );
      out.push(footer());
      return out.join("\n");
    }
    if (q === "goblin") {
      const list = filterTakeable(goblinContracts());
      const out: string[] = [header("Contracts — Goblin"), ""];
      out.push(...columns(list.map(contractEntry), 2));
      out.push("");
      out.push(
        ...body(
          "+ = Goblin (incurs Goblin Debt).  " +
            "+info <name> for full detail.",
        ),
      );
      out.push(footer());
      return out.join("\n");
    }
    const court = CTL_COURTS.find(
      (c) => c.name.toLowerCase() === q,
    );
    if (court) {
      const list = filterTakeable(
        contractsByCourt(court.name),
      );
      const out: string[] = [
        header(`Contracts — ${court.name} Court`),
        "",
      ];
      if (list.length === 0) {
        out.push(
          ...body(
            "No Court Contracts here that you can take " +
              "(must match your own court).",
          ),
        );
      } else {
        out.push(...columns(list.map(contractEntry), 2));
      }
      out.push("");
      out.push(
        ...body("* = Royal.  +info <name> for full detail."),
      );
      out.push(footer());
      return out.join("\n");
    }
    const out: string[] = [header("Contracts"), ""];
    out.push(
      ...body(
        `No Regalia, Court, or 'goblin' named '${filter}'.`,
      ),
    );
    out.push(
      ...body(
        `Regalia: ${CTL_REGALIA.map((r) => r.name).join(", ")}.`,
      ),
    );
    out.push(
      ...body(
        `Courts: ${CTL_COURTS.map((c) => c.name).join(", ")}. ` +
          `Plus: goblin.`,
      ),
    );
    out.push(footer());
    return out.join("\n");
  }

  const out: string[] = [header("Contracts"), ""];
  out.push(
    ...body(
      "Only contracts you can take. Filter with " +
        "+cg/list contracts <group>.",
    ),
  );
  out.push("");
  out.push(divider("Arcadian Regalia"));
  for (const r of CTL_REGALIA) {
    const n = filterTakeable(
      contractsByRegalia(r.name),
    ).length;
    if (n === 0) continue;
    out.push(
      `${INDENT}%ch${r.name.padEnd(8)}%cn ` +
        `${n} contracts` +
        `  (favored by ${r.favoredBy})`,
    );
  }
  out.push("");
  out.push(divider("Courts"));
  for (const c of CTL_COURTS) {
    const n = filterTakeable(
      contractsByCourt(c.name),
    ).length;
    if (n === 0) continue;
    out.push(
      `${INDENT}%ch${c.name.padEnd(8)}%cn ` +
        `${n} contracts`,
    );
  }
  out.push("");
  const gobN = filterTakeable(goblinContracts()).length;
  if (gobN > 0) {
    out.push(divider("Goblin"));
    out.push(`${INDENT}%chgoblin%cn   ${gobN} contracts`);
    out.push("");
  }
  out.push(
    ...body(
      `${takeable.length} Contracts you can take.` +
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

function renderMerits(
  sheet: CofdSheet,
  filter?: string,
): string {
  const takeable = eligibleMerits(sheet);
  const cats = new Map<string, MeritDefinition[]>();
  for (const m of takeable) {
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
      out.push(
        ...body(`No merit category named '${filter}'.`),
      );
      const keys = Array.from(cats.keys());
      if (keys.length > 0) {
        out.push(...body(`Try: ${keys.join(", ")}`));
      } else {
        out.push(
          ...body(
            "No merits match your current sheet " +
              "(check template and attributes).",
          ),
        );
      }
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
    out.push(
      ...body(
        "Only merits you qualify for right now " +
          "(prereqs met).",
      ),
    );
    out.push("");
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
  out.push(
    ...body(
      `Merits you can take (${takeable.length}). ` +
        `Filtered by your current sheet prereqs.`,
    ),
  );
  out.push("");
  if (cats.size === 0) {
    out.push(
      ...body(
        "None qualify yet. Raise attributes/skills " +
          "or set template, then list again.",
      ),
    );
    out.push(footer());
    return out.join("\n");
  }
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
      "Use +cg/list merits <category> to see names " +
        "and dot ranges.",
    ),
  );
  out.push(footer());
  return out.join("\n");
}

// ── Public router ─────────────────────────────────────────────────────────────

/**
 * Render the +cg/list output. `arg` is the raw text after `/list `.
 * `sheet` is the active chargen (or live) sheet used for eligibility.
 * `""` shows the index; otherwise a topic name with optional filter.
 */
export function renderCgList(
  arg: string,
  sheet?: ListSheet,
): string {
  const s = listSheetOrDefault(sheet);
  const trimmed = arg.trim();
  if (!trimmed) return renderIndex(s);

  const parts = trimmed.split(/\s+/);
  const topic = parts[0].toLowerCase();
  const filter = parts.slice(1).join(" ");
  const f = filter || undefined;

  switch (topic) {
    case "virtue":
    case "virtues":
      return renderVirtues(f);
    case "vice":
    case "vices":
      return renderVices(f);
    case "template":
    case "templates":
      return renderTemplates();
    case "seeming":
    case "seemings":
      return renderSeemings(s, f);
    case "kith":
    case "kiths":
      return renderKiths(s, f);
    case "court":
    case "courts":
      return renderCourts(s, f);
    case "regalia":
      return renderRegalia(s);
    case "contract":
    case "contracts":
      return renderContracts(s, f);
    case "auspice":
    case "auspices":
      return renderAuspices(s, f);
    case "tribe":
    case "tribes":
      return renderTribes(s, f);
    case "renown":
      return renderRenown(s);
    case "gift":
    case "gifts":
      return renderGifts(s, f);
    case "rite":
    case "rites":
      return renderRites(s, f);
    case "merit":
    case "merits":
      return renderMerits(s, f);
    default: {
      const out: string[] = [header("Chargen — List"), ""];
      out.push(...body(`Unknown topic '${trimmed}'.`));
      out.push("");
      out.push(
        ...body(
          "Try: +cg/list  (no arg)  to see available topics.",
        ),
      );
      out.push(footer());
      return out.join("\n");
    }
  }
}
