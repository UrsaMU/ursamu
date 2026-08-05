/**
 * Local object images — validate + paths + downsample.
 */
import { assertEquals } from "@std/assert";
import { Image } from "imagescript";
import {
  isPlayableImageUrl,
  publicImageUrl,
  validateImageBytes,
  bareObjId,
  TARGET_SAVE_BYTES,
} from "../src/media/object-image.ts";
import { downsampleIfNeeded } from "../src/media/downsample.ts";

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

Deno.test(
  "downsampleIfNeeded leaves small images alone",
  OPTS,
  async () => {
    const img = new Image(32, 32);
    img.fill(0xff0000ff);
    const bytes = await img.encodeJPEG(90);
    const r = await downsampleIfNeeded(bytes, "jpg");
    assertEquals(r.ok, true);
    if (r.ok) {
      assertEquals(r.bytes.length, bytes.length);
      assertEquals(r.ext, "jpg");
    }
  },
);

Deno.test(
  "downsampleIfNeeded reduces images over target",
  OPTS,
  async () => {
    // Noisy fill so JPEG does not collapse to tiny
    const img = new Image(1200, 1200);
    for (let y = 1; y <= img.height; y++) {
      for (let x = 1; x <= img.width; x++) {
        const n = ((x * 73 + y * 31) & 0xff);
        img.setPixelAt(
          x,
          y,
          (n << 24) | (n << 16) | (n << 8) | 0xff,
        );
      }
    }
    const big = await img.encodeJPEG(95);
    // Force downsample path even if under 2 MB
    const target = Math.min(
      TARGET_SAVE_BYTES,
      Math.max(8_000, Math.floor(big.length * 0.25)),
    );
    assertEquals(big.length > target, true);
    const r = await downsampleIfNeeded(big, "jpg", target);
    assertEquals(r.ok, true);
    if (r.ok) {
      assertEquals(r.bytes.length <= target, true);
      assertEquals(
        r.ext === "jpg" || r.ext === "webp",
        true,
      );
    }
  },
);
