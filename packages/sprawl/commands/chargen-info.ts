/**
 * +chargen/list and +chargen/info — reference catalog.
 * No draft required; works after approval too.
 * Lists paginate: +chargen/list backgrounds 2
 */
import type { IUrsamuSDK } from "@ursamu/ursamu";
import {
  ERR,
  dim,
  divider,
  footer,
  header,
  val,
  ylw,
} from "./chrome.ts";
import { findByName, type Row } from "../engine/catalog.ts";
import {
  TOPICS,
  matchTopic,
  type Topic,
} from "./chargen-topics.ts";

/** Rows per page — fits a 24-line terminal with chrome. */
export const LIST_PAGE = 16;

function filterRows(rows: Row[], q: string): Row[] {
  const n = q.toLowerCase().trim();
  if (!n) return rows;
  return rows.filter((r) => {
    const blob = [
      r.slug,
      r.name,
      r.background,
      r.backgroundName,
      r.blurb,
      r.kind,
    ].map((x) => String(x ?? "").toLowerCase()).join(" ");
    return blob.includes(n);
  });
}

/**
 * Split trailing page number from filter tokens.
 * "node 2" → filter node, page 2
 * "2" alone → page 2, empty filter
 */
export function parseListPage(rest: string): {
  filter: string;
  page: number;
} {
  const parts = rest.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { filter: "", page: 1 };
  const last = parts[parts.length - 1] ?? "";
  if (/^\d+$/.test(last)) {
    const page = Math.max(1, Number(last));
    const filter = parts.slice(0, -1).join(" ");
    return { filter, page };
  }
  return { filter: parts.join(" "), page: 1 };
}

function findAnywhere(
  q: string,
): { topic: Topic; row: Row } | null {
  const n = q.toLowerCase().trim();
  if (!n) return null;
  for (const t of TOPICS) {
    const rows = t.rows();
    const hit = findByName(rows, n) ??
      rows.find((r) => r.slug === n);
    if (hit) return { topic: t, row: hit };
  }
  return null;
}

/** Topic index when /list has no arg. */
export function renderTopicIndex(): string[] {
  const lines = [
    header("CHARGEN CATALOG"),
    `  ${dim("Browse tables. No draft required.")}`,
    divider("TOPICS"),
  ];
  for (const t of TOPICS) {
    const n = t.rows().length;
    const pages = Math.max(1, Math.ceil(n / LIST_PAGE));
    lines.push(
      `  ${val(t.key.padEnd(14))} ` +
        `${dim(String(n) + " entries")}` +
        (pages > 1
          ? ` ${dim("(" + pages + " pages)")}`
          : ""),
    );
  }
  lines.push(
    `  ${dim("+chargen/list <topic> [filter] [page]")}`,
  );
  lines.push(
    `  ${dim("e.g. +chargen/list backgrounds 2")}`,
  );
  lines.push(
    `  ${dim("+chargen/info <slug|name>")}`,
  );
  lines.push(footer("SPRAWL"));
  return lines;
}

/** Compact table listing (paginated). */
export function renderList(
  topicRaw: string,
  rest = "",
): string[] {
  if (!topicRaw.trim()) return renderTopicIndex();
  const topic = matchTopic(topicRaw);
  if (!topic) {
    return [
      header("CHARGEN LIST"),
      `  ${ERR}Unknown topic ${val(topicRaw)}.`,
      `  ${dim("Try: backgrounds edges belongings quirks")}`,
      `  ${dim("     affectations stats augs")}`,
      footer("SPRAWL"),
    ];
  }
  const { filter, page: want } = parseListPage(rest);
  const rows = filterRows(topic.rows(), filter);
  const pages = Math.max(1, Math.ceil(rows.length / LIST_PAGE));
  const page = Math.min(want, pages);
  const slice = rows.slice(
    (page - 1) * LIST_PAGE,
    page * LIST_PAGE,
  );

  const titleBits = [topic.title];
  if (filter) titleBits.push(filter);
  if (pages > 1) titleBits.push(`${page}/${pages}`);
  const title = titleBits.join(" · ");

  const lines = [
    header(title),
    `  ${dim(String(rows.length) + " hit" +
      (rows.length === 1 ? "" : "s"))}` +
    `  ${dim("page " + page + "/" + pages)}` +
    (filter ? `  ${dim("filter: " + filter)}` : ""),
  ];
  if (!slice.length) {
    lines.push(`  ${dim("no matches")}`);
  }
  for (const r of slice) {
    lines.push(`  ${topic.listLine(r)}`);
  }
  if (page < pages) {
    const more = [
      topic.key,
      filter,
      String(page + 1),
    ].filter(Boolean).join(" ");
    lines.push(
      `  ${ylw("more:")} ${val("+chargen/list " + more)}`,
    );
  }
  if (page > 1) {
    const prev = [
      topic.key,
      filter,
      page > 2 ? String(page - 1) : "",
    ].filter(Boolean).join(" ");
    lines.push(
      `  ${dim("back:")} ${val("+chargen/list " + prev)}`,
    );
  }
  lines.push(
    `  ${dim("detail:")} ${val("+chargen/info <slug>")}`,
  );
  lines.push(footer("SPRAWL"));
  return lines;
}

/** Single-entry detail (topic name alone → list). */
export function renderInfo(query: string): string[] {
  const q = query.trim();
  if (!q) {
    return [
      header("CHARGEN INFO"),
      `  ${dim("Usage: +chargen/info <slug|name>")}`,
      `  ${dim("Example: +chargen/info nodejacker")}`,
      footer("SPRAWL"),
    ];
  }
  const ql = q.toLowerCase();
  const exactTopic = TOPICS.some((t) =>
    t.key === ql || t.aliases.includes(ql)
  );
  if (exactTopic) return renderList(q);

  const hit = findAnywhere(q);
  if (!hit) {
    return [
      header("CHARGEN INFO"),
      `  ${ERR}Nothing matched ${val(q)}.`,
      `  ${dim("+chargen/list backgrounds")}`,
      footer("SPRAWL"),
    ];
  }
  const lines = [header(hit.topic.title)];
  for (const l of hit.topic.detail(hit.row)) {
    if (
      !l ||
      l.startsWith("  ") ||
      l.startsWith("%") ||
      l.includes("\n")
    ) {
      lines.push(l);
    } else {
      lines.push(`  ${l}`);
    }
  }
  lines.push(footer("SPRAWL"));
  return lines;
}

/**
 * Handle /list /info /catalog. Returns true if consumed.
 * Safe with no sheet / approved sheet.
 */
export function tryChargenCatalog(
  u: IUrsamuSDK,
  sw: string,
  arg: string,
): boolean {
  const s = sw.toLowerCase();
  if (s === "list" || s === "catalog" || s === "topics") {
    const parts = arg.split(/\s+/).filter(Boolean);
    const topic = s === "topics" ? "" : (parts[0] ?? "");
    const rest = parts.slice(1).join(" ");
    u.send(renderList(topic, rest).join("\r\n"));
    return true;
  }
  if (s === "info" || s === "show") {
    u.send(renderInfo(arg).join("\r\n"));
    return true;
  }
  return false;
}
