/**
 * SECURITY — SSRF exploit + patch tests.
 *
 * Covers:
 *   H1. DNS rebinding — buildPinnedFetchUrl pins resolved IP so Deno's fetch()
 *       cannot re-query DNS after validation.
 *   H2. IPv4-mapped IPv6 bypass — ::ffff:127.0.0.1 must be treated as loopback.
 */
import { assertEquals } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { isPrivateIp, buildPinnedFetchUrl } from "../src/url-safety.ts";

// ─── H2 — IPv4-mapped IPv6 bypass ────────────────────────────────────────────

describe("isPrivateIp — IPv4-mapped IPv6", () => {
  it("EXPLOIT: ::ffff:127.0.0.1 (mapped loopback) is blocked", () => {
    assertEquals(isPrivateIp("::ffff:127.0.0.1"), true);
  });

  it("EXPLOIT: ::ffff:10.0.0.1 (mapped RFC-1918) is blocked", () => {
    assertEquals(isPrivateIp("::ffff:10.0.0.1"), true);
  });

  it("EXPLOIT: ::ffff:192.168.1.1 (mapped RFC-1918) is blocked", () => {
    assertEquals(isPrivateIp("::ffff:192.168.1.1"), true);
  });

  it("EXPLOIT: ::ffff:172.16.0.1 (mapped RFC-1918) is blocked", () => {
    assertEquals(isPrivateIp("::ffff:172.16.0.1"), true);
  });

  it("PATCH: ::ffff:8.8.8.8 (mapped public) is allowed", () => {
    assertEquals(isPrivateIp("::ffff:8.8.8.8"), false);
  });
});

// ─── H1 — DNS rebinding via IP pinning ───────────────────────────────────────

describe("buildPinnedFetchUrl — DNS rebinding prevention", () => {
  it("PATCH: replaces hostname with resolved IPv4", () => {
    const pinned = buildPinnedFetchUrl("https://example.com/asset.png", "1.2.3.4");
    assertEquals(new URL(pinned).hostname, "1.2.3.4");
  });

  it("PATCH: preserves path, query, and fragment", () => {
    const pinned = buildPinnedFetchUrl("https://example.com/a/b.png?v=2#frag", "1.2.3.4");
    const u = new URL(pinned);
    assertEquals(u.pathname, "/a/b.png");
    assertEquals(u.search, "?v=2");
    assertEquals(u.hash, "#frag");
  });

  it("PATCH: wraps IPv6 address in brackets", () => {
    const pinned = buildPinnedFetchUrl("https://example.com/img.jpg", "2001:db8::1");
    // Deno's URL.hostname returns IPv6 with brackets (implementation-defined)
    assertEquals(pinned.includes("[2001:db8::1]"), true);
    // The pinned URL must not still contain the original hostname
    assertEquals(pinned.includes("example.com"), false);
  });

  it("PATCH: preserves scheme and port", () => {
    const pinned = buildPinnedFetchUrl("https://example.com:8443/path", "5.5.5.5");
    const u = new URL(pinned);
    assertEquals(u.hostname, "5.5.5.5");
    assertEquals(u.port, "8443");
    assertEquals(u.protocol, "https:");
  });
});
