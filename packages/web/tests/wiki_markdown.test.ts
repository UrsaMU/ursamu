import { assertEquals, assertStringIncludes } from
  "jsr:@std/assert@^1.0.0";
import { renderWikiMarkdown } from
  "../ui/src/utils/wikiMarkdown.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("renderWikiMarkdown: headings bold lists", OPTS, () => {
  const html = renderWikiMarkdown(
    "# Title\n\nHello **world**\n\n- one\n- two\n",
  );
  assertStringIncludes(html, "<h1 id=\"title\">Title</h1>");
  assertStringIncludes(html, "<strong>world</strong>");
  assertStringIncludes(html, "<ul>");
  assertStringIncludes(html, "<li>one</li>");
});

Deno.test("renderWikiMarkdown: escapes html", OPTS, () => {
  const html = renderWikiMarkdown("<script>alert(1)</script>");
  assertEquals(html.includes("<script>"), false);
  assertStringIncludes(html, "&lt;script&gt;");
});

Deno.test("renderWikiMarkdown: wikilinks", OPTS, () => {
  const html = renderWikiMarkdown("See [[lore/city|The City]].", {
    "lore/city": "City of Glass",
  });
  assertStringIncludes(html, 'href="/site/wiki/lore/city"');
  assertStringIncludes(html, "The City");
});

Deno.test("renderWikiMarkdown: blocks javascript urls", OPTS, () => {
  const html = renderWikiMarkdown("[x](javascript:alert(1))");
  assertEquals(html.includes("javascript:"), false);
});
