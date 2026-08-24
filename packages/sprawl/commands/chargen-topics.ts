/**
 * Chargen catalog topic tables (list/info rows).
 */
import {
  dim,
  divider,
  plain,
  val,
  wrap,
  ylw,
} from "./chrome.ts";
import {
  AFFECTATIONS,
  AUGS,
  BACKGROUNDS,
  BELONGINGS,
  QUIRKS,
  STATS,
  STREET_TECH_QUIRKS,
  type Row,
} from "../engine/catalog.ts";

export type Topic = {
  key: string;
  aliases: string[];
  title: string;
  rows: () => Row[];
  listLine: (r: Row) => string;
  detail: (r: Row) => string[];
};

export function edgeOf(
  r: Row,
): Record<string, unknown> | null {
  const e = r.edge;
  if (!e || typeof e !== "object") return null;
  return e as Record<string, unknown>;
}

export function edgesAsRows(): Row[] {
  return BACKGROUNDS.map((bg) => {
    const e = edgeOf(bg);
    if (!e) {
      return {
        slug: `${bg.slug}-edge`,
        name: "—",
        background: bg.slug,
      };
    }
    return {
      slug: String(e.slug ?? `${bg.slug}-edge`),
      name: String(e.name ?? "—"),
      background: bg.slug,
      backgroundName: String(bg.name ?? bg.slug),
      blurb: e.blurb,
      stat: e.stat,
      bonus: e.bonus,
      frequency: e.frequency,
      book: e.book,
      roll: bg.roll,
    };
  });
}

/** Keep list rows ≤74 plain ( + 2 indent = 76 ). */
function clip(s: string, max = 74): string {
  if (plain(s).length <= max) return s;
  let out = s;
  while (out.length && plain(out).length > max - 1) {
    out = out.slice(0, -1);
  }
  return `${out}…`;
}

