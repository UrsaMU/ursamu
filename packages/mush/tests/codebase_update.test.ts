/**
 * Unit tests for JSR pin bump helpers used by @restart / @update.
 */
import { assertEquals } from "@std/assert";
import {
  bumpUrsamuImports,
  formatJsrPin,
  parseJsrSpec,
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

Deno.test("formatJsrPin: exact pin becomes caret", OPTS, () => {
  assertEquals(
    formatJsrPin("@ursamu/mail", "2.5.0", "2.4.0"),
    "jsr:@ursamu/mail@^2.5.0",
  );
});

Deno.test("bumpUrsamuImports: bumps only @ursamu JSR", OPTS, async () => {
  const fetchMeta = async (pkg: string) => {
    if (pkg === "@ursamu/cofd-plugin") return "1.1.8";
    if (pkg === "@ursamu/mush") return "0.1.22";
    return null;
  };
  const { imports, bumped } = await bumpUrsamuImports(
    {
      "@ursamu/cofd": "jsr:@ursamu/cofd-plugin@^1.1.2",
      "@ursamu/cofd-plugin": "jsr:@ursamu/cofd-plugin@^1.1.2",
      "@ursamu/mush": "jsr:@ursamu/mush@^0.1.17",
      lodash: "npm:lodash@^4.18.1",
      local: "./vendor/builder/mod.ts",
    },
    fetchMeta,
  );
  assertEquals(imports["@ursamu/cofd"], "jsr:@ursamu/cofd-plugin@^1.1.8");
  assertEquals(
    imports["@ursamu/cofd-plugin"],
    "jsr:@ursamu/cofd-plugin@^1.1.8",
  );
  assertEquals(imports["@ursamu/mush"], "jsr:@ursamu/mush@^0.1.22");
  assertEquals(imports.lodash, "npm:lodash@^4.18.1");
  assertEquals(imports.local, "./vendor/builder/mod.ts");
  assertEquals(bumped.length, 3);
});

Deno.test("bumpUrsamuImports: no-op when current", OPTS, async () => {
  const { imports, bumped } = await bumpUrsamuImports(
    { "@ursamu/mush": "jsr:@ursamu/mush@^0.1.22" },
    async () => "0.1.22",
  );
  assertEquals(imports["@ursamu/mush"], "jsr:@ursamu/mush@^0.1.22");
  assertEquals(bumped.length, 0);
});
