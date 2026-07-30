/**
 * @module routes/dbobj
 *
 * DBObj REST endpoints:
 *   GET   /api/v1/dbos          — list DBOs caller can edit
 *   GET   /api/v1/dbobj/:id     — get single DBO
 *   PATCH /api/v1/dbobj/:id     — staff edit (flags, loc, zone, data…)
 */

import type { IDBOBJ } from "../world/types.ts";
import { dbojs, Obj } from "../world/dbobjs.ts";
import { flags } from "../world/flags.ts";
import {
  canEditObject,
  isWizardPlus,
  privRank,
} from "../world/permissions.ts";
import { gameHooks } from "@ursamu/core";

// ── helpers ───────────────────────────────────────────────────────────────────

async function canEditDbo(
  actorFlags: Set<string> | string,
  actorId: string,
  targetData: IDBOBJ,
): Promise<boolean> {
  return await canEditObject(
    { id: actorId, flags: actorFlags },
    {
      id: targetData.id,
      flags: targetData.flags,
      data: targetData.data,
    },
  );
}

const POISON_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/** data.* keys staff may never set via REST */
const BLOCKED_DATA_KEYS = new Set([
  "password",
  "passwordHash",
  "hash",
  "resetToken",
  "resetExpires",
  "salt",
]);

/** Always-safe identity / presentation fields */
const SAFE_DATA_FIELDS = new Set([
  "name",
  "description",
  "moniker",
  "image",
  "owner",
  "zone",
  "money",
  "quota",
]);

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Normalize flags from string | Set | string[] → string for flags.check. */
function flagsToString(raw: unknown): string {
  if (raw instanceof Set) return [...raw].map(String).join(" ");
  if (Array.isArray(raw)) return raw.map(String).join(" ");
  return String(raw ?? "");
}

function scrub(obj: IDBOBJ): IDBOBJ {
  const copy = { ...obj };
  if (copy.data) {
    const d = { ...copy.data };
    delete d.password;
    delete d.passwordHash;
    delete d.hash;
    delete d.resetToken;
    delete d.salt;
    copy.data = d;
  }
  return copy;
}

