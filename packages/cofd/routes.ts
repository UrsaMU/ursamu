/**
 * Handler for all /api/v1/cofd routes.
 * Registered in init() via registerPluginRoute().
 *
 * Note: this route persists until server restart and cannot be hot-unloaded.
 *
 * POLICY (read before adding a sub-route):
 * - Authentication is gated by the outer engine via `userId` -- any
 *   authenticated socket user (PC, not just staff) reaches this handler.
 * - For sub-routes that READ data, gate to the caller's own resources
 *   (e.g. only their own sheet) unless explicitly intended to be public.
 * - For sub-routes that WRITE or read another character's data, you MUST
 *   look up the caller's IDBObj and check `u.canEdit(caller, target)`
 *   before mutating. The engine's `isStaff`-style flag set (superuser,
 *   admin, wizard, builder) is on the caller's `flags` Set.
 * - Never echo internal ids, secrets, or NPC stat blocks to non-staff
 *   without an explicit access check -- prior to v1.0 the GET response
 *   returned the plugin name and was tightened to {ok:true} to reduce
 *   enumeration value.
 * - Rate-limiting is the engine's responsibility; this handler should
 *   stay O(1) for unauthenticated probes (currently the 401 short-circuit).
 * - All handlers MUST catch internal errors and return a generic 500.
 *   Never leak stack traces or internal error messages to clients.
 *
 * Sub-routes:
 *   GET  /api/v1/cofd          -> {ok:true} liveness probe
 *   POST /api/v1/cofd/themes   -> staff-only; register a runtime spawn theme
 */
import { dbojs } from "@ursamu/ursamu";
import { registerCustomTheme, type ThemeEntry } from "./src/combat/themes.ts";

const STAFF_FLAGS = new Set(["superuser", "admin", "wizard", "builder"]);

function normalizeFlags(raw: unknown): Set<string> {
  if (raw instanceof Set) return raw as Set<string>;
  if (Array.isArray(raw)) return new Set(raw as string[]);
  return new Set(String(raw ?? "").split(/[,\s]+/).filter(Boolean));
}

function hasStaffFlag(flags: Set<string>): boolean {
  for (const f of flags) {
    if (STAFF_FLAGS.has(f.toLowerCase())) return true;
  }
  return false;
}

export async function routeHandler(req: Request, userId: string | null): Promise<Response> {
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const url    = new URL(req.url);
  const method = req.method;
  const path   = url.pathname;

  if (method === "GET" && (path === "/api/v1/cofd" || path === "/api/v1/cofd/")) {
    // Liveness probe only. Any sub-route that returns more than {ok:true}
    // must implement its own authz (see POLICY above).
    return Response.json({ ok: true });
  }

  if (method === "POST" && path === "/api/v1/cofd/themes") {
    try {
      const caller = await dbojs.queryOne({ id: userId });
      if (!caller) return Response.json({ error: "Forbidden" }, { status: 403 });
      const flags = normalizeFlags((caller as unknown as { flags?: unknown }).flags);
      if (!hasStaffFlag(flags)) {
        return Response.json({ error: "Forbidden" }, { status: 403 });
      }

      let body: unknown;
      try {
        body = await req.json();
      } catch {
        return Response.json({ ok: false, reason: "invalid JSON body" }, { status: 400 });
      }
      if (!body || typeof body !== "object") {
        return Response.json({ ok: false, reason: "body must be an object" }, { status: 400 });
      }
      const { key, entries } = body as { key?: unknown; entries?: unknown };
      if (typeof key !== "string") {
        return Response.json({ ok: false, reason: "key must be a string" }, { status: 400 });
      }
      if (!Array.isArray(entries)) {
        return Response.json({ ok: false, reason: "entries must be an array" }, { status: 400 });
      }

      const result = registerCustomTheme(key, entries as ThemeEntry[]);
      if (!result.ok) {
        return Response.json({ ok: false, reason: result.reason }, { status: 400 });
      }
      return Response.json({ ok: true, key });
    } catch (_err) {
      // Do NOT leak stack traces -- POLICY.
      return Response.json({ error: "Internal" }, { status: 500 });
    }
  }

  return Response.json({ error: "Not found" }, { status: 404 });
}
