/**
 * HTTP handlers for `/api/v1/dnd/*`.
 *
 *   GET  /api/v1/dnd                 liveness (auth)
 *   GET  /api/v1/dnd/meta            system discovery (public)
 *   GET  /api/v1/dnd/chargen         draft or live sheet
 *   POST /api/v1/dnd/chargen/start
 *   POST /api/v1/dnd/chargen/set
 *   POST /api/v1/dnd/chargen/next
 *   POST /api/v1/dnd/chargen/back
 *   POST /api/v1/dnd/chargen/submit
 *   GET  /api/v1/dnd/chargen/options catalog (public)
 *   GET  /api/v1/dnd/sheet           live sheet (auth)
 *   POST /api/v1/dnd/approve         staff approve
 */
import {
  approveHttp,
  chargenOptions,
  getChargen,
  getSheet,
  meta,
  setChargenTrait,
  startChargen,
  stepChargen,
  submitChargen,
} from "./src/chargen/http.ts";

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

export async function routeHandler(
  req: Request,
  userId: string | null,
): Promise<Response> {
  const url = new URL(req.url);
  const method = req.method;
  const path = normalizePath(url.pathname);

  try {
    if (method === "GET" && path === "/api/v1/dnd/meta") {
      return meta();
    }

    if (
      method === "GET" &&
      path === "/api/v1/dnd/chargen/options"
    ) {
      const topic = url.searchParams.get("topic") ?? "";
      const q: Record<string, string> = {};
      url.searchParams.forEach((v, k) => {
        q[k] = v;
      });
      return chargenOptions(topic, q);
    }

    if (method === "GET" && path === "/api/v1/dnd") {
      if (!userId) {
        return Response.json(
          { error: "Unauthorized" },
          { status: 401 },
        );
      }
      return Response.json({ ok: true, system: "dnd" });
    }

    if (method === "GET" && path === "/api/v1/dnd/sheet") {
      if (!userId) {
        return Response.json(
          { error: "Unauthorized" },
          { status: 401 },
        );
      }
      return await getSheet(userId);
    }

    if (method === "POST" && path === "/api/v1/dnd/approve") {
      if (!userId) {
        return Response.json(
          { error: "Unauthorized" },
          { status: 401 },
        );
      }
      const parsed = await readJson(req);
      if (!parsed.ok) {
        return Response.json(
          { error: "invalid JSON" },
          { status: 400 },
        );
      }
      const b = (parsed.body ?? {}) as {
        playerId?: string;
        notes?: string;
      };
      return await approveHttp(userId, b);
    }

    if (path.startsWith("/api/v1/dnd/chargen")) {
      if (!userId) {
        return Response.json(
          { error: "Unauthorized" },
          { status: 401 },
        );
      }

      if (method === "GET" && path === "/api/v1/dnd/chargen") {
        return await getChargen(userId);
      }
      if (
        method === "POST" &&
        path === "/api/v1/dnd/chargen/start"
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
        path === "/api/v1/dnd/chargen/set"
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
        path === "/api/v1/dnd/chargen/next"
      ) {
        return await stepChargen(userId, "next");
      }
      if (
        method === "POST" &&
        path === "/api/v1/dnd/chargen/back"
      ) {
        return await stepChargen(userId, "back");
      }
      if (
        method === "POST" &&
        path === "/api/v1/dnd/chargen/submit"
      ) {
        return await submitChargen(userId);
      }
    }

    return Response.json({ error: "Not found" }, { status: 404 });
  } catch (e: unknown) {
    console.error("[dnd] route error:", e);
    return Response.json({ error: "Internal" }, { status: 500 });
  }
}
