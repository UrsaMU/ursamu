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

  return new Response("Not Found", { status: 404 });
};
