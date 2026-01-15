import { dbojs } from "../services/Database/index.ts";
import { Obj } from "../services/DBObjs/index.ts";
import { compare, hash, genSalt } from "../../deps.ts";
import { sign } from "../services/jwt/index.ts";
import { getNextId } from "../utils/getNextId.ts";

export const authHandler = async (req: Request): Promise<Response> => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const url = new URL(req.url);
  const isRegister = url.pathname.endsWith("/register");

  try {
    const { username, password, email } = await req.json();

    if (isRegister) {
        // REGISTRATION logic
        if (!username || !password || !email) {
            return new Response(JSON.stringify({ error: "Username, email, and password are required." }), {
                status: 400,
                headers: { "Content-Type": "application/json" },
            });
        }

        // Check if user exists
        const existing = await dbojs.findOne({
            $or: [
                { "data.alias": new RegExp(`^${username}$`, "i") },
                { "data.name": new RegExp(`^${username}$`, "i") },
                { "data.email": new RegExp(`^${email}$`, "i") },
            ],
        });

        if (existing) {
            return new Response(JSON.stringify({ error: "Username or email already taken." }), {
                status: 409,
                headers: { "Content-Type": "application/json" },
            });
        }

        const id = await getNextId("objid");
        const hashedPassword = await hash(password, await genSalt(10));

        await dbojs.create({
            id,
            flags: "player connected",
            data: {
                name: username,
                alias: username,
                email,
                password: hashedPassword,
                home: "1",
            },
            location: "1",
        });

        const token = await sign({ id });
        return new Response(JSON.stringify({ token, id, name: username }), {
            status: 201,
            headers: { "Content-Type": "application/json" },
        });

    } else {
        // LOGIN logic
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
        return new Response(JSON.stringify({ token, id: obj.dbobj.id, name: obj.dbobj.data.name || "Unknown" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        });
    }

  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
