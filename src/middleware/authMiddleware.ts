import { NextFunction, Request, Response } from "express";
import { IMError, IPayload } from "../@types";
import { verify } from "../services/jwt";

export default async (req: Request, res: Response, next: NextFunction) => {
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
