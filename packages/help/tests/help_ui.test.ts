/**
 * Web help UI — multi-column clickable topics + SEE ALSO.
 */
import { assertEquals, assert } from "@std/assert";
import {
  prefersWebUi,
  sendHelpIndexUi,
  sendHelpSectionUi,
  sendHelpTopicUi,
  topicChip,
  columnActions,
  parseSeeAlso,
} from "../src/help-ui.ts";
import type { HelpEntry } from "../src/registry.ts";
import type { IUrsamuSDK } from "@ursamu/mush";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function entry(
  name: string,
  section = "general",
  content = "Body text here.",
): HelpEntry {
  return {
    name,
    section,
    content,
    source: "file",
    tags: [],
  };
}

function mockU(web: boolean) {
  const layouts: unknown[] = [];
  const u = {
    clientType: web ? "web" : "telnet",
    me: {
      id: "1",
      name: "Tester",
      flags: new Set(["player", "connected"]),
    },
    ui: {
      layout: (payload: unknown) => {
        layouts.push(payload);
      },
    },
    send: () => {},
  };
  return Object.assign(u as unknown as IUrsamuSDK, {
    _layouts: layouts,
  });
}

Deno.test("topicChip builds cmd action", OPTS, () => {
  const c = topicChip("MAIL", "help mail");
  assertEquals(c.label, "MAIL");
  assertEquals(c.action.cmd, "help mail");
});

Deno.test("columnActions is 4-up actions block", OPTS, () => {
  // deno-lint-ignore no-explicit-any
  const block = columnActions("Sections", [
    topicChip("A", "help a"),
    topicChip("B", "help b"),
  ], 4) as any;
  assertEquals(block.type, "actions");
  assertEquals(block.columns, 4);
  assertEquals(block.items.length, 2);
});

Deno.test("prefersWebUi requires web + layout", OPTS, () => {
  assertEquals(prefersWebUi(mockU(true)), true);
  assertEquals(prefersWebUi(mockU(false)), false);
});

Deno.test("sendHelpIndexUi: sections as column chips", OPTS, () => {
  const u = mockU(true);
  const ok = sendHelpIndexUi(u, [
    entry("look", "general", "See the room."),
    entry("mail/send", "mail", "Send a letter."),
    entry("attack", "combat", "Swing."),
  ]);
  assertEquals(ok, true);
  // deno-lint-ignore no-explicit-any
  const p = u._layouts[0] as any;
  assertEquals(p.meta.type, "help-index");
  const acts = p.components.filter(
    // deno-lint-ignore no-explicit-any
    (c: any) => c.type === "actions",
  );
  assert(acts.length >= 1);
  assert(
    !p.components.some(
      // deno-lint-ignore no-explicit-any
      (c: any) => c.type === "entity-list",
    ),
  );
  const labels = acts.flatMap(
    // deno-lint-ignore no-explicit-any
    (a: any) => a.items.map((i: any) => i.label),
  );
  assert(labels.includes("MAIL") || labels.includes("COMBAT"));
  assert(labels.includes("LOOK"));
  assertEquals(acts[0].columns, 4);
});

Deno.test("sendHelpIndexUi: telnet skips", OPTS, () => {
  const u = mockU(false);
  assertEquals(sendHelpIndexUi(u, [entry("x")]), false);
  assertEquals(u._layouts.length, 0);
});

Deno.test("sendHelpSectionUi: topic columns", OPTS, () => {
  const u = mockU(true);
  assertEquals(
    sendHelpSectionUi(u, "mail", [
      entry("mail", "mail"),
      entry("mail/send", "mail"),
    ]),
    true,
  );
  // deno-lint-ignore no-explicit-any
  const p = u._layouts[0] as any;
  assertEquals(p.meta.type, "help-section");
  const grid = p.components.find(
    // deno-lint-ignore no-explicit-any
    (c: any) => c.type === "actions" && c.columns === 4,
  );
  assert(grid);
  assertEquals(grid.items.length, 2);
});

Deno.test("sendHelpTopicUi: markdown + nav chips", OPTS, () => {
  const u = mockU(true);
  assertEquals(
    sendHelpTopicUi(
      u,
      entry("look", "general", "## Look\n\nSee stuff."),
    ),
    true,
  );
  // deno-lint-ignore no-explicit-any
  const p = u._layouts[0] as any;
  assertEquals(p.meta.type, "help-topic");
  assert(
    p.components.some(
      // deno-lint-ignore no-explicit-any
      (c: any) => c.type === "markdown",
    ),
  );
});

Deno.test("sendHelpTopicUi: hides staff-only", OPTS, () => {
  const u = mockU(true);
  assertEquals(
    sendHelpTopicUi(u, {
      name: "staff/secret",
      section: "staff",
      content: "Nope",
      source: "file",
      tags: [],
      staffOnly: true,
    }),
    false,
  );
});

Deno.test("parseSeeAlso extracts +help refs", OPTS, () => {
  const raw = [
    "Open treasure.",
    "",
    "SEE ALSO: +help adventure, +help loot",
    "SEE ALSO: +help bbs (overview)",
  ].join("\n");
  const { body, refs } = parseSeeAlso(raw);
  assert(!body.includes("SEE ALSO"));
  assert(body.includes("Open treasure"));
  assertEquals(refs.includes("adventure"), true);
  assertEquals(refs.includes("loot"), true);
  assertEquals(refs.includes("bbs"), true);
});

Deno.test("sendHelpTopicUi: SEE ALSO becomes chips", OPTS, () => {
  const u = mockU(true);
  assertEquals(
    sendHelpTopicUi(
      u,
      entry(
        "chest",
        "adventure",
        "Open it.\n\nSEE ALSO: +help loot, +help adventure",
      ),
    ),
    true,
  );
  // deno-lint-ignore no-explicit-any
  const p = u._layouts[0] as any;
  const see = p.components.find(
    // deno-lint-ignore no-explicit-any
    (c: any) => c.type === "actions" && c.title === "See also",
  );
  assert(see);
  assertEquals(see.items.length, 2);
  assertEquals(see.items[0].action.cmd.startsWith("help "), true);
  const md = p.components.find(
    // deno-lint-ignore no-explicit-any
    (c: any) => c.type === "markdown",
  );
  assert(!String(md.content).includes("SEE ALSO"));
});
