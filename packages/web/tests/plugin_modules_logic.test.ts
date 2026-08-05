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
  // Only named routes the host can resolve (no ghost tabs).
  if (routeName && hasRoute(routeName)) {
    return { name: routeName };
  }
  if (mod && !failed.has(item.id) && routeName) {
    return { name: routeName };
  }
  if (embed) return { name: "plugin-embed", embedShell: true };
  if (item.href?.trim()) return { href: item.href.trim() };
  return {};
}

function navTargetReady(
  target: ReturnType<typeof resolveNavTarget>,
  hasRoute: (n: string) => boolean,
): boolean {
  if (target.href) return true;
  const name = target.name;
  if (!name) return false;
  if (name === "plugin-embed") return true;
  return hasRoute(name);
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

Deno.test(
  "resolveNavTarget: missing host route → empty (no ghost)",
  OPTS,
  () => {
    const t = resolveNavTarget(
      { id: "mail", route: "mail" },
      () => false,
      new Set(),
    );
    assertEquals(t.name, undefined);
    assertEquals(t.href, undefined);
    assertEquals(navTargetReady(t, () => false), false);
  },
);

Deno.test(
  "resolveNavTarget: missing route ready after stub hasRoute",
  OPTS,
  () => {
    const t = resolveNavTarget(
      { id: "mail", route: "mail" },
      (n) => n === "mail",
      new Set(),
    );
    assertEquals(t.name, "mail");
    assertEquals(navTargetReady(t, (n) => n === "mail"), true);
  },
);

Deno.test(
  "resolveNavTarget: route-only never invents broken link",
  OPTS,
  () => {
    // Old bug: (hasRoute || !mod) returned name even when missing.
    const t = resolveNavTarget(
      { id: "channels", route: "channels" },
      () => false,
      new Set(),
    );
    assertEquals(navTargetReady(t, () => false), false);
  },
);
