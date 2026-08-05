/**
 * Web/html formatter: web keeps %c; html closes spans.
 */
import {
  assertEquals,
  assertStringIncludes,
} from "@std/assert";
import parser, {
  mushMessageToHtml,
} from "../src/render/parser.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("web format keeps %c codes", OPTS, () => {
  const out = parser.substitute("web", "%cy*%cn hello%rworld");
  assertStringIncludes(out, "%cy");
  assertStringIncludes(out, "%cn");
  assertStringIncludes(out, "\n");
  assertEquals(out.includes("<span"), false);
});

Deno.test("html format closes color spans", OPTS, () => {
  const out = parser.substitute(
    "html",
    "%cg===%cn OOC %cg===%cn",
  );
  assertStringIncludes(out, "color:");
  assertStringIncludes(out, "OOC");
  // No open-only inherit reset junk from the old html subs
  assertEquals(
    out.includes("color: inherit; background-color: inherit"),
    false,
  );
  assertEquals(out.includes("</b></i>"), false);
  // Every <span opens with a matching close somewhere
  const opens = (out.match(/<span\b/gi) || []).length;
  const closes = (out.match(/<\/span>/gi) || []).length;
  assertEquals(opens, closes);
});

Deno.test("html truecolor moniker is closed", OPTS, () => {
  const out = mushMessageToHtml(
    "Di<#ff6414>abler<#ff320a>ie%cn",
  );
  assertStringIncludes(out, "Di");
  assertStringIncludes(out, "abler");
  assertStringIncludes(out, "ie");
  assertEquals(out.includes("%c"), false);
  const opens = (out.match(/<span\b/gi) || []).length;
  const closes = (out.match(/<\/span>/gi) || []).length;
  assertEquals(opens, closes);
});

Deno.test("html escapes raw angle brackets", OPTS, () => {
  const out = mushMessageToHtml("<script>x</script>");
  assertStringIncludes(out, "&lt;script&gt;");
  assertEquals(out.includes("<script>"), false);
});

Deno.test("html preserves leading indent", OPTS, () => {
  const out = mushMessageToHtml(" A room desc");
  assertEquals(out.startsWith(" "), true);
});
