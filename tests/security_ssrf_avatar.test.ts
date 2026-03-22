/**
 * tests/security_ssrf_avatar.test.ts
 *
 * [HIGH] SSRF — @avatar command fetches a player-supplied URL with only
 * http/https scheme validation. No private-IP / loopback / link-local check
 * exists. Any connected player can probe internal services (127.0.0.1,
 * 169.254.169.254 cloud metadata, RFC-1918 ranges, etc.).
 *
 * The sibling @wiki/fetch command has a full DNS-resolve + isPrivateIp guard;
 * avatar.ts has none.
 *
 * RED:  isPrivateHost is not yet exported from avatar.ts — test fails.
 * GREEN: export + guard added — test passes.
 */
import { assertEquals } from "@std/assert";
import { isPrivateHost } from "../src/commands/avatar.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

// ── private addresses that MUST be blocked ───────────────────────────────────

Deno.test("[SSRF] avatar — localhost is blocked", OPTS, () => {
  assertEquals(isPrivateHost("localhost"), true);
});

Deno.test("[SSRF] avatar — 127.0.0.1 (loopback) is blocked", OPTS, () => {
  assertEquals(isPrivateHost("127.0.0.1"), true);
});

Deno.test("[SSRF] avatar — 169.254.169.254 (cloud metadata) is blocked", OPTS, () => {
  assertEquals(isPrivateHost("169.254.169.254"), true);
});

Deno.test("[SSRF] avatar — 10.0.0.1 (RFC-1918) is blocked", OPTS, () => {
  assertEquals(isPrivateHost("10.0.0.1"), true);
});

Deno.test("[SSRF] avatar — 10.255.255.255 (RFC-1918 top) is blocked", OPTS, () => {
  assertEquals(isPrivateHost("10.255.255.255"), true);
});

Deno.test("[SSRF] avatar — 192.168.1.1 (RFC-1918) is blocked", OPTS, () => {
  assertEquals(isPrivateHost("192.168.1.1"), true);
});

Deno.test("[SSRF] avatar — 172.16.0.1 (RFC-1918) is blocked", OPTS, () => {
  assertEquals(isPrivateHost("172.16.0.1"), true);
});

Deno.test("[SSRF] avatar — 172.31.255.255 (RFC-1918 top) is blocked", OPTS, () => {
  assertEquals(isPrivateHost("172.31.255.255"), true);
});

Deno.test("[SSRF] avatar — 0.0.0.0 is blocked", OPTS, () => {
  assertEquals(isPrivateHost("0.0.0.0"), true);
});

Deno.test("[SSRF] avatar — ::1 (IPv6 loopback) is blocked", OPTS, () => {
  assertEquals(isPrivateHost("::1"), true);
});

Deno.test("[SSRF] avatar — fc00::1 (IPv6 ULA) is blocked", OPTS, () => {
  assertEquals(isPrivateHost("fc00::1"), true);
});

Deno.test("[SSRF] avatar — 100.64.0.1 (shared address space) is blocked", OPTS, () => {
  assertEquals(isPrivateHost("100.64.0.1"), true);
});

// ── public addresses that must NOT be blocked ────────────────────────────────

Deno.test("[SSRF] avatar — example.com is allowed (not private)", OPTS, () => {
  assertEquals(isPrivateHost("example.com"), false);
});

Deno.test("[SSRF] avatar — 8.8.8.8 (public) is allowed", OPTS, () => {
  assertEquals(isPrivateHost("8.8.8.8"), false);
});

Deno.test("[SSRF] avatar — 1.1.1.1 (public) is allowed", OPTS, () => {
  assertEquals(isPrivateHost("1.1.1.1"), false);
});

Deno.test("[SSRF] avatar — 172.15.0.1 (just below RFC-1918 range) is allowed", OPTS, () => {
  assertEquals(isPrivateHost("172.15.0.1"), false);
});

Deno.test("[SSRF] avatar — 172.32.0.1 (just above RFC-1918 range) is allowed", OPTS, () => {
  assertEquals(isPrivateHost("172.32.0.1"), false);
});
