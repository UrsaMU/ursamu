import { assert, assertEquals } from "@std/assert";
import {
  LIST_PAGE,
  parseListPage,
  renderInfo,
  renderList,
  renderTopicIndex,
} from "../commands/chargen-info.ts";
import { BACKGROUNDS } from "../engine/catalog.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function plain(s: string): string {
  return s
    .replace(/%c[a-zA-Z]/g, "")
    .replace(/%[nrtbR]/g, "");
}

function joined(lines: string[]): string {
  return plain(lines.join("\n"));
}

Deno.test("topic index lists catalog topics", OPTS, () => {
  const t = joined(renderTopicIndex());
  assert(t.includes("BACKGROUNDS") || t.includes("backgrounds"));
  assert(t.includes("edges"));
  assert(t.includes("+chargen/info"));
  assert(t.includes("page") || t.includes("pages") ||
    t.includes("list"));
});

Deno.test("parseListPage trailing number", OPTS, () => {
  assertEquals(parseListPage("2"), { filter: "", page: 2 });
  assertEquals(parseListPage("node 2"), {
    filter: "node",
    page: 2,
  });
  assertEquals(parseListPage("feed"), {
    filter: "feed",
    page: 1,
  });
});

Deno.test("list backgrounds shows slugs and edges", OPTS, () => {
  const lines = renderList("backgrounds");
  const t = joined(lines);
  assert(t.includes("nodejacker") || t.includes("page 1/"));
  assert(t.includes("page 1/"));
  for (const line of lines.join("\n").split("\n")) {
    if (!line.trim()) continue;
    if (/^[=-]+$/.test(plain(line).trim())) continue;
    assert(
      plain(line).length <= 78,
      `wide: ${plain(line).length} ${plain(line)}`,
    );
  }
});

Deno.test("list backgrounds page 2 differs", OPTS, () => {
  assert(BACKGROUNDS.length > LIST_PAGE);
  const p1 = joined(renderList("backgrounds", ""));
  const p2 = joined(renderList("backgrounds", "2"));
  assert(p1.includes("page 1/"));
  assert(p2.includes("page 2/"));
  assert(p1.includes("more:") || p2.includes("back:"));
  // Not the same body of slugs
  assert(p1 !== p2);
});

Deno.test("list edges filter", OPTS, () => {
  const t = joined(renderList("edges", "feed"));
  assert(t.toLowerCase().includes("feed"));
  assert(t.includes("Nodejacker") || t.includes("nodejacker"));
});

Deno.test("info nodejacker shows edge blurb", OPTS, () => {
  const t = joined(renderInfo("nodejacker"));
  assert(t.includes("Nodejacker"));
  assert(t.includes("Feedwise") || t.includes("Cognition"));
  assert(t.toLowerCase().includes("cognition") ||
    t.toLowerCase().includes("scene"));
});

Deno.test("info by edge name", OPTS, () => {
  const t = joined(renderInfo("Feedwise"));
  assert(t.toLowerCase().includes("feedwise"));
  assert(t.toLowerCase().includes("nodejacker"));
});

Deno.test("info unknown is graceful", OPTS, () => {
  const t = joined(renderInfo("not-a-real-slug-zzz"));
  assert(t.toLowerCase().includes("nothing matched") ||
    t.includes("!!"));
});

Deno.test("list unknown topic hints", OPTS, () => {
  const t = joined(renderList("spaceships"));
  assert(t.toLowerCase().includes("unknown"));
});

Deno.test("empty list is topic index", OPTS, () => {
  assertEquals(
    renderList("").join("\n"),
    renderTopicIndex().join("\n"),
  );
});
