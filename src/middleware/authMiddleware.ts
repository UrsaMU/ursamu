import { NextFunction, Request, Response } from "express";
import { IMError } from "../@types";
import { verify } from "../services/jwt";

export default async (req: Request, res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) {
    const err: IMError = new Error("Unauthorized");
    err.status = 401;
    return next(err);
  }

  const id = await verify(token);
  if (!id) {
    const err: IMError = new Error("Unauthorized");
    err.status = 401;
    return next(err);
  }

  req.body.id = id;

  next();
};
