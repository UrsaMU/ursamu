import { Router, Context, Next } from "../../deps.ts";
import { IMError, IPayload } from "../@types/index.ts";
import { verify } from "../services/jwt/index.ts";

export default async (ctx: Context, next: Next) => {
  const token = ctx.request.headers.get("authorization")?.split(" ")[1];
  if (!token) {
    ctx.response.status = 401;
    ctx.response.body = { error: "Unauthorized" };
    return;
     }

  try {
    const decoded = (await verify(token)) as IPayload;
    if (!decoded) {
      const err: IMError = new Error("Unauthorized");
      ctx.response.status = 401;
      ctx.response.body = { error: "Unauthorized" };
      return;
      
    }
    ctx.state.id = decoded.id;
  } catch {
    const err: IMError = new Error("Unauthorized");
    err.status = 401;
    return
  }

  await next();
};
