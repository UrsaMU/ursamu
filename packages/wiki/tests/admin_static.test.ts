/**
 * Wiki admin static path safety (PR 1 shell).
 */
import { assertEquals } from "@std/assert";
import { resolveAdminFile } from "../src/admin-static.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("resolveAdminFile — index defaults", OPTS, () => {
  const a = resolveAdminFile("/admin/wiki");
  const b = resolveAdminFile("/admin/wiki/");
  const c = resolveAdminFile("/admin/wiki/index.html");
  assertEquals(a?.endsWith("index.html"), true);
  assertEquals(b?.endsWith("index.html"), true);
  assertEquals(c?.endsWith("index.html"), true);
});

Deno.test("resolveAdminFile — allows css/js under admin", OPTS, () => {
  const css = resolveAdminFile("/admin/wiki/styles.css");
  const js = resolveAdminFile("/admin/wiki/app.js");
  assertEquals(css?.endsWith("styles.css"), true);
  assertEquals(js?.endsWith("app.js"), true);
});

Deno.test("resolveAdminFile — blocks path traversal", OPTS, () => {
  assertEquals(resolveAdminFile("/admin/wiki/../src/index.ts"), null);
  assertEquals(
    resolveAdminFile("/admin/wiki/foo/../../etc/passwd"),
    null,
  );
  assertEquals(
    resolveAdminFile("/admin/wiki/%2e%2e/secrets"),
    null,
  );
});
