/**
 * Connect splash: HTML detect, sanitize, play-parity render.
 */
import { assertEquals, assertStringIncludes } from "@std/assert";
import {
  buildLoginPreviewSrcdoc,
  looksLikeHtml,
  renderSplash,
  resolveSiteSkinHref,
  sanitizeLoginHtml,
} from "../ui/src/utils/loginSplash.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("looksLikeHtml: markdown is false", OPTS, () => {
  assertEquals(looksLikeHtml("# Welcome\n\n**hi**"), false);
  assertEquals(looksLikeHtml("Use <CG> East"), false);
});

Deno.test("looksLikeHtml: real tags are true", OPTS, () => {
  assertEquals(looksLikeHtml("<h1>Court</h1>"), true);
  assertEquals(
    looksLikeHtml('<img src="/site/x.png" alt="x">'),
    true,
  );
  assertEquals(looksLikeHtml("<center>Hi</center>"), true);
});

Deno.test(
  "looksLikeHtml: center wrapping markdown is false",
  OPTS,
  () => {
    assertEquals(
      looksLikeHtml(
        "<center>\n# Welcome\n\nHello\n</center>",
      ),
      false,
    );
  },
);

Deno.test("sanitizeLoginHtml: strips script and on*", OPTS, () => {
  const dirty =
    '<p onclick="alert(1)">ok</p><script>evil()</script>' +
    '<img src=x onerror=alert(1)>';
  const clean = sanitizeLoginHtml(dirty);
  assertEquals(/script/i.test(clean), false);
  assertEquals(/onerror/i.test(clean), false);
  assertEquals(/onclick/i.test(clean), false);
  assertStringIncludes(clean, "ok");
});

Deno.test("sanitizeLoginHtml: keeps safe img and center", OPTS, () => {
  const raw =
    '<center><img src="/site/theme/a.png" alt="banner"></center>' +
    "<p>Welcome</p>";
  const clean = sanitizeLoginHtml(raw);
  assertStringIncludes(clean, "<center>");
  assertStringIncludes(clean, 'src="/site/theme/a.png"');
  assertStringIncludes(clean, "Welcome");
  assertEquals(/javascript:/i.test(clean), false);
});

Deno.test("sanitizeLoginHtml: drops javascript href", OPTS, () => {
  const clean = sanitizeLoginHtml(
    '<a href="javascript:alert(1)">x</a>',
  );
  assertEquals(/javascript:/i.test(clean), false);
  assertStringIncludes(clean, "x");
});

Deno.test("renderSplash: markdown uses play-md classes", OPTS, () => {
  const html = renderSplash("# Hello\n\n**bold**");
  assertStringIncludes(html, 'class="play-md"');
  assertStringIncludes(html, "play-md__h");
  assertStringIncludes(html, "<strong>bold</strong>");
});

Deno.test(
  "renderSplash: center+md gets play-md--center",
  OPTS,
  () => {
    const html = renderSplash(
      "<center>\n# Welcome\n\nGo\n</center>",
    );
    assertStringIncludes(html, "play-md--center");
    assertStringIncludes(html, "play-md__h");
    assertEquals(html.includes("# Welcome"), false);
  },
);

Deno.test("resolveSiteSkinHref named + custom", OPTS, () => {
  assertEquals(
    resolveSiteSkinHref("court", ""),
    "/site/css/skins/court.css?v=admin-preview",
  );
  assertEquals(
    resolveSiteSkinHref("default", "/site/theme/installed/x/site.css"),
    "/site/theme/installed/x/site.css?v=admin-preview",
  );
});

Deno.test("buildLoginPreviewSrcdoc loads site CSS", OPTS, () => {
  const doc = buildLoginPreviewSrcdoc({
    content: "# Court\n\nHello",
    skin: "default",
    skinCss: "",
    origin: "https://example.test",
  });
  assertStringIncludes(
    doc,
    "https://example.test/site/css/tokens.css",
  );
  assertStringIncludes(
    doc,
    "https://example.test/site/css/play.css",
  );
  assertStringIncludes(
    doc,
    "https://example.test/site/css/skins/default.css",
  );
  assertStringIncludes(doc, "play-layout--login");
  assertStringIncludes(doc, "play-md__h");
  assertStringIncludes(doc, 'data-skin="default"');
});
