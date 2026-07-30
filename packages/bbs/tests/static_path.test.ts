import { assertEquals } from "@std/assert";
import { resolveBbsAdminFile } from "../src/static.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };
const ROOT = "/tmp/bbs-admin-dist";

Deno.test("resolveBbsAdminFile — index under /admin/bbs-app/", OPTS, () => {
  assertEquals(
    resolveBbsAdminFile("/admin/bbs-app/", ROOT),
    ROOT + "/index.html",
  );
  assertEquals(
    resolveBbsAdminFile("/admin/bbs-app", ROOT),
    ROOT + "/index.html",
  );
  // /admin/bbs belongs to @ursamu/web AppLayout — never this SPA
  assertEquals(resolveBbsAdminFile("/admin/bbs/", ROOT), null);
  assertEquals(resolveBbsAdminFile("/admin/bbs", ROOT), null);
});

Deno.test("resolveBbsAdminFile — asset path", OPTS, () => {
  const p = resolveBbsAdminFile(
    "/admin/bbs-app/assets/app.js",
    ROOT,
  );
  assertEquals(p, ROOT + "/assets/app.js");
});

Deno.test("resolveBbsAdminFile — SPA route fallback name", OPTS, () => {
  // No extension → index.html (client router)
  assertEquals(
    resolveBbsAdminFile("/admin/bbs-app/board/board-1", ROOT),
    ROOT + "/index.html",
  );
});

Deno.test("resolveBbsAdminFile — rejects traversal", OPTS, () => {
  assertEquals(
    resolveBbsAdminFile("/admin/bbs-app/../secret", ROOT),
    null,
  );
  assertEquals(
    resolveBbsAdminFile("/admin/bbs-app/%2e%2e/x", ROOT),
    null,
  );
});