function normalizeDbref(raw: unknown): string | null {
  if (raw === null || raw === undefined) return "";
  const s = String(raw).trim().replace(/^#/, "");
  if (s === "") return "";
  if (!/^[a-zA-Z0-9_-]+$/.test(s)) return null;
  return s;
}

/**
 * Sanitize a flag string. Rejects tokens that grant privilege above
 * the actor's rank. Returns { ok, flags } or { ok: false, error }.
 */
function sanitizeFlagsInput(
  raw: unknown,
  actorFlags: string,
): { ok: true; flags: string } | { ok: false; error: string } {
  const actorRank = privRank(actorFlags);
  const tokens = String(raw ?? "")
    .toLowerCase()
    .split(/[\s,|]+/)
    .map((t) => t.trim())
    .filter(Boolean);

  const kept: string[] = [];
  for (const t of tokens) {
    if (!/^[a-z][a-z0-9_]*$/.test(t)) {
      return { ok: false, error: `Invalid flag token: ${t}` };
    }
    // Privilege ladder — cannot grant above your own rank
    const tokenRank = privRank(t);
    if (tokenRank > 0 && tokenRank > actorRank) {
      return {
        ok: false,
        error: `Cannot grant flag '${t}' (above your privilege).`,
      };
    }
    if (!kept.includes(t)) kept.push(t);
  }
  return { ok: true, flags: kept.join(" ") };
}

/**
 * Apply PATCH body onto target. Wizard+ may set broader data keys.
 */
function applyStaffPatch(
  target: IDBOBJ,
  updates: Record<string, unknown>,
  actorFlags: string,
): { ok: true } | { ok: false; error: string; status?: number } {
  const wizard = isWizardPlus(actorFlags);

  // ── top-level flags ──────────────────────────────────────────
  if (updates.flags !== undefined) {
    if (!wizard) {
      return {
        ok: false,
        error: "Only wizard+ may edit flags via REST.",
        status: 403,
      };
    }
    const sf = sanitizeFlagsInput(updates.flags, actorFlags);
    if (!sf.ok) return { ok: false, error: sf.error, status: 400 };
    target.flags = sf.flags;
  }

  // ── location ─────────────────────────────────────────────────
  if (updates.location !== undefined) {
    const loc = normalizeDbref(updates.location);
    if (loc === null) {
      return { ok: false, error: "Invalid location id.", status: 400 };
    }
    target.location = loc;
  }

  // ── top-level description (legacy) ───────────────────────────
  if (
    updates.description !== undefined &&
    !POISON_KEYS.has("description")
  ) {
    target.description = String(updates.description).slice(0, 50000);
  }

  // ── data bag ─────────────────────────────────────────────────
  if (updates.data && typeof updates.data === "object") {
    const incoming = updates.data as Record<string, unknown>;
    const next: Record<string, unknown> = {
      ...(target.data as Record<string, unknown> | undefined ?? {}),
    };

    for (const [k, v] of Object.entries(incoming)) {
      if (POISON_KEYS.has(k) || BLOCKED_DATA_KEYS.has(k)) continue;
      if (k.startsWith("_") && !wizard) continue;

      const allow = wizard || SAFE_DATA_FIELDS.has(k);
      if (!allow) continue;

      if (k === "owner" || k === "zone") {
        const id = normalizeDbref(v);
        if (id === null) {
          return {
            ok: false,
            error: `Invalid ${k} id.`,
            status: 400,
          };
        }
        if (id === "") {
          delete next[k];
        } else {
          next[k] = id;
        }
        continue;
      }

      if (k === "money" || k === "quota") {
        const n = Number(v);
        if (!Number.isFinite(n) || n < 0 || n > 1e12) {
          return {
            ok: false,
            error: `Invalid ${k} value.`,
            status: 400,
          };
        }
        next[k] = Math.floor(n);
        continue;
      }

      if (typeof v === "string") {
        next[k] = v.slice(0, k === "description" ? 50000 : 2000);
      } else if (
        typeof v === "number" ||
        typeof v === "boolean" ||
        v === null
      ) {
        next[k] = v;
      } else if (wizard && Array.isArray(v)) {
        // shallow JSON-safe arrays only
        next[k] = v.slice(0, 200);
      } else if (
        wizard &&
        v &&
        typeof v === "object" &&
        !Array.isArray(v)
      ) {
        // shallow object — no nested functions
        try {
          next[k] = JSON.parse(JSON.stringify(v));
        } catch {
          /* skip */
        }
      }
    }

    target.data = next as IDBOBJ["data"];
  }

  return { ok: true };
}

// ── handler ───────────────────────────────────────────────────────────────────

export async function dbObjHandler(req: Request, userId: string): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;

  // GET /api/v1/dbos — list all DBOs caller may edit
  if (
    (path === "/api/v1/dbos" || path.endsWith("/dbos")) &&
    req.method === "GET"
  ) {
    const en = await Obj.get(userId);
    const flagFilter = url.searchParams.get("flags") || "";
    const limit = Math.min(
      Math.max(
        1,
        parseInt(url.searchParams.get("limit") ?? "500", 10) || 500,
      ),
      2000,
    );

    if (!en) {
      return new Response(JSON.stringify({ error: "Not Found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const actorId = String(en.dbobj?.id ?? en.id ?? userId);
    const enFlags = flagsToString(
      (en.dbobj as { flags?: unknown })?.flags ?? en.flags,
    );
    const allDbos = await dbojs.find({});
    const result: IDBOBJ[] = [];

    for (const dbo of allDbos) {
      if (!await canEditDbo(enFlags, actorId, dbo)) continue;
      if (flagFilter && !flags.check(dbo.flags, flagFilter)) continue;
      result.push(scrub(dbo));
      if (result.length >= limit) break;
    }

    return new Response(
      JSON.stringify({
        objects: result,
        total: result.length,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  // /api/v1/dbobj/:id — single object operations
  const match = path.match(/\/api\/v1\/dbobj\/(.+)/);
  if (match) {
    const dbref = decodeURIComponent(match[1]).replace(/^#/, "");
    const en    = await Obj.get(userId);
    if (!en) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const actorId = String(en.dbobj?.id ?? en.id ?? userId);
    const enFlags = flagsToString(
      (en.dbobj as { flags?: unknown })?.flags ?? en.flags,
    );
    const targetObj = await dbojs.queryOne({ id: dbref });
    if (!targetObj) {
      return new Response(
        JSON.stringify({ error: "Not Found" }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    if (!await canEditDbo(enFlags, actorId, targetObj)) {
      return new Response(
        JSON.stringify({ error: "Forbidden" }),
        {
          status: 403,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    if (req.method === "GET") {
      return new Response(JSON.stringify(scrub(targetObj)), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (req.method === "PATCH") {
      let updates: Record<string, unknown>;
      try {
        updates = await req.json();
      } catch {
        return json({ error: "Invalid JSON" }, 400);
      }

      const applied = applyStaffPatch(targetObj, updates, enFlags);
      if (!applied.ok) {
        return json(
          { error: applied.error },
          applied.status ?? 400,
        );
      }

      await dbojs.modify({ id: targetObj.id }, "$set", targetObj);

      // Notify plugins / admin WS via the shared hook bus.
      const typeFlag = flagsToString(targetObj.flags).toLowerCase();
      let objectType = "thing";
      if (/\bplayer\b/.test(typeFlag)) objectType = "player";
      else if (/\broom\b/.test(typeFlag)) objectType = "room";
      else if (/\bexit\b/.test(typeFlag)) objectType = "exit";

      await gameHooks.emit("object:modified", {
        objectId: String(targetObj.id),
        objectName: String(
          (targetObj.data as { name?: string } | undefined)
            ?.name ?? targetObj.id,
        ),
        objectType,
        actorId,
        actorName: String(
          (en.dbobj?.data as { name?: string } | undefined)
            ?.name ??
            (en.data as { name?: string } | undefined)?.name ??
            actorId,
        ),
        locationId: targetObj.location
          ? String(targetObj.location)
          : undefined,
      });

      return json(scrub(targetObj));
    }
  }

  return json({ error: "Not Found" }, 404);
}
