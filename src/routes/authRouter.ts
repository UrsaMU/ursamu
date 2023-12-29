import { Context, Router } from "https://deno.land/x/oak@v12.6.1/mod.ts"
import { Obj, dbojs } from "../services/index.ts";
import { compare } from "../../deps.ts";
import { sign } from "../services/jwt/index.ts";
import { config } from "../../deps.ts";

config();

const router = new Router();

router.post("/auth", async (ctx: Context) => {
  try {
    const { username, password } = await ctx.request.body().value;
    const ob = await dbojs.queryOne({
      $or: [
        { "data.alias": new RegExp(username, "i") },
        { "data.name": new RegExp(username, "i") },
      ],
    });

    if (!ob) {
      ctx.response.status = 401;
      ctx.response.body = { error: "Invalid username or password." };
      return;
    }

    const obj = new Obj().load(ob);
    obj.dbobj.data ||= {};
    obj.dbobj.data.password ||= "";

    // Using promises with compare function
    const isMatch = await new Promise((resolve, reject) => {
      compare(password, obj.data?.password, (err: any, match: any) => {
        if (err) reject(err);
        resolve(match);
      });
    });

    if (!isMatch) {
      ctx.response.status = 401;
      ctx.response.body = { error: "Invalid username or password." };
      return;
    }

    const token = await sign({ id: obj.dbobj.id });
    if (token) {
      ctx.response.status = 200;
      ctx.response.body = { token };
    } else {
      ctx.response.status = 500;
      ctx.response.body = { error: "Unable to generate token." };
    }
  } catch (err) {
    ctx.response.status = 500;
    ctx.response.body = { error: err.message };
  }
});

export { router as authRouter}