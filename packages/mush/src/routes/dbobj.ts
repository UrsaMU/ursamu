/**
 * @module routes/dbobj
 *
 * DBObj REST endpoints:
 *   GET   /api/v1/dbos          — list DBOs caller can edit (with optional flag filter)
 *   GET   /api/v1/dbobj/:id     — get single DBO
 *   PATCH /api/v1/dbobj/:id     — update allowed data fields on a DBO
 */

import type { IDBOBJ } from "../world/types.ts";
import { dbojs, Obj } from "../world/dbobjs.ts";
import { flags } from "../world/flags.ts";

// ── helpers ───────────────────────────────────────────────────────────────────

function canEditSync(actorFlags: Set<string>, actorId: string, targetData: IDBOBJ): boolean {
  if (actorFlags.has("superuser") || actorFlags.has("admin") || actorFlags.has("wizard")) return true;
  const owner = targetData.data?.owner as string | undefined;
  if (owner && owner === actorId) return true;
  if (actorId === targetData.id) return true;
  return false;
}

const POISON_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function scrub(obj: IDBOBJ): IDBOBJ {
  const copy = { ...obj };
  if (copy.data) {
    const d = { ...copy.data };
    delete d.password;
    copy.data = d;
  }
  return copy;
}

// ── handler ───────────────────────────────────────────────────────────────────

export async function dbObjHandler(req: Request, userId: string): Promise<Response> {
  const url = new URL(req.url);

  // GET /api/v1/dbos — list all DBOs caller may edit
  if (url.pathname.endsWith("/dbos") && req.method === "GET") {
    const en = await Obj.get(userId);
    const flagFilter = url.searchParams.get("flags") || "";

    if (!en) {
      return new Response(JSON.stringify({ error: "Not Found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const enFlags  = new Set(en.flags.split(/\s+/));
    const allDbos  = await dbojs.find({});
    const result: IDBOBJ[] = [];

    for (const dbo of allDbos) {
      if (!canEditSync(enFlags, en.dbobj.id, dbo)) continue;
      if (flagFilter && !flags.check(dbo.flags, flagFilter)) continue;
      result.push(scrub(dbo));
    }

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // /api/v1/dbobj/:id — single object operations
  const match = url.pathname.match(/\/api\/v1\/dbobj\/(.+)/);
  if (match) {
    const dbref = match[1];
    const en    = await Obj.get(userId);
    if (!en) return new Response("Unauthorized", { status: 401 });

    const enFlags   = new Set(en.flags.split(/\s+/));
    const targetObj = await dbojs.queryOne({ id: dbref });
    if (!targetObj) return new Response("Not Found", { status: 404 });

    if (!canEditSync(enFlags, en.dbobj.id, targetObj)) {
      return new Response("Forbidden", { status: 403 });
    }

    if (req.method === "GET") {
      return new Response(JSON.stringify(scrub(targetObj)), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (req.method === "PATCH") {
      let updates: Record<string, unknown>;
      try { updates = await req.json(); } catch { return new Response("Invalid JSON", { status: 400 }); }

      const ALLOWED_DATA_FIELDS = new Set(["name", "description", "moniker", "image"]);

      if (updates.data && typeof updates.data === "object") {
        const filtered: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(updates.data as Record<string, unknown>)) {
          if (ALLOWED_DATA_FIELDS.has(k) && !POISON_KEYS.has(k)) filtered[k] = v;
        }
        targetObj.data = { ...targetObj.data, ...filtered };
      }

      if (updates.description && !POISON_KEYS.has("description")) {
        targetObj.data = { ...targetObj.data, description: updates.description };
      }

      await dbojs.modify({ id: targetObj.id }, "$set", targetObj);
      return new Response(JSON.stringify(scrub(targetObj)), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  return new Response("Not Found", { status: 404 });
}
