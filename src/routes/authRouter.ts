import { dbojs } from "../services/Database/index.ts";
import { Obj } from "../services/DBObjs/index.ts";
import { compare } from "../../deps.ts";
import { sign } from "../services/jwt/index.ts";

export const authHandler = async (req: Request): Promise<Response> => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  try {
    const { username, password } = await req.json();
    const ob = await dbojs.findOne({
      $or: [
        { "data.alias": new RegExp(username, "i") },
        { "data.name": new RegExp(username, "i") },
      ],
    });

    if (!ob) {
      return new Response(JSON.stringify({ error: "Invalid username or password." }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const obj = new Obj().load(ob);
    obj.dbobj.data ||= {};
    const hashedPassword = obj.dbobj.data.password || "";

    const isMatch = await compare(password, hashedPassword);
    if (!isMatch) {
      return new Response(JSON.stringify({ error: "Invalid username or password." }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const token = await sign({ id: obj.dbobj.id });
    return new Response(JSON.stringify({ token }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
