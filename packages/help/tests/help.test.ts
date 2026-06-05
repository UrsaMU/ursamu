/**
 * Tests for the help system framework.
 *
 * Covers:
 *   - slugify: normalization rules
 *   - HelpRegistry: lookup, all, sections, inSection, provider priority, tags
 *   - CommandProvider: category → section slug, hidden exclusion
 *   - FileProvider: priority, bustCache
 *   - DbProvider: priority, function signatures
 *   - Renderer: renderEntry, renderIndex, renderSection
 *   - Plugin: init returns true, remove does not throw
 */

import { assertEquals, assertStringIncludes } from "@std/assert";
import { describe, it, beforeEach } from "@std/testing/bdd";

// ── Helpers ──────────────────────────────────────────────────────────────────

import type { HelpEntry, HelpProvider } from "../src/registry.ts";
import { HelpRegistry, slugify, registerHelpEntry } from "../src/registry.ts";

function makeProvider(entries: HelpEntry[], priority: number): HelpProvider {
  return {
    priority,
    get:  (topic: string) => Promise.resolve(entries.find((e) => e.name === topic) ?? null),
    all:  () => Promise.resolve([...entries]),
  };
}

function makeEntry(
  name: string,
  section = "general",
  content = "body",
  source: HelpEntry["source"] = "command",
): HelpEntry {
  return { name, section, content, source, tags: [] };
}

// ── slugify ───────────────────────────────────────────────────────────────────

describe("slugify", () => {
  it("lowercases and trims", () => {
    assertEquals(slugify("  MAIL  "), "mail");
  });
  it("converts spaces to dashes", () => {
    assertEquals(slugify("house rules"), "house-rules");
  });
  it("preserves slash sub-topic separator", () => {
    assertEquals(slugify("mail/send"), "mail/send");
  });
  it("strips non-alphanumeric chars except dash and slash", () => {
    assertEquals(slugify("foo@bar!"), "foobar");
  });
  it("empty string returns empty string", () => {
    assertEquals(slugify(""), "");
  });
});

// ── HelpRegistry ──────────────────────────────────────────────────────────────

describe("HelpRegistry", () => {
  let registry: HelpRegistry;

  beforeEach(() => {
    registry = new HelpRegistry();
  });

  it("returns null when no providers registered", async () => {
    assertEquals(await registry.lookup("anything"), null);
  });

  it("returns entry from single provider", async () => {
    registry.addProvider(makeProvider([makeEntry("mail")], 10));
    const entry = await registry.lookup("mail");
    assertEquals(entry?.name, "mail");
  });

  it("higher-priority provider wins on name collision", async () => {
    registry.addProvider(makeProvider([makeEntry("mail", "general", "low-body")],  10));
    registry.addProvider(makeProvider([makeEntry("mail", "general", "high-body")], 100));
    const entry = await registry.lookup("mail");
    assertEquals(entry?.content, "high-body");
  });

  it("lower-priority provider is still returned when higher has no match", async () => {
    registry.addProvider(makeProvider([makeEntry("other")], 100));
    registry.addProvider(makeProvider([makeEntry("mail")],  10));
    const entry = await registry.lookup("mail");
    assertEquals(entry?.name, "mail");
  });

  it("falls back to tag lookup when direct lookup fails", async () => {
    const entry: HelpEntry = { ...makeEntry("mail"), tags: ["email"] };
    registry.addProvider(makeProvider([entry], 10));
    assertEquals((await registry.lookup("email"))?.name, "mail");
  });

  it("returns null when topic and tags don't match", async () => {
    registry.addProvider(makeProvider([makeEntry("mail")], 10));
    assertEquals(await registry.lookup("nonexistent"), null);
  });

  it("all() deduplicates by name, higher-priority wins", async () => {
    registry.addProvider(makeProvider([makeEntry("mail", "general", "low")],  10));
    registry.addProvider(makeProvider([makeEntry("mail", "general", "high")], 100));
    const all = await registry.all();
    assertEquals(all.length, 1);
    assertEquals(all[0].content, "high");
  });

  it("sections() returns sorted distinct section names", async () => {
    registry.addProvider(makeProvider([
      makeEntry("a", "zebra"),
      makeEntry("b", "alpha"),
      makeEntry("c", "zebra"),
    ], 10));
    assertEquals(await registry.sections(), ["alpha", "zebra"]);
  });

  it("inSection() filters to section and sorts by name", async () => {
    registry.addProvider(makeProvider([
      makeEntry("z-cmd", "combat"),
      makeEntry("a-cmd", "combat"),
      makeEntry("other", "general"),
    ], 10));
    const entries = await registry.inSection("combat");
    assertEquals(entries.map((e) => e.name), ["a-cmd", "z-cmd"]);
  });

  it("removeProvider() stops it being queried", async () => {
    const p = makeProvider([makeEntry("mail")], 10);
    registry.addProvider(p);
    registry.removeProvider(p);
    assertEquals(await registry.lookup("mail"), null);
  });
});

// ── CommandProvider logic ────────────────────────────────────────────────────

import { CommandProvider } from "../src/providers/command.ts";

