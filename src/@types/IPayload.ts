import jwt from "../../deps.ts";

export interface IPayload extends jwt.JwtPayload {
  id: string;
}
