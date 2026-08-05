import { assertEquals } from "jsr:@std/assert@^1.0.0";
import {
  monikerToHtml,
  toWebSafeHex,
  webSafeChannel,
} from "../src/render/moniker-html.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("webSafeChannel snaps to 216 palette", OPTS, () => {
  assertEquals(webSafeChannel(0), 0);
  assertEquals(webSafeChannel(255), 255);
  assertEquals(webSafeChannel(40), 51);
  assertEquals(webSafeChannel(200), 204);
});

Deno.test("toWebSafeHex", OPTS, () => {
  assertEquals(toWebSafeHex("ff0000"), "#ff0000");
  assertEquals(toWebSafeHex("#00c800"), "#00cc00");
});

Deno.test("monikerToHtml: plain text escaped", OPTS, () => {
  assertEquals(monikerToHtml("Alice <bob>"), "Alice &lt;bob&gt;");
});

Deno.test("monikerToHtml: %c colors to web-safe hex spans", OPTS, () => {
  const html = monikerToHtml("%ch%crRed%cn");
  assertEquals(html?.includes("color:#FF0000"), true);
  assertEquals(html?.includes("<b>"), true);
  assertEquals(html?.includes("Red"), true);
  assertEquals(html?.includes("%c"), false);
});

Deno.test("monikerToHtml: truecolor snapped to web-safe", OPTS, () => {
  const html = monikerToHtml("<#00c800>Go%cn");
  // 00c800 → 00cc00
  assertEquals(html?.includes("color:#00cc00"), true);
  assertEquals(html?.includes("Go"), true);
});

Deno.test("monikerToHtml: empty", OPTS, () => {
  assertEquals(monikerToHtml(""), null);
  assertEquals(monikerToHtml(null), null);
});