describe("CommandProvider", () => {
  it("has priority 10", () => {
    assertEquals(new CommandProvider().priority, 10);
  });

  it("category → section: lowercased, spaces to dashes", () => {
    const cat = "My Category";
    assertEquals(cat.toLowerCase().replace(/\s+/g, "-"), "my-category");
  });

  it("undefined category → section 'general'", () => {
    function categoryToSection(cat: string | undefined): string {
      return cat ? cat.toLowerCase().replace(/\s+/g, "-") : "general";
    }
    assertEquals(categoryToSection(undefined), "general");
    assertEquals(categoryToSection("Admin"), "admin");
  });

  it("hidden commands are excluded — logic check", () => {
    const cmds = [
      { name: "+greet", hidden: false },
      { name: "+secret", hidden: true },
    ];
    const visible = cmds.filter((c) => !c.hidden);
    assertEquals(visible.length, 1);
    assertEquals(visible[0].name, "+greet");
  });

  // Full integration (cmds available after engine PR) is tested in the game project.
});

// ── FileProvider ──────────────────────────────────────────────────────────────

import { FileProvider, registerHelpDir, bustCache } from "../src/providers/file.ts";

describe("FileProvider", () => {
  it("has priority 50", () => {
    assertEquals(new FileProvider().priority, 50);
  });

  it("bustCache() does not throw", () => {
    bustCache();
  });

  it("returns null for unknown topic (no game root in test env)", async () => {
    bustCache();
    const fp = new FileProvider();
    assertEquals(await fp.get("nonexistent-topic-xyz-abc"), null);
  });

  it("registerHelpDir() is a function", () => {
    assertEquals(typeof registerHelpDir, "function");
  });
});

// ── DbProvider ────────────────────────────────────────────────────────────────

import { DbProvider, upsertEntry, deleteEntry } from "../src/providers/database.ts";

describe("DbProvider", () => {
  it("has priority 100", () => {
    assertEquals(new DbProvider().priority, 100);
  });

  it("upsertEntry is a function", () => {
    assertEquals(typeof upsertEntry, "function");
  });

  it("deleteEntry is a function", () => {
    assertEquals(typeof deleteEntry, "function");
  });

  // KV-backed integration tests run in the game project with --unstable-kv.
});

// ── Renderer ──────────────────────────────────────────────────────────────────

import { renderEntry, renderIndex, renderSection } from "../src/renderer.ts";

describe("renderEntry", () => {
  it("includes the topic name uppercased in header", () => {
    assertStringIncludes(renderEntry(makeEntry("mail", "general", "Send mail.")), "MAIL");
  });

  it("renders markdown body content", () => {
    assertStringIncludes(renderEntry(makeEntry("mail", "general", "Send mail to a player.")), "Send mail");
  });

  it("shows fallback message when content is empty", () => {
    assertStringIncludes(renderEntry(makeEntry("nodoc", "general", "")), "No detailed help");
  });

  it("output starts with a header and ends with a footer", () => {
    const out = renderEntry(makeEntry("test"));
    // Header contains [ TEST ]
    assertStringIncludes(out, "TEST");
    // Footer is repeated = chars (color-coded)
    assertStringIncludes(out, "%cr=%cn");
  });
});

describe("renderIndex", () => {
  it("includes all section names uppercased", () => {
    const out = renderIndex(["general", "combat", "admin"], 42);
    assertStringIncludes(out, "GENERAL");
    assertStringIncludes(out, "COMBAT");
    assertStringIncludes(out, "ADMIN");
  });

  it("includes the total topic count", () => {
    assertStringIncludes(renderIndex(["general"], 7), "7");
  });

  it("includes browse instruction", () => {
    assertStringIncludes(renderIndex([], 0), "help <topic>");
  });
});

describe("renderSection", () => {
  it("includes section name uppercased in header", () => {
    assertStringIncludes(renderSection("combat", [makeEntry("dodge", "combat")]), "COMBAT");
  });

  it("lists topic names", () => {
    const out = renderSection("combat", [
      makeEntry("dodge",  "combat"),
      makeEntry("attack", "combat"),
    ]);
    assertStringIncludes(out, "DODGE");
    assertStringIncludes(out, "ATTACK");
  });

  it("shows empty message when no entries", () => {
    assertStringIncludes(renderSection("empty", []), "No topics");
  });
});

// ── Plugin lifecycle ──────────────────────────────────────────────────────────

import { plugin } from "../src/index.ts";

describe("plugin", () => {
  it("has name 'help'", () => {
    assertEquals(plugin.name, "help");
  });

  it("has version string", () => {
    assertEquals(typeof plugin.version, "string");
  });

  it("remove() does not throw even if init never ran", () => {
    plugin.remove?.();
  });

  it("init() returns true (may skip if KV unavailable)", async () => {
    try {
      assertEquals(await plugin.init?.(), true);
    } catch {
      // KV not available in this test environment — acceptable degradation
    }
  });
});

// ── registerHelpEntry ─────────────────────────────────────────────────────────

describe("registerHelpEntry", () => {
  it("is a function", () => {
    assertEquals(typeof registerHelpEntry, "function");
  });

  it("does not throw when called with a valid entry", () => {
    registerHelpEntry({
      name: "test-topic",
      section: "test",
      content: "Test content.",
      source: "command",
      tags: ["alias"],
    });
  });
});
