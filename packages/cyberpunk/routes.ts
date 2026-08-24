/**
 * HTTP handlers for `/api/v1/cpr/*`.
 *
 *   GET  /api/v1/cpr                 liveness (auth)
 *   GET  /api/v1/cpr/meta            system discovery (public)
 *   GET  /api/v1/cpr/sheet           live sheet (auth)
 *   GET  /api/v1/cpr/chargen         draft or live sheet
 *   GET  /api/v1/cpr/chargen/options catalog (public)
 *   POST /api/v1/cpr/chargen/start
 *   POST /api/v1/cpr/chargen/set
 *   POST /api/v1/cpr/chargen/next
 *   POST /api/v1/cpr/chargen/back
 *   POST /api/v1/cpr/chargen/submit
 *   POST /api/v1/cpr/chargen/roll    lifepath roll / bundle
 *   GET  /api/v1/cpr/chargen/gear    gear catalog for draft
 *   POST /api/v1/cpr/approve         staff approve
 *   POST /api/v1/cpr/wipe            staff wipe draft/approved
 */
import {
  approveHttp,
  chargenOptions,
  gearCatalogHttp,
  getChargen,
  getSheet,
  meta,
  rollChargen,
  setChargenTrait,
  startChargen,
  stepChargen,
  submitChargen,
  wipeHttp,
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
    if (method === "GET" && path === "/api/v1/cpr/meta") {
      return meta();
    }

    if (
      method === "GET" &&
      path === "/api/v1/cpr/chargen/options"
    ) {
      const topic = url.searchParams.get("topic") ?? "";
      const q: Record<string, string> = {};
      url.searchParams.forEach((v, k) => {
        q[k] = v;
      });
      return chargenOptions(topic, q);
    }

    if (method === "GET" && path === "/api/v1/cpr") {
      if (!userId) {
        return Response.json(
          { error: "Unauthorized" },
          { status: 401 },
        );
      }
      return Response.json({ ok: true, system: "cpr" });
    }

    if (method === "GET" && path === "/api/v1/cpr/sheet") {
      if (!userId) {
        return Response.json(
          { error: "Unauthorized" },
          { status: 401 },
        );
      }
      return await getSheet(userId);
    }

    if (method === "GET" && path === "/api/v1/cpr/chargen") {
      if (!userId) {
        return Response.json(
          { error: "Unauthorized" },
          { status: 401 },
        );
      }
      return await getChargen(userId);
    }

    if (
      method === "POST" && path === "/api/v1/cpr/chargen/start"
    ) {
      if (!userId) {
        return Response.json(
          { error: "Unauthorized" },
          { status: 401 },
        );
      }
      const body = await readJson(req);
      return await startChargen(
        userId,
        body.ok ? body.body : {},
      );
    }

    if (
      method === "POST" && path === "/api/v1/cpr/chargen/set"
    ) {
      if (!userId) {
        return Response.json(
          { error: "Unauthorized" },
          { status: 401 },
        );
      }
      const body = await readJson(req);
      return await setChargenTrait(
        userId,
        body.ok ? body.body : {},
      );
    }

    if (
      method === "POST" && path === "/api/v1/cpr/chargen/next"
    ) {
      if (!userId) {
        return Response.json(
          { error: "Unauthorized" },
          { status: 401 },
        );
      }
      return await stepChargen(userId, "next");
    }

    if (
      method === "POST" && path === "/api/v1/cpr/chargen/back"
    ) {
      if (!userId) {
        return Response.json(
          { error: "Unauthorized" },
          { status: 401 },
        );
      }
      return await stepChargen(userId, "back");
    }

    if (
      method === "POST" && path === "/api/v1/cpr/chargen/submit"
    ) {
      if (!userId) {
        return Response.json(
          { error: "Unauthorized" },
          { status: 401 },
        );
      }
      const body = await readJson(req);
      return await submitChargen(
        userId,
        body.ok ? body.body : {},
      );
    }

    if (
      method === "POST" && path === "/api/v1/cpr/chargen/roll"
    ) {
      if (!userId) {
        return Response.json(
          { error: "Unauthorized" },
          { status: 401 },
        );
      }
      const body = await readJson(req);
      return await rollChargen(
        userId,
        body.ok ? body.body : {},
      );
    }

    if (
      method === "GET" && path === "/api/v1/cpr/chargen/gear"
    ) {
      if (!userId) {
        return Response.json(
          { error: "Unauthorized" },
          { status: 401 },
        );
      }
      return await gearCatalogHttp(userId);
    }

    if (method === "POST" && path === "/api/v1/cpr/approve") {
      const body = await readJson(req);
      return await approveHttp(
        userId,
        body.ok ? body.body : {},
      );
    }

    if (method === "POST" && path === "/api/v1/cpr/wipe") {
      const body = await readJson(req);
      return await wipeHttp(
        userId,
        body.ok ? body.body : {},
      );
    }

    return Response.json({ error: "Not found" }, { status: 404 });
  } catch (e: unknown) {
    console.error("[cpr] route error:", e);
    return Response.json(
      { error: "Internal error" },
      { status: 500 },
    );
  }
}
