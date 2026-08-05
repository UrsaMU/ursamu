import { assertEquals } from "@std/assert";
import { mapDivider, mapFooter, mapHeader } from "../chrome.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };
const strip = (s: string) => s.replace(/%c[a-z]/gi, "");

Deno.test("mapHeader is 78 cols plain ASCII", OPTS, () => {
  const h = mapHeader("SECTOR TEST");
  assertEquals(strip(h).length, 78);
  assertEquals(h.includes("SECTOR TEST"), true);
  assertEquals(h.includes("0 0 0"), false);
  assertEquals(h.startsWith("="), true);
});

Deno.test("mapDivider and footer widths", OPTS, () => {
  assertEquals(strip(mapDivider("FOO")).length, 78);
  assertEquals(mapFooter().length, 78);
});
