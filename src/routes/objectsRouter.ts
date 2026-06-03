/**
 * @module routes/objectsRouter
 *
 * REST API for game-object CRUD, attribute management, softcode eval,
 * room-graph traversal, exit linking, flag listing, and function listing.
 *
 * All mutating endpoints require a valid JWT (userId).  Read-only endpoints
 * (/api/v1/flags, /api/v1/functions) are public.
 *
 * URL layout:
 *   GET    /api/v1/objects              — search / list
 *   POST   /api/v1/objects              — create object
 *   GET    /api/v1/objects/:id          — get object
 *   PATCH  /api/v1/objects/:id          — update object
 *   DELETE /api/v1/objects/:id          — destroy object
 *   GET    /api/v1/objects/:id/attrs    — list attributes
 *   PUT    /api/v1/objects/:id/attrs/:attr  — set attribute
 *   DELETE /api/v1/objects/:id/attrs/:attr  — delete attribute
 *   POST   /api/v1/objects/:id/eval     — evaluate softcode in object context
 *   GET    /api/v1/objects/:id/tree     — room graph (room + exits + destinations)
 *   POST   /api/v1/objects/:id/link     — link exit to destination
 *   GET    /api/v1/flags                — list available flag names
 *   GET    /api/v1/functions            — list registered softcode function names
 */

import type { IDBOBJ } from "../@types/IDBObj.ts";
import type { IAttribute } from "../@types/IAttribute.ts";
import { dbojs, flags, entries } from "../services/index.ts";
import { canEdit } from "../utils/index.ts";

// ── helpers ───────────────────────────────────────────────────────────────────

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function scrub(obj: IDBOBJ): IDBOBJ {
  const copy = structuredClone(obj) as IDBOBJ;
  if (copy.data) delete copy.data.password;
  return copy;
}

async function requireActor(userId: string): Promise<IDBOBJ | null> {
  return (await dbojs.queryOne({ id: userId })) ?? null;
}

async function canEditObj(actorId: string, target: IDBOBJ): Promise<boolean> {
  const actor = await requireActor(actorId);
  if (!actor) return false;
  return canEdit(actor, target);
}

const POISON_KEYS = new Set(["__proto__", "constructor", "prototype"]);

// ── attribute helpers ─────────────────────────────────────────────────────────

function getAttrs(obj: IDBOBJ): IAttribute[] {
  return (obj.data?.attributes as IAttribute[] | undefined) ?? [];
}

function setAttrOnObj(obj: IDBOBJ, name: string, value: string, setter: string): void {
  obj.data ??= {};
  const attrs = getAttrs(obj).filter((a) => a.name.toUpperCase() !== name.toUpperCase());
  attrs.push({ name: name.toUpperCase(), value, setter, type: "attribute" } satisfies IAttribute);
  (obj.data as Record<string, unknown>).attributes = attrs;
}

function delAttrFromObj(obj: IDBOBJ, name: string): boolean {
  const before = getAttrs(obj);
  const after = before.filter((a) => a.name.toUpperCase() !== name.toUpperCase());
  if (before.length === after.length) return false;
  (obj.data as Record<string, unknown>).attributes = after;
  return true;
}

// ── flag / function catalog (public, no auth) ─────────────────────────────────

const KNOWN_FLAGS = [
  "abode", "admin", "ansi", "audible", "blind", "builder", "chown_ok",
  "connected", "dark", "destroy_ok", "enter_ok", "exit", "fixed", "going",
  "guest", "haven", "inherit", "jump_ok", "keep_key", "link_ok", "listener",
  "loud", "monitor", "no_command", "no_inherit", "no_tel", "opaque",
  "parent_ok", "player", "puppet", "quiet", "robot", "room", "safe",
  "slave", "startup", "sticky", "storyteller", "superuser", "suspended",
  "thing", "transparent", "unfindable", "verbose", "visual", "void", "wizard",
].sort();

export function flagsHandler(_req: Request): Response {
  return json({ flags: KNOWN_FLAGS });
}

const ENGINE_LAZY_FUNCS = ["if", "ifelse", "iter", "localize", "parse", "switch", "while"];

export function functionsHandler(_req: Request): Response {
  const all = new Set<string>([
    ...ENGINE_LAZY_FUNCS,
    ...Array.from(entries()).map(([name]) => name),
  ]);
  return json({ functions: Array.from(all).sort() });
}

// ── main handler ──────────────────────────────────────────────────────────────

