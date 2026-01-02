import { djwt } from "../../../deps.ts";

const getSecretKey = async () => {
  const secret = Deno.env.get("JWT_SECRET") || "TotallyNotSoSecure";
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  return await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
};

export const sign = async (payload: Record<string, unknown>): Promise<string> => {
  const key = await getSecretKey();
  return await djwt.create(
    { alg: "HS256", typ: "JWT" },
    { ...payload, exp: (payload.exp as number) || djwt.getNumericDate(60 * 60) },
    key
  );
};

export const verify = async (token: string): Promise<Record<string, unknown>> => {
  const key = await getSecretKey();
  return (await djwt.verify(token, key)) as Record<string, unknown>;
};
