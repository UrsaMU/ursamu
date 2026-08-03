/**
 * Pure helpers from plugin-modules (no Vue router / DOM import).
 * Mirrors isSameOriginModule + resolveNavTarget rules for CI.
 */
import { assertEquals } from "jsr:@std/assert@^1.0.0";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function isSameOriginModule(
  url: string,
  origin = "http://localhost:4203",
): boolean {
  if (!url || typeof url !== "string") return false;
  const u = url.trim();
  if (u.startsWith("/")) return true;
  try {
    return new URL(u, origin).origin === origin;
  } catch {
    return false;
  }
}

type Nav = {
  id: string;
  route?: string;
  embed?: string;
  module?: string;
  href?: string;
};

function resolveNavTarget(
  item: Nav,
  hasRoute: (n: string) => boolean,
  failed: Set<string>,
): { name?: string; href?: string; embedShell?: boolean } {
  const routeName = item.route?.trim();
  const embed = item.embed?.trim();
  const mod = item.module?.trim();

  if (mod && failed.has(item.id) && embed) {
    return { name: "plugin-embed", embedShell: true };
  }
  if (routeName === "plugin-embed" || (embed && !routeName && !mod)) {
    return { name: "plugin-embed", embedShell: true };
  }
  if (routeName && (hasRoute(routeName) || !mod)) {
    return { name: routeName };
  }
  if (embed) return { name: "plugin-embed", embedShell: true };
  if (item.href?.trim()) return { href: item.href.trim() };
  return {};
}

Deno.test("isSameOriginModule: paths and origins", OPTS, () => {
  assertEquals(isSameOriginModule("/admin/x/host-entry.js"), true);
  assertEquals(
    isSameOriginModule("http://localhost:4203/admin/x.js"),
    true,
  );
  assertEquals(
    isSameOriginModule("https://evil.example/x.js"),
    false,
  );
  assertEquals(isSameOriginModule(""), false);
});

Deno.test("resolveNavTarget: module fail → embed", OPTS, () => {
  const failed = new Set(["mytool"]);
  const t = resolveNavTarget(
    {
      id: "mytool",
      module: "/admin/mytool/host-entry.js",
      route: "ext-mytool",
      embed: "/admin/mytool/",
    },
    () => false,
    failed,
  );
  assertEquals(t.embedShell, true);
  assertEquals(t.name, "plugin-embed");
});

Deno.test("resolveNavTarget: host route wins", OPTS, () => {
  const t = resolveNavTarget(
    { id: "jobs", route: "jobs" },
    (n) => n === "jobs",
    new Set(),
  );
  assertEquals(t.name, "jobs");
});
