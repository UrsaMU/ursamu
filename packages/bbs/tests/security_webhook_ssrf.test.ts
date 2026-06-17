/**
 * SECURITY — exploit tests for webhook URL SSRF.
 */
import { assertEquals } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { isWebhookUrlSafe } from "../src/url-safety.ts";

function isWebhookUrlSafeVulnerable(url: string): boolean {
  return url.startsWith("https://");
}

const isWebhookUrlSafePatched = isWebhookUrlSafe;

describe("SSRF exploit — vulnerable implementation", () => {
  it("EXPLOIT: localhost URL passes current https check", () => {
    assertEquals(isWebhookUrlSafeVulnerable("https://localhost/steal"), true);
  });
  it("EXPLOIT: 127.0.0.1 passes current https check", () => {
    assertEquals(isWebhookUrlSafeVulnerable("https://127.0.0.1/admin"), true);
  });
  it("EXPLOIT: 192.168.1.1 passes current https check", () => {
    assertEquals(isWebhookUrlSafeVulnerable("https://192.168.1.1/internal"), true);
  });
  it("EXPLOIT: 10.0.0.1 passes current https check", () => {
    assertEquals(isWebhookUrlSafeVulnerable("https://10.0.0.1/secrets"), true);
  });
  it("EXPLOIT: 172.16.0.1 passes current https check", () => {
    assertEquals(isWebhookUrlSafeVulnerable("https://172.16.0.1/internal"), true);
  });
});

describe("SSRF patch — blocked internal URLs", () => {
  it("blocks https://localhost", () => {
    assertEquals(isWebhookUrlSafePatched("https://localhost/steal"), false);
  });
  it("blocks https://127.0.0.1", () => {
    assertEquals(isWebhookUrlSafePatched("https://127.0.0.1/admin"), false);
  });
  it("blocks https://192.168.1.1", () => {
    assertEquals(isWebhookUrlSafePatched("https://192.168.1.1/internal"), false);
  });
  it("blocks https://10.0.0.1", () => {
    assertEquals(isWebhookUrlSafePatched("https://10.0.0.1/secrets"), false);
  });
  it("blocks https://172.16.0.1", () => {
    assertEquals(isWebhookUrlSafePatched("https://172.16.0.1/internal"), false);
  });
  it("blocks https://169.254.1.1 (link-local)", () => {
    assertEquals(isWebhookUrlSafePatched("https://169.254.1.1/meta"), false);
  });
  it("allows legitimate Discord webhook URL", () => {
    assertEquals(isWebhookUrlSafePatched("https://discord.com/api/webhooks/123/abc"), true);
  });
  it("blocks http:// URLs", () => {
    assertEquals(isWebhookUrlSafePatched("http://discord.com/api/webhooks/123/abc"), false);
  });
  it("blocks malformed URLs", () => {
    assertEquals(isWebhookUrlSafePatched("https://"), false);
  });
  it("blocks empty string", () => {
    assertEquals(isWebhookUrlSafePatched(""), false);
  });
});
