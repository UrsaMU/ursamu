/**
 * SECURITY — exploit + patch tests for wiki-plugin.
 *
 * Covers:
 *   1. SSRF via webhook URL (RFC-1918, loopback, non-https)
 *   2. Path traversal in safePath()
 *   3. Metadata key injection via SAFE_KEY regex
 *   4. History timestamp traversal in readSnapshot()
 *   5. readLock bypass for draft pages
 */
import { assertEquals } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { isWebhookUrlSafe, isPrivateIp } from "../src/url-safety.ts";
import { safePath } from "../src/fs.ts";
import { readSnapshot } from "../src/history.ts";
import { isValidReadLock } from "../src/permissions.ts";

// ─── 1. SSRF guard ────────────────────────────────────────────────────────────

describe("isWebhookUrlSafe — SSRF guard", () => {
  it("EXPLOIT: http:// is blocked", () => {
    assertEquals(isWebhookUrlSafe("http://discord.com/api/webhooks/123"), false);
  });

  it("EXPLOIT: loopback 127.0.0.1 is blocked", () => {
    assertEquals(isWebhookUrlSafe("https://127.0.0.1/hook"), false);
  });

  it("EXPLOIT: localhost is blocked", () => {
    assertEquals(isWebhookUrlSafe("https://localhost/hook"), false);
  });

  it("EXPLOIT: RFC-1918 10.x is blocked", () => {
    assertEquals(isWebhookUrlSafe("https://10.0.0.1/hook"), false);
  });

  it("EXPLOIT: RFC-1918 192.168.x is blocked", () => {
    assertEquals(isWebhookUrlSafe("https://192.168.1.1/hook"), false);
  });

  it("EXPLOIT: RFC-1918 172.16-31 is blocked", () => {
    assertEquals(isWebhookUrlSafe("https://172.16.0.1/hook"), false);
    assertEquals(isWebhookUrlSafe("https://172.31.255.255/hook"), false);
  });

  it("EXPLOIT: link-local 169.254.x is blocked", () => {
    assertEquals(isWebhookUrlSafe("https://169.254.0.1/hook"), false);
  });

  it("EXPLOIT: IPv6 loopback ::1 is blocked", () => {
    assertEquals(isWebhookUrlSafe("https://[::1]/hook"), false);
  });

  it("PATCH: valid public https:// URL is allowed", () => {
    assertEquals(isWebhookUrlSafe("https://discord.com/api/webhooks/123/abc"), true);
  });

  it("PATCH: non-private https:// URL is allowed", () => {
    // Note: URL format only — no real token. GitHub push protection requires clearly-fake values.
    assertEquals(isWebhookUrlSafe("https://hooks.slack.com/services/TEST_TEAM/TEST_CHANNEL/TEST_WEBHOOK_TOKEN_PLACEHOLDER"), true);
  });
});

describe("isPrivateIp", () => {
  it("detects 127.0.0.1 as private", () => { assertEquals(isPrivateIp("127.0.0.1"), true); });
  it("detects 10.0.0.1 as private", () => { assertEquals(isPrivateIp("10.0.0.1"), true); });
  it("detects 192.168.1.1 as private", () => { assertEquals(isPrivateIp("192.168.1.1"), true); });
  it("detects 172.20.0.1 as private", () => { assertEquals(isPrivateIp("172.20.0.1"), true); });
  it("detects 169.254.0.1 as private (link-local)", () => { assertEquals(isPrivateIp("169.254.0.1"), true); });
  it("does not flag 8.8.8.8", () => { assertEquals(isPrivateIp("8.8.8.8"), false); });
  it("does not flag 1.1.1.1", () => { assertEquals(isPrivateIp("1.1.1.1"), false); });
  it("detects ::1 as private", () => { assertEquals(isPrivateIp("::1"), true); });
});

// ─── 2. Path traversal ────────────────────────────────────────────────────────

describe("safePath — path traversal guard", () => {
  it("EXPLOIT: ../etc/passwd is blocked", () => {
    assertEquals(safePath("../etc/passwd"), null);
  });

  it("EXPLOIT: ../../sensitive is blocked", () => {
    assertEquals(safePath("news/../../sensitive"), null);
  });

  it("EXPLOIT: absolute path is blocked", () => {
    assertEquals(safePath("/etc/passwd"), null);
  });

  it("PATCH: legitimate path is allowed", () => {
    assertEquals(safePath("news/battle.md") !== null, true);
  });

  it("PATCH: nested path is allowed", () => {
    assertEquals(safePath("a/b/c/page.md") !== null, true);
  });
});

// ─── 3. Metadata key injection ────────────────────────────────────────────────

describe("SAFE_KEY regex — metadata key injection", () => {
  const SAFE_KEY = /^[\w-]+$/;

  it("EXPLOIT: key with script tag is blocked", () => {
    assertEquals(SAFE_KEY.test("<script>alert(1)</script>"), false);
  });

  it("EXPLOIT: key with spaces is blocked", () => {
    assertEquals(SAFE_KEY.test("bad key"), false);
  });

  it("EXPLOIT: key with newline is blocked", () => {
    assertEquals(SAFE_KEY.test("key\ninjection"), false);
  });

  it("PATCH: valid word key is allowed", () => {
    assertEquals(SAFE_KEY.test("my-tag"), true);
    assertEquals(SAFE_KEY.test("title"), true);
    assertEquals(SAFE_KEY.test("readLock"), true);
  });
});

// ─── 4. History timestamp traversal ──────────────────────────────────────────

describe("readSnapshot — timestamp path traversal", () => {
  it("EXPLOIT: traversal timestamp returns null", async () => {
    const result = await readSnapshot("some/page", "../../../etc/passwd");
    assertEquals(result, null);
  });

  it("EXPLOIT: timestamp with path separators returns null", async () => {
    const result = await readSnapshot("some/page", "2024-01-01/../../evil");
    assertEquals(result, null);
  });

  it("PATCH: valid ISO-ish timestamp (not found) returns null without throwing", async () => {
    const result = await readSnapshot("nonexistent/page", "2024-01-01T00-00-00.000Z");
    assertEquals(result, null);
  });
});

// ─── 5. readLock validation ───────────────────────────────────────────────────

describe("isValidReadLock — lock bypass prevention", () => {
  it("EXPLOIT: arbitrary string is rejected", () => {
    assertEquals(isValidReadLock("public"), false);
    assertEquals(isValidReadLock("everyone"), false);
    assertEquals(isValidReadLock(""), false);
  });

  it("EXPLOIT: injection attempt is rejected", () => {
    assertEquals(isValidReadLock("connected; DROP TABLE users;--"), false);
  });

  it("PATCH: valid locks are accepted", () => {
    assertEquals(isValidReadLock("connected"), true);
    assertEquals(isValidReadLock("admin"), true);
    assertEquals(isValidReadLock("staff"), true);
    assertEquals(isValidReadLock("faction:abc123"), true);
  });
});
