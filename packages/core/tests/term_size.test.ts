/**
 * Terminal size helpers: clamp + wordWrap width from session meta.
 */
import { assertEquals } from "@std/assert";
import {
  clampTermWidth,
  clampTermHeight,
  applySessionTermSize,
  wordWrap,
  resolveWrapWidth,
  sessions,
} from "../mod.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("clampTermWidth bounds", OPTS, () => {
  assertEquals(clampTermWidth(-1), null);
  assertEquals(clampTermWidth(39), null);
  assertEquals(clampTermWidth(40), 40);
  assertEquals(clampTermWidth(80.9), 80);
  assertEquals(clampTermWidth(250), 250);
  assertEquals(clampTermWidth(251), null);
  assertEquals(clampTermWidth("80"), null);
});

Deno.test("clampTermHeight bounds", OPTS, () => {
  assertEquals(clampTermHeight(0), null);
  assertEquals(clampTermHeight(1), 1);
  assertEquals(clampTermHeight(24.2), 24);
  assertEquals(clampTermHeight(255), 255);
  assertEquals(clampTermHeight(256), null);
});

Deno.test("applySessionTermSize writes meta", OPTS, () => {
  const sid = "term_apply_sock";
  sessions.open(sid, "");
  assertEquals(applySessionTermSize(sid, 100, 40), true);
  const s = sessions.get(sid)!;
  assertEquals(s.meta.termWidth, 100);
  assertEquals(s.meta.termHeight, 40);
  assertEquals(applySessionTermSize(sid, 10, 0), false);
  sessions.close(sid);
});

Deno.test(
  "resolveWrapWidth / wordWrap honor session width",
  OPTS,
  () => {
    const sid = "term_wrap_test_sock";
    sessions.open(sid, "");
    const s = sessions.get(sid)!;
    s.meta.clientType = "telnet";
    s.meta.termWidth = 40;
    assertEquals(resolveWrapWidth(sid), 40);

    // Space-separated words (wrap is word-based)
    const line = Array.from({ length: 20 }, () => "word").join(" ");
    const out = wordWrap(line, resolveWrapWidth(sid));
    const lines = out.split("\n");
    assertEquals(lines.length >= 2, true);
    for (const ln of lines) {
      const clean = ln.replace(/\s+$/, "");
      assertEquals(clean.length <= 40, true);
    }

    sessions.close(sid);
  },
);

Deno.test(
  "wordWrap default 78 when no session width",
  OPTS,
  () => {
    assertEquals(resolveWrapWidth(), 78);
    const line = Array.from({ length: 30 }, () => "word").join(" ");
    const out = wordWrap(line);
    assertEquals(out.includes("\n"), true);
  },
);
