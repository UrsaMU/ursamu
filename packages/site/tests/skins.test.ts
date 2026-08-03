import { assertEquals } from "jsr:@std/assert@^1.0.0";
import {
  listBuiltinSkins,
  skinCssHref,
} from "../src/skins.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("listBuiltinSkins includes default", OPTS, async () => {
  const skins = await listBuiltinSkins();
  assertEquals(skins.includes("default"), true);
  assertEquals(skins.includes("changeling"), true);
  assertEquals(skins.includes("custom.example"), false);
});

Deno.test("skinCssHref", OPTS, () => {
  assertEquals(
    skinCssHref("changeling"),
    "/site/css/skins/changeling.css",
  );
});
