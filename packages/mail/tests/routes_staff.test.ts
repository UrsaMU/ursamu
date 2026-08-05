/**
 * Staff mail REST path guards (unit-level path parsing).
 */
import { assertEquals } from "jsr:@std/assert@^1.0.0";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function isCollectionPath(path: string): boolean {
  return path === "/api/v1/mail" ||
    path === "/api/v1/mail/sent" ||
    path === "/api/v1/mail/stats" ||
    path === "/api/v1/mail/all";
}

Deno.test("mail staff paths are collection routes", OPTS, () => {
  assertEquals(isCollectionPath("/api/v1/mail"), true);
  assertEquals(isCollectionPath("/api/v1/mail/all"), true);
  assertEquals(isCollectionPath("/api/v1/mail/stats"), true);
  assertEquals(isCollectionPath("/api/v1/mail/sent"), true);
  assertEquals(isCollectionPath("/api/v1/mail/abc"), false);
});
