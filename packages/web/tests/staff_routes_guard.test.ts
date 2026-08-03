/**
 * CI guard: every first-party staff `route:` must exist in the
 * host vue-router (packages/web/ui/src/router/index.ts).
 */
import { assertEquals } from "jsr:@std/assert@^1.0.0";
import { fromFileUrl, join } from "jsr:@std/path@^0.224.0";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

const WEB = fromFileUrl(new URL("..", import.meta.url));
const ROUTER = join(WEB, "ui/src/router/index.ts");
const ROOT = fromFileUrl(new URL("../../", import.meta.url));

/** Built-in host routes that plugins may reference. */
const HOST_CORE = new Set([
  "dashboard",
  "wiki",
  "wiki-new",
  "wiki-edit",
  "db",
  "db-detail",
  "players",
  "player-detail",
  "jobs",
  "job-detail",
  "bbs",
  "bbs-board",
  "bbs-post",
  "settings",
  "map",
  "plugin-embed",
  "app",
  "login",
  "forbidden",
]);

function routeNamesFromRouter(src: string): Set<string> {
  const names = new Set<string>();
  const re = /name:\s*["']([a-zA-Z0-9_-]+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    names.add(m[1]!);
  }
  return names;
}

function routesFromBridges(text: string): string[] {
  const out: string[] = [];
  const re = /route:\s*["']([a-zA-Z0-9_-]+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    out.push(m[1]!);
  }
  return out;
}

async function collectBridgeRoutes(): Promise<string[]> {
  const files = [
    "packages/bbs/src/staff-nav-bridge.ts",
    "packages/jobs/src/staff-nav-bridge.ts",
    "packages/wiki/src/staff-nav-bridge.ts",
    "packages/map/staff-nav-bridge.ts",
  ];
  const routes: string[] = [];
  for (const rel of files) {
    const path = join(ROOT, rel);
    try {
      const text = await Deno.readTextFile(path);
      routes.push(...routesFromBridges(text));
    } catch {
      /* package may be absent in some checkouts */
    }
  }
  return routes;
}

Deno.test("staff route names exist in vue-router", OPTS, async () => {
  const routerSrc = await Deno.readTextFile(ROUTER);
  const routerNames = routeNamesFromRouter(routerSrc);

  // Sanity: core routes present
  for (const core of ["wiki", "jobs", "bbs", "map", "plugin-embed"]) {
    assertEquals(
      routerNames.has(core),
      true,
      `router missing core route "${core}"`,
    );
  }

  const bridgeRoutes = await collectBridgeRoutes();
  const missing: string[] = [];
  for (const r of bridgeRoutes) {
    if (!routerNames.has(r)) missing.push(r);
  }

  assertEquals(
    missing,
    [],
    `staff bridges reference missing routes: ${missing.join(", ")}`,
  );
});

Deno.test("router has named app layout for module addRoute", OPTS, async () => {
  const routerSrc = await Deno.readTextFile(ROUTER);
  assertEquals(routerSrc.includes('name: "app"'), true);
});
