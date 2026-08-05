import { assertEquals } from "jsr:@std/assert@^1.0.0";
import {
  listBuiltinSkins,
  skinCssHref,
} from "../src/skins.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("listBuiltinSkins is default-only", OPTS, async () => {
  const skins = await listBuiltinSkins();
  assertEquals(skins.includes("default"), true);
  assertEquals(skins.includes("changeling"), false);
  assertEquals(skins.includes("court"), false);
  assertEquals(skins.includes("custom.example"), false);
});

Deno.test("skinCssHref", OPTS, () => {
  assertEquals(
    skinCssHref("default"),
    "/site/css/skins/default.css",
  );
});
