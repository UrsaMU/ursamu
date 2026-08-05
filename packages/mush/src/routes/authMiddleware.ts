import { verifyToken as verify } from "@ursamu/core";

export const authenticate = async (req: Request): Promise<string | null> => {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) return null;

  const m = authHeader.match(/^Bearer\s+(\S+)/i);
  const token = m?.[1];
  if (!token) return null;

  try {
    const decoded = await verify(token);
    if (!decoded || decoded.id == null || decoded.id === "") return null;
    // Coerce — some JWT libs / older tokens may store id as number.
    return String(decoded.id);
  } catch {
    return null;
  }
};