export async function objectsHandler(req: Request, userId: string): Promise<Response> {
  const url  = new URL(req.url);
  const path = url.pathname;

  // POST /api/v1/objects — create
  if (path === "/api/v1/objects" && req.method === "POST") {
    return await createObject(req, userId);
  }

  // GET /api/v1/objects — search
  if (path === "/api/v1/objects" && req.method === "GET") {
    return await searchObjects(url, userId);
  }

  // Sub-resource routes: /api/v1/objects/:id[/...]
  const attrMatch = path.match(/^\/api\/v1\/objects\/([^/]+)\/attrs\/(.+)$/);
  if (attrMatch) return await attrRoute(req, userId, attrMatch[1], attrMatch[2]);

  const subMatch = path.match(/^\/api\/v1\/objects\/([^/]+)\/(attrs|eval|tree|link)$/);
  if (subMatch) return await subRoute(req, userId, subMatch[1], subMatch[2]);

  const idMatch = path.match(/^\/api\/v1\/objects\/([^/]+)$/);
  if (idMatch) return await objectRoute(req, userId, idMatch[1]);

  return json({ error: "Not Found" }, 404);
}

// ── GET /api/v1/objects ───────────────────────────────────────────────────────

async function searchObjects(url: URL, userId: string): Promise<Response> {
  const actor = await requireActor(userId);
  if (!actor) return json({ error: "Unauthorized" }, 401);

  const flagFilter  = url.searchParams.get("flags") ?? "";
  const location    = url.searchParams.get("location") ?? "";
  const nameFilter  = url.searchParams.get("name") ?? "";
  const limit       = Math.min(Math.max(1, parseInt(url.searchParams.get("limit") ?? "50", 10) || 50), 500);

  // deno-lint-ignore no-explicit-any
  const query: Record<string, any> = {};
  if (location) query.location = location;
  if (nameFilter) query["data.name"] = new RegExp(nameFilter, "i");

  const all = await dbojs.find(query);
  const visible: IDBOBJ[] = [];
  for (const obj of all) {
    if (flagFilter && !flags.check(obj.flags, flagFilter)) continue;
    if (await canEdit(actor, obj)) visible.push(scrub(obj));
    if (visible.length >= limit) break;
  }
  return json({ objects: visible, total: visible.length });
}

// ── POST /api/v1/objects ──────────────────────────────────────────────────────

async function createObject(req: Request, userId: string): Promise<Response> {
  const actor = await requireActor(userId);
  if (!actor) return json({ error: "Unauthorized" }, 401);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const name     = String(body.name ?? "New Object").slice(0, 100);
  const objFlags = String(body.flags ?? "thing");
  const location = String(body.location ?? actor.id);

  // Only builders+ can create in arbitrary locations; others create in inventory.
  const isStaff = flags.check(actor.flags, "builder+");
  const finalLoc = isStaff ? location : actor.id;

  const quota  = (actor.data?.quota as number) ?? 0;
  if (!isStaff && quota < 1) return json({ error: "Insufficient quota" }, 403);

  const created = await dbojs.create({
    flags: objFlags,
    location: finalLoc,
    data: { name, owner: actor.id },
  } as unknown as IDBOBJ);

  if (!isStaff) {
    await dbojs.modify({ id: actor.id }, "$set", { data: { ...actor.data, quota: quota - 1 } });
  }

  return json(scrub(created), 201);
}

// ── /api/v1/objects/:id ───────────────────────────────────────────────────────

async function objectRoute(req: Request, userId: string, id: string): Promise<Response> {
  const target = await dbojs.queryOne({ id });
  if (!target) return json({ error: "Not Found" }, 404);

  if (req.method === "GET") {
    if (!await canEditObj(userId, target)) return json({ error: "Forbidden" }, 403);
    return json(scrub(target));
  }

  if (req.method === "PATCH") {
    if (!await canEditObj(userId, target)) return json({ error: "Forbidden" }, 403);
    let body: Record<string, unknown>;
    try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

    const ALLOWED = new Set(["name", "description", "moniker", "image"]);
    if (body.data && typeof body.data === "object") {
      const filtered: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(body.data as Record<string, unknown>)) {
        if (ALLOWED.has(k) && !POISON_KEYS.has(k)) filtered[k] = v;
      }
      target.data = { ...target.data, ...filtered };
    }
    await dbojs.modify({ id: target.id }, "$set", target);
    return json(scrub(target));
  }

  if (req.method === "DELETE") {
    if (!await canEditObj(userId, target)) return json({ error: "Forbidden" }, 403);
    // Prevent destroying players.
    if (/\bplayer\b/i.test(target.flags)) return json({ error: "Cannot destroy a player object" }, 400);
    await dbojs.modify({ id: target.id }, "$set", { ...target, flags: target.flags + " going" });
    // Move contents to limbo (#0) before deletion.
    const contents = await dbojs.find({ location: target.id });
    for (const child of contents) {
      await dbojs.modify({ id: child.id }, "$set", { ...child, location: "0" });
    }
    await dbojs.delete({ id: target.id });
    return json({ deleted: true, id: target.id });
  }

  return json({ error: "Method Not Allowed" }, 405);
}

