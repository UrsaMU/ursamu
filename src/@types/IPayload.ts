import jwt from "jsonwebtoken";

export interface IPayload extends jwt.JwtPayload {
  id: string;
}
