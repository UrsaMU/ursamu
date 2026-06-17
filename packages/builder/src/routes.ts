/**
 * Building REST API handler.
 *
 * GET    /api/v1/building/rooms           — list rooms owned by caller
 * POST   /api/v1/building/rooms           — create a room
 * GET    /api/v1/building/rooms/:id       — get room details
 * PATCH  /api/v1/building/rooms/:id       — update name / description
 * DELETE /api/v1/building/rooms/:id       — destroy room + orphaned exits
 * POST   /api/v1/building/rooms/:id/exits — create exit from room
 * GET    /api/v1/building/objects/:id     — generic object detail
 */

import { dbojs, gameHooks } from "@ursamu/mush";
import type { ObjectCreatedEvent, ObjectDestroyedEvent, ObjectModifiedEvent } from "@ursamu/mush";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function getNextId(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 8);
}

function objectType(flags: string): "room" | "exit" | "thing" | "player" {
  const f = flags.toLowerCase();
  if (f.includes("room"))   return "room";
  if (f.includes("exit"))   return "exit";
  if (f.includes("player")) return "player";
  return "thing";
}

function hasBuilderAccess(flags: string): boolean {
  const f = new Set(flags.toLowerCase().split(/\s+/));
  return f.has("builder") || f.has("admin") || f.has("wizard") || f.has("superuser");
}

export async function buildingRouteHandler(req: Request, userId: string | null): Promise<Response> {
  if (!userId) return json({ error: "Unauthorized" }, 401);
  const actor = await dbojs.queryOne({ id: userId });
  if (!actor) return json({ error: "Unauthorized" }, 401);
  if (!hasBuilderAccess(actor.flags)) return json({ error: "Forbidden: builder+ required" }, 403);

  const url    = new URL(req.url);
  const path   = url.pathname;
  const method = req.method.toUpperCase();

  // POST /api/v1/building/rooms
  if (path === "/api/v1/building/rooms" && method === "POST") {
    const body = await req.json().catch(() => null);
    if (!body) return json({ error: "Invalid JSON body" }, 400);
    const { name, description = "", parent } = body as Record<string, string>;
    if (!name || typeof name !== "string") return json({ error: "name is required" }, 400);
    if (name.length > 200) return json({ error: "name must be ≤ 200 characters" }, 400);
    if (description.length > 4096) return json({ error: "description must be ≤ 4096 characters" }, 400);
    if (parent !== undefined && (typeof parent !== "string" || parent.length > 64)) {
      return json({ error: "parent must be a valid object ID (≤ 64 characters)" }, 400);
    }
    const id   = getNextId();
    const room = { id, flags: "room", data: { name, description, owner: userId, ...(parent ? { parent } : {}) } };
    await dbojs.create(room);
    await gameHooks.emit("object:created", {
      objectId: id, objectName: name, objectType: "room",
      actorId: userId, actorName: actor.data?.name as string ?? userId,
    } satisfies ObjectCreatedEvent);
    return json(room, 201);
  }

  // GET /api/v1/building/rooms
  if (path === "/api/v1/building/rooms" && method === "GET") {
    const all   = await dbojs.find({ flags: /room/i });
    const owned = all.filter((r) => r.data?.owner === userId || hasBuilderAccess(actor.flags));
    return json(owned.map((r) => ({ id: r.id, name: r.data?.name, description: r.data?.description })));
  }

  const roomMatch   = path.match(/^\/api\/v1\/building\/rooms\/([^/]+)(\/exits)?$/);
  const objectMatch = path.match(/^\/api\/v1\/building\/objects\/([^/]+)$/);

  if (roomMatch) {
    const id      = roomMatch[1];
    const isExits = !!roomMatch[2];
    const room    = await dbojs.queryOne({ id });
    if (!room) return json({ error: "Room not found" }, 404);
    if (room.data?.owner !== userId && !hasBuilderAccess(actor.flags)) return json({ error: "Forbidden" }, 403);

    if (!isExits && method === "GET") return json(room);

    if (!isExits && method === "PATCH") {
      const body = await req.json().catch(() => null);
      if (!body) return json({ error: "Invalid JSON body" }, 400);
      const updates: Record<string, string> = {};
      const { name, description } = body as Record<string, string>;
      if (name !== undefined) {
        if (typeof name !== "string" || name.length > 200) return json({ error: "name must be ≤ 200 characters" }, 400);
        updates["data.name"] = name;
      }
      if (description !== undefined) {
        if (typeof description !== "string" || description.length > 4096) return json({ error: "description must be ≤ 4096 characters" }, 400);
        updates["data.description"] = description;
      }
      if (!Object.keys(updates).length) return json({ error: "Nothing to update" }, 400);
      await dbojs.modify({ id }, "$set", updates);
      await gameHooks.emit("object:modified", {
        objectId: id, objectName: room.data?.name as string ?? id, objectType: "room",
        actorId: userId, actorName: actor.data?.name as string ?? userId,
      } satisfies ObjectModifiedEvent);
      return json({ id, ...updates });
    }

    if (!isExits && method === "DELETE") {
      const name = room.data?.name as string ?? id;
      await dbojs.delete({ id });
      const orphans  = await dbojs.find({ flags: /exit/i });
      for (const e of orphans.filter((x) => x.data?.destination === id || x.location === id)) {
        await dbojs.delete({ id: e.id });
      }
      await gameHooks.emit("object:destroyed", {
        objectId: id, objectName: name, objectType: "room",
        actorId: userId, actorName: actor.data?.name as string ?? userId,
      } satisfies ObjectDestroyedEvent);
      return new Response(null, { status: 204 });
    }

    if (isExits && method === "POST") {
      const body = await req.json().catch(() => null);
      if (!body) return json({ error: "Invalid JSON body" }, 400);
      const { name, destination } = body as Record<string, string>;
      if (!name || typeof name !== "string") return json({ error: "name is required" }, 400);
      if (name.length > 200) return json({ error: "exit name must be ≤ 200 characters" }, 400);
      if (!destination || typeof destination !== "string") return json({ error: "destination is required" }, 400);
      const destRoom = await dbojs.queryOne({ id: destination });
      if (!destRoom) return json({ error: "Destination room not found" }, 404);
      const exitId = getNextId();
      const exit   = { id: exitId, flags: "exit", location: id, data: { name, destination, owner: userId } };
      await dbojs.create(exit);
      await gameHooks.emit("object:created", {
        objectId: exitId, objectName: name, objectType: "exit",
        actorId: userId, actorName: actor.data?.name as string ?? userId, locationId: id,
      } satisfies ObjectCreatedEvent);
      return json(exit, 201);
    }
  }

  if (objectMatch && method === "GET") {
    const id  = objectMatch[1];
    const obj = await dbojs.queryOne({ id });
    if (!obj) return json({ error: "Object not found" }, 404);
    if (obj.data?.owner !== userId && !hasBuilderAccess(actor.flags)) return json({ error: "Forbidden" }, 403);
    return json({
      id: obj.id, flags: obj.flags, name: obj.data?.name,
      description: obj.data?.description, owner: obj.data?.owner,
      location: obj.location, type: objectType(obj.flags),
    });
  }

  return json({ error: "Not Found" }, 404);
}
