/**
 * Unit tests for JSR pin bump helpers used by @restart / @update.
 */
import { assertEquals } from "@std/assert";
import {
  bumpUrsamuImports,
  formatJsrPin,
  isAppImportKey,
  parseJsrSpec,
  rangeVersion,
} from "../src/sys/codebase-update.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("parseJsrSpec: plain pin", OPTS, () => {
  assertEquals(parseJsrSpec("jsr:@ursamu/cofd-plugin@^1.1.8"), {
    pkg: "@ursamu/cofd-plugin",
    range: "^1.1.8",
    suffix: "",
  });
});

Deno.test("parseJsrSpec: trailing subpath", OPTS, () => {
  assertEquals(parseJsrSpec("jsr:@ursamu/mush@0.1.17/"), {
    pkg: "@ursamu/mush",
    range: "0.1.17",
    suffix: "/",
  });
});

Deno.test("parseJsrSpec: rejects vendor paths", OPTS, () => {
  assertEquals(parseJsrSpec("./vendor/mush/mod.ts"), null);
});

Deno.test("formatJsrPin: keeps caret", OPTS, () => {
  assertEquals(
    formatJsrPin("@ursamu/mush", "0.1.22", "^0.1.17"),
    "jsr:@ursamu/mush@^0.1.22",
  );
});

Deno.test("formatJsrPin: keeps tilde", OPTS, () => {
  assertEquals(
    formatJsrPin("@ursamu/core", "0.2.0", "~0.1.5"),
    "jsr:@ursamu/core@~0.2.0",
  );
});

Deno.test("formatJsrPin: exact pin stays exact", OPTS, () => {
  assertEquals(
    formatJsrPin("@ursamu/mail", "2.5.0", "2.4.0"),
    "jsr:@ursamu/mail@2.5.0",
  );
});

Deno.test("rangeVersion strips prefix", OPTS, () => {
  assertEquals(rangeVersion("^1.1.8"), "1.1.8");
  assertEquals(rangeVersion("0.1.6"), "0.1.6");
  assertEquals(rangeVersion("~0.1.5"), "0.1.5");
});

Deno.test("isAppImportKey skips jsr remap keys", OPTS, () => {
  assertEquals(isAppImportKey("@ursamu/help"), true);
  assertEquals(isAppImportKey("jsr:@ursamu/help@0.1.3"), false);
  assertEquals(isAppImportKey("ursamu"), true);
});

Deno.test("bumpUrsamuImports: bumps only app keys", OPTS, async () => {
  const fetchMeta = (pkg: string) => {
    if (pkg === "@ursamu/cofd-plugin") return Promise.resolve("1.1.8");
    if (pkg === "@ursamu/mush") return Promise.resolve("0.1.22");
    if (pkg === "@ursamu/help") return Promise.resolve("0.1.6");
    return Promise.resolve(null);
  };
  const { imports, bumped } = await bumpUrsamuImports(
    {
      "@ursamu/cofd": "jsr:@ursamu/cofd-plugin@^1.1.2",
      "@ursamu/mush": "jsr:@ursamu/mush@^0.1.17",
      "@ursamu/help": "jsr:@ursamu/help@^0.1.6",
      "jsr:@ursamu/help@0.1.3": "jsr:@ursamu/help@0.1.6",
      lodash: "npm:lodash@^4.18.1",
      local: "./vendor/builder/mod.ts",
    },
    fetchMeta,
  );
  assertEquals(imports["@ursamu/cofd"], "jsr:@ursamu/cofd-plugin@^1.1.8");
  assertEquals(imports["@ursamu/mush"], "jsr:@ursamu/mush@^0.1.22");
  // already on latest — unchanged
  assertEquals(imports["@ursamu/help"], "jsr:@ursamu/help@^0.1.6");
  // remap key left alone
  assertEquals(
    imports["jsr:@ursamu/help@0.1.3"],
    "jsr:@ursamu/help@0.1.6",
  );
  assertEquals(imports.lodash, "npm:lodash@^4.18.1");
  assertEquals(bumped.length, 2);
  // Dual-package overrides present for engine mush
  assertEquals(
    imports["jsr:@ursamu/mush@^0.1.1"],
    "jsr:@ursamu/mush@0.1.22",
  );
});

Deno.test("bumpUrsamuImports: no-op when current", OPTS, async () => {
  const { imports, bumped } = await bumpUrsamuImports(
    { "@ursamu/mush": "jsr:@ursamu/mush@^0.1.22" },
    () => Promise.resolve("0.1.22"),
  );
  assertEquals(imports["@ursamu/mush"], "jsr:@ursamu/mush@^0.1.22");
  assertEquals(bumped.length, 0);
});

Deno.test("bumpUrsamuImports: exact rewrites caret to pin", OPTS, async () => {
  const { imports, bumped } = await bumpUrsamuImports(
    { "@ursamu/mush": "jsr:@ursamu/mush@^0.1.22" },
    () => Promise.resolve("0.1.22"),
    { exact: true },
  );
  assertEquals(imports["@ursamu/mush"], "jsr:@ursamu/mush@0.1.22");
  assertEquals(bumped.length, 1);
});
