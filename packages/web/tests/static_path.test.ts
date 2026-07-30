/**
 * Path resolution for /admin/ static assets.
 */
import { assertEquals } from "@std/assert";
import { resolveAdminFile } from "../src/static.ts";
import { fromFileUrl } from "@std/path";

const ROOT = fromFileUrl(new URL("../admin/", import.meta.url));

Deno.test("resolveAdminFile — index under /admin/", () => {
  const p = resolveAdminFile("/admin/", ROOT);
  assertEquals(p?.endsWith("index.html") ?? false, true);
});

Deno.test("resolveAdminFile — legacy /admin/wiki/", () => {
  const p = resolveAdminFile("/admin/wiki/", ROOT);
  assertEquals(p?.endsWith("index.html") ?? false, true);
});

Deno.test("resolveAdminFile — rejects traversal", () => {
  assertEquals(resolveAdminFile("/admin/../etc/passwd", ROOT), null);
  assertEquals(resolveAdminFile("/admin/foo/../../x", ROOT), null);
});
