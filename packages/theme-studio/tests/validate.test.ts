/**
 * Phase 0 validation tests.
 */
import {
  assert,
  assertEquals,
  assertRejects,
} from "jsr:@std/assert@^1.0.0";
import { warmTokenCatalog } from "../src/tokens.ts";
import {
  filterCssExtras,
  splitCssRules,
  validateAssetPath,
  validateCssExtras,
  validateDraft,
  validateManifest,
  validateTokens,
} from "../src/validate.ts";
import { loadSelectorsFile, loadTokensFile } from "../src/spec-data.ts";
import {
  packThemeZip,
  prepareExportPayload,
} from "../src/export-theme.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("warm catalog loads tokens.json", OPTS, async () => {
  const cat = await warmTokenCatalog();
  assert(cat.length > 20);
  assert(cat.some((t) => t.name === "--site-bg"));
  assert(cat.some((t) => t.name === "--site-accent"));
});

Deno.test("tokens.json matches engine token count loosely", OPTS, async () => {
  const f = await loadTokensFile();
  assertEquals(f.specVersion, "1.0.0");
  assert(f.tokens.length >= 40);
  for (const t of f.tokens) {
    assert(t.name.startsWith("--site-"));
    assert(t.default.length > 0);
  }
});

Deno.test("manifest id rules", OPTS, () => {
  const bad = validateManifest({ id: "Bad", label: "x" });
  assert(bad.some((i) => i.code === "manifest.id"));
  const ok = validateManifest({ id: "my-theme", label: "My" });
  assertEquals(ok.filter((i) => i.level === "error").length, 0);
});

Deno.test("asset path allows fonts and safe names", OPTS, () => {
  assertEquals(validateAssetPath("fonts/Brand-Display.woff2"), null);
  assertEquals(
    validateAssetPath("fonts/cyber_grotesk+demo.woff"),
    null,
  );
  assertEquals(validateAssetPath("imgs/termbg.png"), null);
  assert(validateAssetPath("other/x.png")?.level === "error");
  assert(validateAssetPath("fonts/../x.woff2")?.level === "error");
});

Deno.test("token name validation", OPTS, async () => {
  const f = await loadTokensFile();
  const issues = validateTokens({
    "--site-bg": "#fff",
    "not-a-token": "x",
    "--site-custom-foo": "1px",
  }, f.tokens);
  assert(issues.some((i) => i.code === "token.name"));
  assert(issues.some((i) => i.code === "token.unknown"));
});

Deno.test("cssExtras allowlist accepts .site-nav__brand", OPTS, async () => {
  const sel = await loadSelectorsFile();
  const css = `.site-nav__brand { letter-spacing: 0.05em; }`;
  const issues = validateCssExtras(css, sel);
  assertEquals(issues.filter((i) => i.level === "error").length, 0);
});

Deno.test("cssExtras rejects html/body and @import", OPTS, async () => {
  const sel = await loadSelectorsFile();
  const bad1 = validateCssExtras(`html { margin: 0; }`, sel);
  assert(bad1.some((i) => i.level === "error"));
  const bad2 = validateCssExtras(`@import url("x.css");`, sel);
  assert(bad2.some((i) => i.code === "cssExtras.forbidden"));
});

Deno.test("filterCssExtras drops illegal keeps good", OPTS, async () => {
  const sel = await loadSelectorsFile();
  const { css, dropped } = filterCssExtras(
    `
.site-nav__brand { color: red; }
body { display: none; }
.play-prompt__send { border-radius: 4px; }
`,
    sel,
  );
  assert(css.includes("site-nav__brand"));
  assert(css.includes("play-prompt__send"));
  assert(!css.includes("body"));
  assert(dropped.length >= 1);
});

Deno.test("splitCssRules handles multiple rules", OPTS, () => {
  const rules = splitCssRules(`
.a { color: red; }
.b { color: blue; }
`);
  assertEquals(rules.length, 2);
});

Deno.test("validateDraft happy path", OPTS, async () => {
  await warmTokenCatalog();
  const r = await validateDraft({
    specVersion: "1.0.0",
    manifest: { id: "demo", label: "Demo" },
    tokens: { "--site-bg": "#111111", "--site-accent": "#a78bfa" },
    cssExtras: ".site-banner__title { font-weight: 700; }",
  });
  assert(r.ok, JSON.stringify(r.errors));
});

Deno.test("prepareExportPayload + packThemeZip", OPTS, async () => {
  await warmTokenCatalog();
  const { payload, warnings } = await prepareExportPayload({
    manifest: { id: "p0-demo", label: "P0", title: "P0", plainBg: true },
    tokens: { "--site-bg": "#0b0a12", "--site-text": "#f0eef8" },
    cssExtras: `
.site-nav__brand { letter-spacing: 0.02em; }
body { outline: 1px solid red; }
`,
  });
  assert(!payload.cssExtras?.includes("body"));
  assert(payload.cssExtras?.includes("site-nav__brand"));
  assert(warnings.length >= 1);
  const { zip, filename } = packThemeZip(payload);
  assertEquals(filename, "p0-demo.zip");
  assert(zip.byteLength > 100);
});

Deno.test("prepareExportPayload rejects bad id", OPTS, async () => {
  await warmTokenCatalog();
  await assertRejects(
    () =>
      prepareExportPayload({
        manifest: { id: "NOPE", label: "x" },
        tokens: {},
      }),
    Error,
  );
});
