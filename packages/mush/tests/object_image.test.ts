/**
 * Local object images — validate + paths.
 */
import { assertEquals } from "@std/assert";
import {
  isPlayableImageUrl,
  publicImageUrl,
  validateImageBytes,
  bareObjId,
} from "../src/media/object-image.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("bareObjId strips #", OPTS, () => {
  assertEquals(bareObjId("#12"), "12");
  assertEquals(bareObjId("12"), "12");
});

Deno.test("publicImageUrl", OPTS, () => {
  assertEquals(publicImageUrl("5", "png"), "/images/5.png");
});

Deno.test("isPlayableImageUrl", OPTS, () => {
  assertEquals(isPlayableImageUrl("https://x.com/a.png"), true);
  assertEquals(isPlayableImageUrl("/images/1.jpg"), true);
  assertEquals(isPlayableImageUrl("/avatars/1.jpg"), true);
  assertEquals(isPlayableImageUrl("/site/theme/x.png"), true);
  assertEquals(isPlayableImageUrl("javascript:alert(1)"), false);
  assertEquals(isPlayableImageUrl("../etc/passwd"), false);
});

Deno.test("validateImageBytes png magic", OPTS, () => {
  const png = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0,
  ]);
  const r = validateImageBytes(png);
  assertEquals(r.ok, true);
  if (r.ok) assertEquals(r.ext, "png");
});

Deno.test("validateImageBytes rejects empty", OPTS, () => {
  const r = validateImageBytes(new Uint8Array(0));
  assertEquals(r.ok, false);
});
