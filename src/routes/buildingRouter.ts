import { dbojs } from "../services/Database/index.ts";
import { getNextId } from "../utils/getNextId.ts";
import { Obj } from "../services/DBObjs/DBObjs.ts";
import type { IDBOBJ } from "../@types/IDBObj.ts";

const hasFlag = (flags: string, ...names: string[]): boolean => {
  const set = new Set(flags.split(/\s+/));
  return names.some(n => set.has(n));
};

export const buildingHandler = async (req: Request, userId: string): Promise<Response> => {
  const url = new URL(req.url);
  const path = url.pathname;
  
  // POST /api/v1/building/room
  if (path === "/api/v1/building/room" && req.method === "POST") {
    const user = await Obj.get(userId);
    if (!user) return new Response("Unauthorized", { status: 401 });
    
    // Permission check: Wizard/Admin or Builder?
    // For now, check if they have 'builder' flag or higher
    // Simple check: flags string inclusion.
    if (!hasFlag(user.flags, "wizard", "admin", "builder")) {
         return new Response("Forbidden: You must be a builder.", { status: 403 });
    }

    const body = await req.json();
    const { name, description, parent } = body;

    if (!name) return new Response("Missing name", { status: 400 });
    if (typeof name !== "string" || name.length > 200) {
      return new Response(JSON.stringify({ error: "Room name must be 200 characters or fewer." }), { status: 400, headers: { "Content-Type": "application/json" } });
    }
    if (description !== undefined && (typeof description !== "string" || description.length > 2000)) {
      return new Response(JSON.stringify({ error: "Room description must be 2000 characters or fewer." }), { status: 400, headers: { "Content-Type": "application/json" } });
    }

    const id = await getNextId("objid");
    
    const newRoom: IDBOBJ = {
      id: id.toString(),
      flags: "room",
      data: {
        name,
        description: description || "",
        owner: user.dbref,
        parent: parent || undefined // linking to parent room/zone
      }
    };

    await dbojs.create(newRoom);

    return new Response(JSON.stringify(newRoom), {
      status: 201,
      headers: { "Content-Type": "application/json" }
    });
  }

  return new Response("Not Found", { status: 404 });
};