// ── /api/v1/objects/:id/attrs ─────────────────────────────────────────────────

async function subRoute(req: Request, userId: string, id: string, sub: string): Promise<Response> {
  const target = await dbojs.queryOne({ id });
  if (!target) return json({ error: "Not Found" }, 404);

  if (sub === "attrs" && req.method === "GET") {
    if (!await canEditObj(userId, target)) return json({ error: "Forbidden" }, 403);
    return json({ attrs: getAttrs(target) });
  }

  if (sub === "eval" && req.method === "POST") {
    return await evalRoute(req, userId, target);
  }

  if (sub === "tree" && req.method === "GET") {
    return await treeRoute(target);
  }

  if (sub === "link" && req.method === "POST") {
    if (!await canEditObj(userId, target)) return json({ error: "Forbidden" }, 403);
    return await linkRoute(req, userId, target);
  }

  return json({ error: "Not Found" }, 404);
}

// ── /api/v1/objects/:id/attrs/:attr ──────────────────────────────────────────

async function attrRoute(req: Request, userId: string, id: string, attr: string): Promise<Response> {
  const target = await dbojs.queryOne({ id });
  if (!target) return json({ error: "Not Found" }, 404);
  if (!await canEditObj(userId, target)) return json({ error: "Forbidden" }, 403);

  const name = attr.toUpperCase().replace(/[^A-Z0-9_.-]/g, "");
  if (!name) return json({ error: "Invalid attribute name" }, 400);

  if (req.method === "PUT") {
    let body: Record<string, unknown>;
    try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
    const value = String(body.value ?? "");
    setAttrOnObj(target, name, value, userId);
    await dbojs.modify({ id: target.id }, "$set", target);
    return json({ name, value });
  }

  if (req.method === "DELETE") {
    const deleted = delAttrFromObj(target, name);
    if (!deleted) return json({ error: "Attribute not found" }, 404);
    await dbojs.modify({ id: target.id }, "$set", target);
    return json({ deleted: true, name });
  }

  return json({ error: "Method Not Allowed" }, 405);
}

// ── POST /api/v1/objects/:id/eval ─────────────────────────────────────────────

async function evalRoute(req: Request, userId: string, target: IDBOBJ): Promise<Response> {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const code = String(body.code ?? "").slice(0, 8192);
  if (!code) return json({ error: "code is required" }, 400);

  try {
    const { softcodeService } = await import("../services/Softcode/index.ts");
    const result = await softcodeService.runSoftcode(code, {
      actorId:    userId,
      executorId: target.id,
      socketId:   `rest-eval-${userId}`,
    });
    return json({ result: result ?? "" });
  } catch (e: unknown) {
    return json({ error: String(e) }, 500);
  }
}

// ── GET /api/v1/objects/:id/tree ──────────────────────────────────────────────

async function treeRoute(target: IDBOBJ): Promise<Response> {
  // Returns the room, its exits, and each exit's destination (one level deep).
  const room = /\broom\b/i.test(target.flags) ? target : null;
  const exits = room
    ? await dbojs.find({ $and: [{ flags: /exit/i }, { location: target.id }] })
    : [];

  const nodes: IDBOBJ[] = [scrub(target)];
  const edges: { exitId: string; from: string; to: string; name: string }[] = [];

  for (const exit of exits) {
    nodes.push(scrub(exit));
    const dest = exit.data?.destination as string | undefined;
    if (dest) {
      edges.push({
        exitId: exit.id,
        from: target.id,
        to: dest,
        name: (exit.data?.name as string ?? "").split(";")[0].trim(),
      });
      const destRoom = await dbojs.queryOne({ id: dest });
      if (destRoom && !nodes.some((n) => n.id === destRoom.id)) {
        nodes.push(scrub(destRoom));
      }
    }
  }

  return json({ nodes, edges });
}

// ── POST /api/v1/objects/:id/link ─────────────────────────────────────────────

async function linkRoute(req: Request, _userId: string, exit: IDBOBJ): Promise<Response> {
  if (!/\bexit\b/i.test(exit.flags)) return json({ error: "Object is not an exit" }, 400);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const destId = String(body.destination ?? "").replace(/^#/, "");
  if (!destId) return json({ error: "destination is required" }, 400);

  const dest = await dbojs.queryOne({ id: destId });
  if (!dest) return json({ error: "Destination not found" }, 404);
  if (!/\broom\b/i.test(dest.flags)) return json({ error: "Destination must be a room" }, 400);

  exit.data ??= {};
  exit.data.destination = destId;
  await dbojs.modify({ id: exit.id }, "$set", exit);
  return json({ linked: true, exitId: exit.id, destination: destId });
}
