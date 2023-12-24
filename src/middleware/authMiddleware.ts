import { RequestHandler, Request, Response } from "../../deps.ts";
import { IMError, IPayload } from "../@types/index.ts";
import { verify } from "../services/jwt/index.ts";

export default async (req: Request, res: Response, next: RequestHandler) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) {
    const err: IMError = new Error("Unauthorized");
    err.status = 401;
    return next(err);
  }

  try {
    const decoded = (await verify(token)) as IPayload;
    if (!decoded) {
      const err: IMError = new Error("Unauthorized");
      err.status = 401;
      return next(err);
    }
    req.body.id = decoded.id;
  } catch {
    const err: IMError = new Error("Unauthorized");
    err.status = 401;
    return next(err);
  }

  next();
};
