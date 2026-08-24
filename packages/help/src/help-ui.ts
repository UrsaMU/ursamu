/**
 * /play help UI — multi-column clickable topics (design.md chips).
 * Section/topic pages: help-ui-views.ts
 */
import type { IUrsamuSDK } from "@ursamu/mush";
import type { HelpEntry } from "./registry.ts";
import { filterTopicsForViewer } from "./visibility.ts";

export function prefersWebUi(u: IUrsamuSDK): boolean {
  return u.clientType === "web" &&
    typeof (u as { ui?: { layout?: unknown } }).ui?.layout ===
      "function";
}

export function isStaff(u: IUrsamuSDK): boolean {
  const f = u.me.flags;
  return f.has("admin") || f.has("wizard") ||
    f.has("superuser") || f.has("staff");
}

export function act(cmd: string): { cmd: string } {
  return { cmd };
}

export function sendLayout(
  u: IUrsamuSDK,
  components: unknown[],
  metaType: string,
): void {
  u.ui.layout({
    components,
    meta: { type: metaType },
  });
}

/** Topic/section chip for multi-column actions grid. */
export function topicChip(
  label: string,
  cmd: string,
  opts: { badge?: string } = {},
): {
  id: string;
  label: string;
  badge?: string;
  action: { cmd: string };
} {
  const id = "h-" + label.toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  const chip: {
    id: string;
    label: string;
    badge?: string;
    action: { cmd: string };
  } = {
    id: id || "h-x",
    label: label,
    action: act(cmd),
  };
  if (opts.badge) chip.badge = opts.badge;
  return chip;
}

/**
 * Pull SEE ALSO lines out of help markdown.
 * Formats:
 *   SEE ALSO: +help adventure, +help combat
 *   SEE ALSO: +help bbs/reading, +help bbnext
 *   SEE ALSO: +help bbs (overview)
 */
export function parseSeeAlso(content: string): {
  body: string;
  refs: string[];
} {
  const lines = String(content || "").split(/\r?\n/);
  const refs: string[] = [];
  const kept: string[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    const m = line.match(/^\s*SEE ALSO:\s*(.+)$/i);
    if (!m) {
      kept.push(line);
      continue;
    }
    for (const part of m[1].split(",")) {
      let t = part.trim();
      // drop +help / help prefix
      t = t.replace(/^\+?help\s+/i, "").trim();
      // drop trailing (notes)
      t = t.replace(/\s*\([^)]*\)\s*$/g, "").trim();
      // strip leftover bold/code marks
      t = t.replace(/[*`_]+/g, "").trim();
      if (!t) continue;
      const key = t.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      refs.push(t);
    }
  }

  // Trim trailing blank lines left by removed SEE ALSO
  while (kept.length && !kept[kept.length - 1].trim()) {
    kept.pop();
  }
  return { body: kept.join("\n"), refs };
}

/** 4-up column block (classic help index shape). */
export function columnActions(
  title: string,
  chips: ReturnType<typeof topicChip>[],
  columns = 4,
): unknown {
  return {
    type: "actions",
    title,
    columns,
    items: chips,
  };
}

/**
 * Top-level index: SECTIONS + GENERAL as clickable columns.
 */
export function sendHelpIndexUi(
  u: IUrsamuSDK,
  all: HelpEntry[],
): boolean {
  if (!prefersWebUi(u)) return false;
  const staff = isStaff(u);
  const visible = filterTopicsForViewer(all, staff);
  const bySection = new Map<string, HelpEntry[]>();
  for (const e of visible) {
    const sec = e.section || "general";
    const list = bySection.get(sec) ?? [];
    list.push(e);
    bySection.set(sec, list);
  }

  const sectionNames = [...bySection.keys()]
    .filter((s) => s !== "general")
    .sort((a, b) => a.localeCompare(b));

  const general = (bySection.get("general") ?? [])
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));

  const components: unknown[] = [
    { type: "header", title: "Help" },
    {
      type: "text",
      content:
        "Choose a section or topic. " +
        "Type %chhelp <name>%cn anytime.",
    },
  ];

  if (sectionNames.length) {
    components.push(columnActions(
      "Sections",
      sectionNames.map((sec) =>
        topicChip(sec.toUpperCase(), `help ${sec}`)
      ),
      4,
    ));
  }

  if (general.length) {
    components.push(columnActions(
      "Topics",
      general.map((e) =>
        topicChip(e.name.toUpperCase(), `help ${e.name}`)
      ),
      4,
    ));
  }

  if (!sectionNames.length && !general.length) {
    components.push({
      type: "text",
      content: "No help topics available.",
    });
  }

  sendLayout(u, components, "help-index");
  return true;
}

export {
  sendHelpSectionUi,
  sendHelpTopicUi,
} from "./help-ui-views.ts";
