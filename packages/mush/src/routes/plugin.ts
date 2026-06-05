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

// Registry of plugin routes — consulted by handleRequest fallback.
const _pluginRoutes = new Map<string, PluginRouteHandler>();

/**
 * Register a path prefix handler.  All requests whose pathname starts with
 * `prefix` will be dispatched to `handler` with the authenticated userId.
 */
export function registerPluginRoute(prefix: string, handler: PluginRouteHandler): void {
  const key = prefix.endsWith("/") ? prefix.slice(0, -1) : prefix;
  _pluginRoutes.set(key, handler);
}

/**
 * Attempt to dispatch a request to a registered plugin route.
 * Returns the response if a matching prefix was found, or null otherwise.
 * The authenticate function is injected to avoid circular imports.
 */
export async function dispatchPluginRoute(
  req: Request,
  authenticate: (req: Request) => Promise<string | null>,
): Promise<Response | null> {
  const pathname = new URL(req.url).pathname;
  for (const [prefix, handler] of _pluginRoutes) {
    if (pathname === prefix || pathname.startsWith(prefix + "/")) {
      const userId = await authenticate(req);
      return handler(req, userId);
    }
  }
  return null;
}
