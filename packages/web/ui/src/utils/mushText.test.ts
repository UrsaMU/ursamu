/**
 * Run with: deno test packages/web/ui/src/utils/mushText.test.ts
 * (or via package test runner if wired)
 */
import {
  assertEquals,
  assertStringIncludes,
} from "@std/assert";
import {
  gameLayoutOf,
  hasGameLayout,
  mushTextToHtml,
} from "./mushText.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("mushTextToHtml: escapes HTML", OPTS, () => {
  const h = mushTextToHtml(`<script>alert(1)</script>`);
  // Tags stripped/escaped — no executable script node
  assertEquals(h.includes("<script>"), false);
  assertStringIncludes(h, "alert(1)");
});

Deno.test("mushTextToHtml: legacy engine spans → web-safe color", OPTS, () => {
  const legacy =
    "===<span style='color: green'>X</span>===";
  const h = mushTextToHtml(legacy);
  assertStringIncludes(h, "===");
  assertStringIncludes(h, "X");
  assertStringIncludes(h.toLowerCase(), "color:#00cc00");
  assertEquals(h.includes("color: green"), false);
});

Deno.test("mushTextToHtml: %c still colors after strip", OPTS, () => {
  const h = mushTextToHtml("%cy*%cn");
  assertStringIncludes(h, "color:");
  assertStringIncludes(h, "*");
  const opens = (h.match(/<span\b/gi) || []).length;
  const closes = (h.match(/<\/span>/gi) || []).length;
  assertEquals(opens, closes);
});

Deno.test("mushTextToHtml: ANSI SGR colors", OPTS, () => {
  const h = mushTextToHtml("\x1b[32m===\x1b[0m OOC \x1b[32m===\x1b[0m");
  assertStringIncludes(h, "color:#00CC00");
  assertStringIncludes(h, "===");
  assertStringIncludes(h, "OOC");
  assertEquals(h.includes("\x1b"), false);
  assertEquals(h.includes("%c"), false);
});

Deno.test("mushTextToHtml: mangled style= recovers web-safe", OPTS, () => {
  const h = mushTextToHtml(
    "~-~- style='color: yellow'>* -~-~-",
  );
  assertStringIncludes(h.toLowerCase(), "color:#ffff00");
  assertStringIncludes(h, "*");
  assertEquals(h.includes("yellow'>"), false);
  assertEquals(/style='color:\s*yellow'/i.test(h), false);
});

Deno.test("mushTextToHtml: truecolor snaps web-safe", OPTS, () => {
  const h = mushTextToHtml("<#ff6414>Go%cn");
  // ff6414 → nearest web-safe
  assertStringIncludes(h, "color:#");
  assertStringIncludes(h, "Go");
  assertEquals(/color:#[0-9a-f]{6}/i.test(h), true);
});

Deno.test("mushTextToHtml: colors and bold", OPTS, () => {
  const h = mushTextToHtml("%ch%crHello%cn world");
  assertStringIncludes(h, "<b>");
  assertStringIncludes(h, "color:");
  assertStringIncludes(h, "Hello");
  assertStringIncludes(h, "world");
});

Deno.test("mushTextToHtml: layout %r %t %b", OPTS, () => {
  const h = mushTextToHtml("a%r b%t c%b d");
  assertStringIncludes(h, "\n");
  assertStringIncludes(h, "\t");
  assertStringIncludes(h, "  d") || assertStringIncludes(h, " d");
});

Deno.test("hasGameLayout / gameLayoutOf", OPTS, () => {
  assertEquals(hasGameLayout(undefined), false);
  assertEquals(hasGameLayout({}), false);
  assertEquals(hasGameLayout({ ui: { components: [] } }), true);
  const g = gameLayoutOf({
    ui: {
      type: "layout",
      components: [{ type: "header", content: "Hi" }],
      meta: { type: "staff" },
    },
  });
  assertEquals(g?.components.length, 1);
  assertEquals(g?.meta?.type, "staff");
});
