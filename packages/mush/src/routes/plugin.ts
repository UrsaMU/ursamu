/**
 * registerPluginRoute — register a plugin REST prefix handler.
 *
 * Hooks into the mush route fallback so path-prefix matching works.
 * The handler receives the request and the resolved userId (null if
 * unauthenticated).
 *
 * Usage (in a plugin's init()):
 *   registerPluginRoute("/api/v1/myplugin", myRouteHandler);
 */

export type PluginRouteHandler = (
  req: Request,
  userId: string | null,
) => Promise<Response>;

/**
 * Process-wide route map. MUST be globalThis — not a module binding.
 * Plugins may import `registerPluginRoute` via `ursamu`, `@ursamu/mush`,
 * or a JSR pin while handleRequest uses the vendored mush path. Separate
 * module instances would otherwise register routes that the dispatcher
 * never sees (and vice versa for theme hot-reload via @ursamu/site).
 */
const ROUTES_KEY = Symbol.for("ursamu.mush.pluginRoutes");

function pluginRoutes(): Map<string, PluginRouteHandler> {
  const g = globalThis as unknown as Record<
    symbol,
    Map<string, PluginRouteHandler>
  >;
  if (!g[ROUTES_KEY]) {
    g[ROUTES_KEY] = new Map<string, PluginRouteHandler>();
  }
  return g[ROUTES_KEY]!;
}

/**
 * Normalize a route prefix.
 * Critical: bare "/" must stay "/" — stripping the slash yields ""
 * which would match every path via startsWith("/").
 */
export function normalizePluginPrefix(prefix: string): string {
  let key = String(prefix ?? "").trim() || "/";
  if (!key.startsWith("/")) key = `/${key}`;
  // Drop trailing slash except for root
  if (key.length > 1 && key.endsWith("/")) {
    key = key.slice(0, -1);
  }
  return key;
}

/**
 * Register a path prefix handler. Requests whose pathname equals
 * `prefix` or starts with `prefix/` are dispatched to `handler`.
 * Root prefix "/" matches only exact "/" (not every path).
 */
export function registerPluginRoute(
  prefix: string,
  handler: PluginRouteHandler,
): void {
  const key = normalizePluginPrefix(prefix);
  pluginRoutes().set(key, handler);
}

/** True when pathname is covered by a registered prefix. */
export function pluginPrefixMatches(
  pathname: string,
  prefix: string,
): boolean {
  const path = pathname || "/";
  if (prefix === "/") {
    // Exact root only — never catch-all
    return path === "/" || path === "";
  }
  return path === prefix || path.startsWith(`${prefix}/`);
}

/**
 * Attempt to dispatch a request to a registered plugin route.
 * Longer prefixes win (e.g. /admin/wiki before /admin).
 * Returns the response if matched, or null otherwise.
 */
export async function dispatchPluginRoute(
  req: Request,
  authenticate: (req: Request) => Promise<string | null>,
): Promise<Response | null> {
  const pathname = new URL(req.url).pathname || "/";
  const routes = pluginRoutes();

  // Longest prefix first so /admin/wiki beats /admin beats /
  const prefixes = [...routes.keys()].sort(
    (a, b) => b.length - a.length,
  );

  for (const prefix of prefixes) {
    if (!pluginPrefixMatches(pathname, prefix)) continue;
    const handler = routes.get(prefix);
    if (!handler) continue;
    const userId = await authenticate(req);
    return handler(req, userId);
  }
  return null;
}

/** Whether any plugin claimed the public site mount. */
export function hasPluginPrefix(prefix: string): boolean {
  const key = normalizePluginPrefix(prefix);
  return pluginRoutes().has(key);
}

/** Test helper — clear registry. */
export function clearPluginRoutes(): void {
  pluginRoutes().clear();
}