export const TOPICS: Topic[] = [
  {
    key: "backgrounds",
    aliases: ["background", "bg", "bgs"],
    title: "BACKGROUNDS",
    rows: () => BACKGROUNDS,
    listLine: (r) => {
      const e = edgeOf(r);
      const edge = e ? String(e.name ?? "") : "";
      return clip(
        `${dim(String(r.roll ?? "").padStart(2))} ` +
          `${val(r.slug)} ${dim(String(r.name ?? ""))}` +
          (edge ? ` ${ylw("→ " + edge)}` : ""),
      );
    },
    detail: (r) => {
      const e = edgeOf(r);
      const lines = [
        `${val(String(r.name))} ${dim("(" + r.slug + ")")}`,
        `  Roll ${val(String(r.roll ?? "—"))}` +
        `  ${dim(String(r.book ?? ""))}`,
      ];
      if (e) {
        lines.push(divider("EDGE"));
        lines.push(
          `  ${ylw(String(e.name))} ` +
            `${dim("(" + String(e.slug ?? "") + ")")}`,
        );
        lines.push(
          `  +${val(e.bonus ?? 1)} ` +
            `${val(String(e.stat ?? ""))}` +
            ` · ${dim(String(e.frequency ?? "scene"))}`,
        );
        if (e.blurb) {
          lines.push(...wrap(String(e.blurb), 74, "  "));
        }
        if (e.book) lines.push(`  ${dim(String(e.book))}`);
      }
      return lines;
    },
  },
  {
    key: "edges",
    aliases: ["edge"],
    title: "EDGES",
    rows: edgesAsRows,
    listLine: (r) =>
      clip(
        `${dim(String(r.roll ?? "").padStart(2))} ` +
          `${ylw(String(r.name))} ` +
          `${dim("← " +
            String(r.backgroundName ?? r.background))}`,
      ),
    detail: (r) => {
      const lines = [
        `${ylw(String(r.name))} ${dim("(" + r.slug + ")")}`,
        `  Background ${val(String(r.backgroundName ?? ""))}` +
        ` ${dim("(" + String(r.background ?? "") + ")")}`,
      ];
      if (r.stat != null) {
        lines.push(
          `  +${val(r.bonus ?? 1)} ${val(String(r.stat))}` +
            ` · ${dim(String(r.frequency ?? "scene"))}`,
        );
      }
      if (r.blurb) {
        lines.push(...wrap(String(r.blurb), 74, "  "));
      }
      if (r.book) lines.push(`  ${dim(String(r.book))}`);
      return lines;
    },
  },
  {
    key: "belongings",
    aliases: ["belonging", "gear", "stuff"],
    title: "BELONGINGS",
    rows: () => BELONGINGS,
    listLine: (r) =>
      clip(
        `${dim(String(r.roll ?? "").padStart(2))} ` +
          `${val(r.slug)} ${dim(String(r.name ?? ""))}` +
          (r.kind
            ? ` ${dim("[" + String(r.kind) + "]")}`
            : ""),
      ),
    detail: (r) =>
      [
        `${val(String(r.name))} ${dim("(" + r.slug + ")")}`,
        `  Roll ${val(String(r.roll ?? "—"))}` +
        `  Kind ${val(String(r.kind ?? "—"))}` +
        `  Load ${val(r.load ?? 0)}`,
        r.book ? `  ${dim(String(r.book))}` : "",
      ].filter(Boolean),
  },
  {
    key: "quirks",
    aliases: ["quirk"],
    title: "QUIRKS",
    rows: () => QUIRKS,
    listLine: (r) =>
      clip(
        `${dim(String(r.roll ?? "").padStart(2))} ` +
          `${val(r.slug)} ${dim(String(r.name ?? ""))}`,
      ),
    detail: (r) => {
      const lines = [
        `${val(String(r.name))} ${dim("(" + r.slug + ")")}`,
        `  Roll ${val(String(r.roll ?? "—"))}`,
      ];
      if (r.blurb) {
        lines.push(...wrap(String(r.blurb), 74, "  "));
      }
      if (r.book) lines.push(`  ${dim(String(r.book))}`);
      return lines;
    },
  },
  {
    key: "street-tech",
    aliases: [
      "streettech",
      "street-tech-quirks",
      "clinic",
      "chrome-quirk",
    ],
    title: "STREET-TECH QUIRKS",
    rows: () => STREET_TECH_QUIRKS,
    listLine: (r) =>
      clip(
        `${dim(String(r.roll ?? "").padStart(2))} ` +
          `${val(r.slug)} ${dim(String(r.name ?? ""))}` +
          (r.glitch ? ` ${ylw("Glitch")}` : ""),
      ),
    detail: (r) => {
      const lines = [
        `${val(String(r.name))} ${dim("(" + r.slug + ")")}`,
        `  Roll ${val(String(r.roll ?? "—"))}` +
        (r.glitch
          ? `  ${ylw("Glitch on tasks")}`
          : ""),
      ];
      if (r.blurb) {
        lines.push(...wrap(String(r.blurb), 74, "  "));
      }
      if (r.book) lines.push(`  ${dim(String(r.book))}`);
      return lines;
    },
  },
  {
    key: "affectations",
    aliases: ["affectation", "looks", "look", "style"],
    title: "AFFECTATIONS",
    rows: () => AFFECTATIONS,
    listLine: (r) =>
      clip(
        `${dim(String(r.roll ?? "").padStart(2))} ` +
          `${val(r.slug)} ${dim(String(r.name ?? ""))}`,
      ),
    detail: (r) => {
      const lines = [
        `${val(String(r.name))} ${dim("(" + r.slug + ")")}`,
        `  Roll ${val(String(r.roll ?? "—"))}`,
      ];
      if (r.phrase) {
        lines.push(...wrap(String(r.phrase), 74, "  "));
      } else if (r.blurb) {
        lines.push(...wrap(String(r.blurb), 74, "  "));
      }
      if (r.book) lines.push(`  ${dim(String(r.book))}`);
      return lines;
    },
  },
  {
    key: "stats",
    aliases: ["stat"],
    title: "STATS",
    rows: () => STATS,
    listLine: (r) =>
      clip(
        `${val(String(r.abbr ?? r.slug).padEnd(4))} ` +
          `${dim(String(r.name ?? ""))}` +
          (r.use ? ` — ${dim(String(r.use))}` : ""),
      ),
    detail: (r) => {
      const lines = [
        `${val(String(r.name))} ` +
        `${dim("(" + String(r.abbr ?? r.slug) + ")")}`,
      ];
      if (r.use) {
        lines.push(...wrap(String(r.use), 74, "  "));
      }
      if (r.book) lines.push(`  ${dim(String(r.book))}`);
      return lines;
    },
  },
  {
    key: "augs",
    aliases: ["aug", "augmentations", "cyberware"],
    title: "AUGMENTATIONS",
    rows: () => AUGS,
    listLine: (r) =>
      clip(
        `${val(r.slug)} ${dim(String(r.name ?? ""))}` +
          (r.cost != null
            ? ` ${dim(String(r.cost) + " b¥")}`
            : ""),
      ),
    detail: (r) => {
      const lines = [
        `${val(String(r.name))} ${dim("(" + r.slug + ")")}`,
      ];
      if (r.cost != null || r.load != null) {
        lines.push(
          `  Cost ${val(r.cost ?? "—")} b¥` +
            `  Load ${val(r.load ?? 0)}`,
        );
      }
      if (r.mod != null && r.modStat) {
        lines.push(
          `  Mod ${val("+" + r.mod)} ` +
            `${val(String(r.modStat))}`,
        );
      }
      if (r.blurb) {
        lines.push(...wrap(String(r.blurb), 74, "  "));
      }
      if (r.book) lines.push(`  ${dim(String(r.book))}`);
      return lines;
    },
  },
];

export function matchTopic(raw: string): Topic | undefined {
  const q = raw.toLowerCase().trim();
  if (!q) return undefined;
  return TOPICS.find((t) =>
    t.key === q ||
    t.key.startsWith(q) ||
    t.aliases.some((a) => a === q || a.startsWith(q))
  );
}
