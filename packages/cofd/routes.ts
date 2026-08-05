/**
 * @module
 *
 * HTTP handlers for `/api/v1/cofd/*`, registered from plugin `init`
 * via `registerPluginRoute`. Auth is gated by the engine `userId`.
 *
 * Sub-routes:
 *   GET  /api/v1/cofd                 -> {ok:true} liveness
 *   GET  /api/v1/cofd/chargen         -> chargen session
 *   POST /api/v1/cofd/chargen/start
 *   POST /api/v1/cofd/chargen/set
 *   POST /api/v1/cofd/chargen/next
 *   POST /api/v1/cofd/chargen/back
 *   POST /api/v1/cofd/chargen/submit  -> finish (CGEN job)
 *   POST /api/v1/cofd/chargen/contract
 *   GET  /api/v1/cofd/chargen/options -> catalog (public)
 *   GET  /api/v1/cofd/sheet           -> live sheet (self)
 *   POST /api/v1/cofd/approve         -> staff approve PC
 *   POST /api/v1/cofd/themes          -> staff spawn themes
 */
import { dbojs } from "@ursamu/ursamu";
import { registerCustomTheme, type ThemeEntry } from "./src/combat/themes.ts";
import {
  getChargen,
  startChargen,
  setChargenTrait,
  stepChargen,
  contractChargen,
  chargenOptions,
  submitChargen,
  chargenSheetForUser,
  getSheet,
  approveHttp,
} from "./src/chargen/http.ts";

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

function normalizePath(pathname: string): string {
  return pathname.replace(/\/+$/, "") || "/";
}

async function readJson(
  req: Request,
): Promise<{ ok: true; body: unknown } | { ok: false }> {
  try {
    return { ok: true, body: await req.json() };
  } catch {
    return { ok: false };
  }
}

/**
 * Dispatch CoFD REST requests.
 */
export async function routeHandler(
  req: Request,
  userId: string | null,
): Promise<Response> {
  const url = new URL(req.url);
  const method = req.method;
  const path = normalizePath(url.pathname);

  // Catalog — auth optional; merits filter by draft sheet when signed in
  if (
    method === "GET" &&
    path === "/api/v1/cofd/chargen/options"
  ) {
    try {
      const topic = url.searchParams.get("topic") ?? "";
      const seeming = url.searchParams.get("seeming") ??
        undefined;
      let sheet = null;
      if (
        userId &&
        topic.toLowerCase().trim() === "merits" &&
        url.searchParams.get("eligible") !== "0"
      ) {
        sheet = await chargenSheetForUser(userId);
      }
      return await chargenOptions(topic, seeming, { sheet });
    } catch {
      return Response.json({ error: "Internal" }, { status: 500 });
    }
  }

  if (method === "GET" && path === "/api/v1/cofd") {
    if (!userId) {
      return Response.json(
        { error: "Unauthorized" },
        { status: 401 },
      );
    }
    return Response.json({ ok: true });
  }

  // Live sheet + staff approve (auth required)
  if (path === "/api/v1/cofd/sheet" || path === "/api/v1/cofd/approve") {
    if (!userId) {
      return Response.json(
        { error: "Unauthorized" },
        { status: 401 },
      );
    }
    try {
      if (method === "GET" && path === "/api/v1/cofd/sheet") {
        return await getSheet(userId);
      }
      if (method === "POST" && path === "/api/v1/cofd/approve") {
        const parsed = await readJson(req);
        if (!parsed.ok) {
          return Response.json(
            { error: "invalid JSON" },
            { status: 400 },
          );
        }
        const b = (parsed.body ?? {}) as {
          playerId?: string;
          jobNumber?: number | string;
          notes?: string;
        };
        return await approveHttp(userId, b);
      }
    } catch {
      return Response.json({ error: "Internal" }, { status: 500 });
    }
  }

  // Remaining chargen routes need a signed-in player
  if (path.startsWith("/api/v1/cofd/chargen")) {
    if (!userId) {
      return Response.json(
        { error: "Unauthorized" },
        { status: 401 },
      );
    }
    try {
      if (method === "GET" && path === "/api/v1/cofd/chargen") {
        return await getChargen(userId);
      }
      if (
        method === "POST" &&
        path === "/api/v1/cofd/chargen/start"
      ) {
        const parsed = await readJson(req);
        const body = parsed.ok && parsed.body &&
            typeof parsed.body === "object"
          ? parsed.body as { reset?: boolean }
          : {};
        return await startChargen(userId, body);
      }
      if (
        method === "POST" &&
        path === "/api/v1/cofd/chargen/set"
      ) {
        const parsed = await readJson(req);
        if (!parsed.ok) {
          return Response.json(
            { error: "invalid JSON" },
            { status: 400 },
          );
        }
        const b = (parsed.body ?? {}) as {
          trait?: string;
          value?: string;
        };
        return await setChargenTrait(userId, b);
      }
      if (
        method === "POST" &&
        path === "/api/v1/cofd/chargen/next"
      ) {
        return await stepChargen(userId, "next");
      }
      if (
        method === "POST" &&
        path === "/api/v1/cofd/chargen/back"
      ) {
        return await stepChargen(userId, "back");
      }
      if (
        method === "POST" &&
        path === "/api/v1/cofd/chargen/submit"
      ) {
        return await submitChargen(userId);
      }
      if (
        method === "POST" &&
        path === "/api/v1/cofd/chargen/contract"
      ) {
        const parsed = await readJson(req);
        if (!parsed.ok) {
          return Response.json(
            { error: "invalid JSON" },
            { status: 400 },
          );
        }
        const b = (parsed.body ?? {}) as {
          action?: string;
          name?: string;
        };
        return await contractChargen(userId, b);
      }
      return Response.json({ error: "Not found" }, { status: 404 });
    } catch {
      return Response.json({ error: "Internal" }, { status: 500 });
    }
  }

  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (method === "POST" && path === "/api/v1/cofd/themes") {
    try {
      const caller = await dbojs.queryOne({ id: userId });
      if (!caller) {
        return Response.json({ error: "Forbidden" }, { status: 403 });
      }
      const flags = normalizeFlags(
        (caller as unknown as { flags?: unknown }).flags,
      );
      if (!hasStaffFlag(flags)) {
        return Response.json({ error: "Forbidden" }, { status: 403 });
      }

      const parsed = await readJson(req);
      if (!parsed.ok) {
        return Response.json(
          { ok: false, reason: "invalid JSON body" },
          { status: 400 },
        );
      }
      const body = parsed.body;
      if (!body || typeof body !== "object") {
        return Response.json(
          { ok: false, reason: "body must be an object" },
          { status: 400 },
        );
      }
      const { key, entries } = body as {
        key?: unknown;
        entries?: unknown;
      };
      if (typeof key !== "string") {
        return Response.json(
          { ok: false, reason: "key must be a string" },
          { status: 400 },
        );
      }
      if (!Array.isArray(entries)) {
        return Response.json(
          { ok: false, reason: "entries must be an array" },
          { status: 400 },
        );
      }

      const result = registerCustomTheme(
        key,
        entries as ThemeEntry[],
      );
      if (!result.ok) {
        return Response.json(
          { ok: false, reason: result.reason },
          { status: 400 },
        );
      }
      return Response.json({ ok: true, key });
    } catch {
      return Response.json({ error: "Internal" }, { status: 500 });
    }
  }

  return Response.json({ error: "Not found" }, { status: 404 });
}
