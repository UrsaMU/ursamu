import { assertEquals } from "jsr:@std/assert@1";
import { formatDate, PAD, HR } from "../src/mailHelpers.ts";
import { MAIL_QUOTA, EXPIRY_SWEEP_MS } from "../src/mailDbo.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("PAD truncates and pads", OPTS, () => {
  assertEquals(PAD("hi", 5), "hi   ");
  assertEquals(PAD("toolong", 4), "tool");
});

Deno.test("HR is 77 dashes", OPTS, () => {
  assertEquals(HR.length, 77);
});

Deno.test("formatDate is non-empty", OPTS, () => {
  const s = formatDate(Date.UTC(2026, 0, 15, 12, 0, 0));
  assertEquals(typeof s, "string");
  assertEquals(s.includes("2026"), true);
});

Deno.test("MAIL_QUOTA and EXPIRY_SWEEP_MS constants", OPTS, () => {
  assertEquals(MAIL_QUOTA, 100);
  assertEquals(EXPIRY_SWEEP_MS, 60 * 60 * 1000);
});
