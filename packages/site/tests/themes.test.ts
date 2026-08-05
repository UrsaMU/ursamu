/**
 * FE theme zip install + registry.
 */
import {
  assertEquals,
  assertExists,
  assertStringIncludes,
} from "@std/assert";
import { join } from "@std/path";
import { zipSync } from "npm:fflate@0.8.2";
import {
  clearRegisteredThemes,
  installThemeZip,
  isThemeId,
  listAllThemes,
  registerSiteTheme,
  scanInstalledThemes,
  themeToSiteConfig,
} from "../src/themes.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function makeZip(
  files: Record<string, string | Uint8Array>,
  rootPrefix = "mytheme/",
): Uint8Array {
  const enc = new TextEncoder();
  const body: Record<string, Uint8Array> = {};
  for (const [k, v] of Object.entries(files)) {
    body[rootPrefix + k] = typeof v === "string" ? enc.encode(v) : v;
  }
  return zipSync(body);
}

Deno.test("isThemeId validates ids", OPTS, () => {
  assertEquals(isThemeId("court"), true);
  assertEquals(isThemeId("my-theme_1"), true);
  assertEquals(isThemeId("Bad"), true); // lowercased
  assertEquals(isThemeId("9bad"), false);
  assertEquals(isThemeId("../x"), false);
  assertEquals(isThemeId(""), false);
});

Deno.test(
  "installThemeZip writes package and registers",
  OPTS,
  async () => {
    clearRegisteredThemes();
    const tmp = await Deno.makeTempDir({ prefix: "ursamu-theme-" });
    try {
      const zip = makeZip({
        "theme.json": JSON.stringify({
          id: "demo",
          label: "Demo Theme",
          version: "1.2.0",
          css: "site.css",
          bannerImage: "imgs/header.png",
          title: "Demo",
        }),
        "site.css":
          "/* demo */\n:root{--x:url(\"imgs/bg.png\")}\n",
        "imgs/header.png": new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
      });

      const r = await installThemeZip(zip, { cwd: tmp });
      assertEquals(r.ok, true);
      if (!r.ok) return;

      assertEquals(r.theme.id, "demo");
      assertEquals(r.theme.label, "Demo Theme");
      assertEquals(
        r.theme.skinCss,
        "/site/theme/installed/demo/site.css",
      );
      assertEquals(
        r.theme.bannerHref,
        "/site/theme/installed/demo/imgs/header.png",
      );

      const cssPath = join(
        tmp,
        "theme",
        "installed",
        "demo",
        "site.css",
      );
      const css = await Deno.readTextFile(cssPath);
      assertStringIncludes(css, "demo");
      // Relative imgs/ rewritten for CSS-var use from layout.css
      assertStringIncludes(
        css,
        'url("/site/theme/installed/demo/imgs/bg.png")',
      );

      const scanned = await scanInstalledThemes(tmp);
      assertEquals(scanned.some((t) => t.id === "demo"), true);

      const patch = themeToSiteConfig(r.theme);
      assertEquals(patch.skin, "demo");
      assertEquals(patch.themeDir, "theme");
      assertEquals(
        patch.skinCss,
        "/site/theme/installed/demo/site.css",
      );
    } finally {
      clearRegisteredThemes();
      await Deno.remove(tmp, { recursive: true });
    }
  },
);

Deno.test("installThemeZip rejects path traversal", OPTS, async () => {
  clearRegisteredThemes();
  const tmp = await Deno.makeTempDir({ prefix: "ursamu-theme-" });
  try {
    const zip = makeZip({
      "theme.json": JSON.stringify({
        id: "evil",
        label: "Evil",
        css: "site.css",
      }),
      "site.css": "x",
      "../outside.txt": "nope",
    }, "");
    const r = await installThemeZip(zip, { cwd: tmp });
    assertEquals(r.ok, false);
    if (r.ok) return;
    assertStringIncludes(r.error.toLowerCase(), "disallowed");
  } finally {
    clearRegisteredThemes();
    await Deno.remove(tmp, { recursive: true });
  }
});

Deno.test("installThemeZip requires theme.json + css", OPTS, async () => {
  clearRegisteredThemes();
  const tmp = await Deno.makeTempDir({ prefix: "ursamu-theme-" });
  try {
    const noMan = makeZip({ "site.css": "x" });
    const r1 = await installThemeZip(noMan, { cwd: tmp });
    assertEquals(r1.ok, false);

    const noCss = makeZip({
      "theme.json": JSON.stringify({
        id: "x",
        label: "X",
        css: "missing.css",
      }),
    });
    const r2 = await installThemeZip(noCss, { cwd: tmp });
    assertEquals(r2.ok, false);
    if (!r2.ok) assertStringIncludes(r2.error, "CSS");
  } finally {
    clearRegisteredThemes();
    await Deno.remove(tmp, { recursive: true });
  }
});

Deno.test("registerSiteTheme + listAllThemes", OPTS, async () => {
  clearRegisteredThemes();
  const ok = registerSiteTheme({
    id: "plugin-skin",
    label: "From Plugin",
    source: "registered",
    skinCss: "/site/p/foo/skin.css",
  });
  assertEquals(ok, true);
  const all = await listAllThemes(await Deno.makeTempDir());
  assertExists(all.find((t) => t.id === "plugin-skin"));
  clearRegisteredThemes();
});

Deno.test("themeToSiteConfig builtin clears custom css", OPTS, () => {
  const patch = themeToSiteConfig({
    id: "default",
    label: "Default",
    source: "builtin",
    skinCss: "/site/css/skins/default.css",
  });
  assertEquals(patch.skin, "default");
  assertEquals(patch.skinCss, "");
  assertEquals(patch.themeDir, undefined);
});

Deno.test("themeToSiteConfig installed court sets skinCss", OPTS, () => {
  const patch = themeToSiteConfig({
    id: "court",
    label: "Court of Miracles",
    source: "installed",
    skinCss: "/site/theme/installed/court/site.css",
    bannerHref: "/site/theme/installed/court/imgs/header.png",
    title: "Court of Miracles",
  });
  assertEquals(patch.skin, "court");
  assertEquals(
    patch.skinCss,
    "/site/theme/installed/court/site.css",
  );
  assertEquals(patch.themeDir, "theme");
  assertEquals(
    patch.bannerImage,
    "/site/theme/installed/court/imgs/header.png",
  );
});
