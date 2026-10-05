import {
  assert,
  assertEquals,
} from "jsr:@std/assert@^1.0.0";
import {
  checkContrast,
  contrastRatio,
  parseColor,
} from "../src/contrast.ts";
import { loadPresets } from "../src/presets.ts";
import { tokensToDualCss, warmTokenCatalog } from "../src/tokens.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("parseColor hex and rgb", OPTS, () => {
  assertEquals(parseColor("#fff")?.r, 1);
  assertEquals(parseColor("#000000")?.r, 0);
  assert(parseColor("rgb(255, 0, 0)") != null);
  assertEquals(parseColor("var(--site-bg)"), null);
});

Deno.test("contrastRatio black/white is 21", OPTS, () => {
  const r = contrastRatio("#000000", "#ffffff");
  assert(r != null && r > 20);
});

Deno.test("violet-night text on bg passes AA", OPTS, async () => {
  const presets = await loadPresets();
  const v = presets.presets.find((p) => p.id === "violet-night");
  assert(v);
  const results = checkContrast(v!.tokens);
  const body = results.find((r) => r.id === "text-bg");
  assert(body?.pass === true, JSON.stringify(body));
});

Deno.test("tokensToDualCss emits media and data-theme", OPTS, async () => {
  await warmTokenCatalog();
  const css = tokensToDualCss(
    { "--site-bg": "#ffffff", "--site-text": "#111111" },
    { "--site-bg": "#0b0a12", "--site-text": "#f0eef8" },
    "",
  );
  assert(css.includes("prefers-color-scheme: dark"));
  assert(css.includes('data-theme="dark"'));
  assert(css.includes("#ffffff"));
  assert(css.includes("#0b0a12"));
});
