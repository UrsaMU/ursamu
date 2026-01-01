import { verify } from "../services/jwt/index.ts";

export const authenticate = async (req: Request): Promise<string | null> => {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) return null;

  const token = authHeader.split(" ")[1];
  if (!token) return null;

  try {
    const decoded = await verify(token);
    if (!decoded || typeof decoded.id !== "string") return null;
    return decoded.id;
  } catch {
    return null;
  }
};
