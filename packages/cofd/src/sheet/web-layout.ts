/**
 * Structured +sheet layout for web /play (u.ui.layout).
 * Telnet keeps formatSheet() ASCII.
 */
import {
  MENTAL_ATTRIBUTES,
  PHYSICAL_ATTRIBUTES,
  SOCIAL_ATTRIBUTES,
  COFD_MENTAL_SKILLS,
  COFD_PHYSICAL_SKILLS,
  COFD_SOCIAL_SKILLS,
} from "../dictionary/index.ts";
import { healthMax } from "../health/index.ts";
import { migrateSheet, type CofdSheet, type HealthTrack } from "../stats/sheet.ts";
import { COFD_TEMPLATES } from "../gamelines/templates.ts";

function titleCase(s: string): string {
  return String(s || "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function statRows(
  keys: readonly string[],
  values: Record<string, number> | undefined,
  fallback = 0,
): Array<{ label: string; value: number; max: number }> {
  const bag = values ?? {};
  return keys.map((k) => {
    let v = bag[k];
    if (v == null) v = bag[k.toLowerCase()];
    const n = Number(v);
    return {
      label: titleCase(k),
      value: Number.isFinite(n) ? n : fallback,
      max: 5,
    };
  });
}

function healthKinds(
  track: HealthTrack,
  max: number,
): Array<"empty" | "bash" | "leth" | "agg"> {
  const out: Array<"empty" | "bash" | "leth" | "agg"> = [];
  let agg = Math.max(0, track.aggravated ?? 0);
  let leth = Math.max(0, track.lethal ?? 0);
  let bash = Math.max(0, track.bashing ?? 0);
  const m = Math.max(0, Math.min(20, max));
  for (let i = 0; i < m; i++) {
    if (agg > 0) {
      out.push("agg");
      agg -= 1;
    } else if (leth > 0) {
      out.push("leth");
      leth -= 1;
    } else if (bash > 0) {
      out.push("bash");
      bash -= 1;
    } else {
      out.push("empty");
    }
  }
  return out;
}

export type SheetWebOpts = {
  mode?: "live" | "draft" | "empty";
};

/**
 * Build layout components for +sheet on web clients.
 */
export function buildSheetWebLayout(
  playerName: string,
  sheetIn: CofdSheet,
  opts: SheetWebOpts = {},
): {
  components: Record<string, unknown>[];
  meta: Record<string, unknown>;
} {
  const sheet = migrateSheet({ ...sheetIn });
  const tKey = String(sheet.template ?? "mortal").toLowerCase().trim();
  const tmpl = COFD_TEMPLATES[tKey] || COFD_TEMPLATES.mortal;
  const cf = (sheet.customFields ?? {}) as Record<string, string>;
  const adv = sheet.advantages ?? {
    willpowerMax: 2,
    willpowerCurrent: 2,
    size: 5,
  };
  const components: Record<string, unknown>[] = [];

  components.push({
    type: "header",
    title: playerName || "Character",
  });

  if (opts.mode === "draft" || opts.mode === "empty") {
    components.push({
      type: "text",
      content:
        opts.mode === "empty"
          ? "DRAFT — blank Mortal sheet. Start with +cg."
          : "DRAFT — chargen in progress (not approved).",
    });
  }

  // Identity line
  const idBits = [titleCase(sheet.template || "mortal")];
  if (cf.seeming || cf.kith || cf.court) {
    idBits.push(
      [cf.seeming, cf.kith, cf.court].filter(Boolean).join(" / "),
    );
  }
  if (cf.auspice || cf.tribe) {
    idBits.push(
      [cf.auspice, cf.tribe].filter(Boolean).join(" / "),
    );
  }
  if (sheet.concept) idBits.unshift(String(sheet.concept));
  components.push({
    type: "text",
    content: idBits.filter(Boolean).join(" · "),
  });

  const anchors: string[] = [];
  if (sheet.virtue) anchors.push(`Virtue: ${sheet.virtue}`);
  if (sheet.vice) anchors.push(`Vice: ${sheet.vice}`);
  if (cf.needle) anchors.push(`Needle: ${cf.needle}`);
  if (cf.thread) anchors.push(`Thread: ${cf.thread}`);
  if (anchors.length) {
    components.push({
      type: "text",
      content: anchors.join("  ·  "),
    });
  }

  // Attributes — 3 category columns
  components.push({
    type: "stat-cols",
    title: "Attributes",
    columns: [
      {
        title: "Mental",
        rows: statRows(MENTAL_ATTRIBUTES, sheet.attributes, 1),
      },
      {
        title: "Physical",
        rows: statRows(PHYSICAL_ATTRIBUTES, sheet.attributes, 1),
      },
      {
        title: "Social",
        rows: statRows(SOCIAL_ATTRIBUTES, sheet.attributes, 1),
      },
    ],
  });

  // Skills
  components.push({
    type: "stat-cols",
    title: "Skills",
    columns: [
      {
        title: "Mental",
        rows: statRows(COFD_MENTAL_SKILLS, sheet.skills, 0),
      },
      {
        title: "Physical",
        rows: statRows(COFD_PHYSICAL_SKILLS, sheet.skills, 0),
      },
      {
        title: "Social",
        rows: statRows(COFD_SOCIAL_SKILLS, sheet.skills, 0),
      },
    ],
  });

  // Specialties
  const specs = sheet.specialties ?? {};
  const specKeys = Object.keys(specs).filter((k) => specs[k]).sort();
  if (specKeys.length) {
    components.push({
      type: "list",
      title: "Specialties",
      content: specKeys.map(
        (k) => `${titleCase(k)} — ${String(specs[k])}`,
      ),
    });
  }

  // Merits
  const merits = sheet.merits ?? {};
  const mKeys = Object.keys(merits)
    .filter((k) => (Number(merits[k]) || 0) > 0)
    .sort();
  if (mKeys.length) {
    components.push({
      type: "list",
      title: "Merits",
      content: mKeys.map((k) => {
        const d = Number(merits[k]) || 0;
        return `${titleCase(k)} — ${d} dot${d === 1 ? "" : "s"}`;
      }),
    });
  }

  // Contracts
  const contracts = sheet.contracts ?? [];
  if (contracts.length) {
    components.push({
      type: "list",
      title: "Contracts",
      content: contracts.map((c) => String(c)),
    });
  }

  // Powers (renown etc.)
  const powers = sheet.powers ?? {};
  const pKeys = Object.keys(powers)
    .filter((k) => (Number(powers[k]) || 0) > 0)
    .sort();
  if (pKeys.length) {
    components.push({
      type: "stat-cols",
      title: "Powers",
      columns: [
        {
          title: "",
          rows: pKeys.map((k) => ({
            label: titleCase(k),
            value: Number(powers[k]) || 0,
            max: 5,
          })),
        },
      ],
    });
  }

  // Advantages last (match HTML sheet order)
  const hMax = healthMax(sheet);
  const track: HealthTrack = sheet.health ?? {
    bashing: 0,
    lethal: 0,
    aggravated: 0,
  };
  const wpMax = Number(adv.willpowerMax) || 0;
  const wpCur = Number(adv.willpowerCurrent ?? wpMax) || 0;

  components.push({ type: "header", title: "Advantages" });
  components.push({
    type: "track-row",
    label: "Health",
    kinds: healthKinds(track, hMax),
    meta: `(${hMax})`,
  });
  components.push({
    type: "track-row",
    label: "Willpower",
    // filled = available current
    kinds: Array.from({ length: Math.min(20, wpMax) }, (_, i) =>
      i < wpCur ? "wp-on" : "wp-off"
    ),
    meta: `${wpCur}/${wpMax}`,
  });

  const advBits: string[] = [
    `Size ${adv.size ?? 5}`,
  ];
  if (sheet.moralityValue != null) {
    const mor = tmpl.moralityName || "Integrity";
    advBits.push(`${mor} ${sheet.moralityValue}`);
  }
  if (
    sheet.powerStatValue != null &&
    Number(sheet.powerStatValue) > 0 &&
    String(tmpl.powerStatName || "").toLowerCase() !== "none"
  ) {
    advBits.push(
      `${tmpl.powerStatName} ${sheet.powerStatValue}`,
    );
  }
  components.push({
    type: "text",
    content: advBits.join("  ·  "),
  });

  return {
    components,
    meta: {
      type: "sheet",
      template: sheet.template,
      mode: opts.mode ?? "live",
    },
  };
}
