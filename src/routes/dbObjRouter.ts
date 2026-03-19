import type { IDBOBJ } from "../@types/IDBObj.ts";
import { Obj, dbojs, flags } from "../services/index.ts";
import { canEdit } from "../utils/index.ts";

export const dbObjHandler = async (req: Request, userId: string): Promise<Response> => {
  const url = new URL(req.url);
  
  if (url.pathname.endsWith("/dbos") && req.method === "GET") {
    const en = await Obj.get(userId);
    const flgs = url.searchParams.get("flags") || "";

    if (!en) {
      return new Response(JSON.stringify({ error: "Not Found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const allDbos = await dbojs.find({});
    const dbos: IDBOBJ[] = [];

    for (const dbo of allDbos) {
        if (await canEdit(en.dbobj, dbo) && flags.check(dbo.flags, flgs)) {
             const copy = { ...dbo };
             if (copy.data) {
                 delete copy.data.password;
             }
             dbos.push(copy);
        }
    }

    return new Response(JSON.stringify(dbos), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
  
  // Individual Object operations
  // URL format: /api/v1/dbobj/:id
  const match = url.pathname.match(/\/api\/v1\/dbobj\/(.+)/);
  if (match) {
      const dbref = match[1];
      const en = await Obj.get(userId);
      if (!en) return new Response("Unauthorized", { status: 401 });

      const targetObj = await dbojs.queryOne({ id: dbref });
      if (!targetObj) return new Response("Not Found", { status: 404 });

      if (!await canEdit(en.dbobj, targetObj)) {
          return new Response("Forbidden", { status: 403 });
      }

      if (req.method === "GET") {
          const copy = { ...targetObj };
          if (copy.data) delete copy.data.password;
          return new Response(JSON.stringify(copy), {
              status: 200,
              headers: { "Content-Type": "application/json" }
          });
      }

      if (req.method === "PATCH") {
          const updates = await req.json();

          // Whitelist the data fields that may be updated via API
          const ALLOWED_DATA_FIELDS = new Set(["name", "description", "moniker", "image"]);
          const POISON_KEYS = new Set(["__proto__", "constructor", "prototype"]);

          if (updates.data && typeof updates.data === "object") {
              const filtered: Record<string, unknown> = {};
              for (const [k, v] of Object.entries(updates.data as Record<string, unknown>)) {
                  if (ALLOWED_DATA_FIELDS.has(k) && !POISON_KEYS.has(k)) {
                      filtered[k] = v;
                  }
              }
              targetObj.data = { ...targetObj.data, ...filtered };
          }

          // Explicitly ignore id, flags, location — only allow description at top level
          if (updates.description && !POISON_KEYS.has("description")) {
            targetObj.description = updates.description;
          }

          await dbojs.modify({ id: targetObj.id }, "$set", targetObj);
          
          const copy = { ...targetObj };
          if (copy.data) delete copy.data.password;
          
          return new Response(JSON.stringify(copy), {
              status: 200, 
              headers: { "Content-Type": "application/json" }
          });
      }
  }

  return new Response("Not Found", { status: 404 });
};
