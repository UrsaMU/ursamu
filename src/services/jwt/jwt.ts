import { djwt } from "../../../deps.ts";

// Generate a per-process fallback so there is no known static secret.
// Tokens will be invalidated on restart. Set JWT_SECRET in production.
const _FALLBACK_SECRET = crypto.randomUUID() + crypto.randomUUID();
const _JWT_SECRET_ENV = Deno.env.get("JWT_SECRET");
if (!_JWT_SECRET_ENV) {
  if (Deno.env.get("DENO_ENV") === "production") {
    console.error("[jwt] FATAL: JWT_SECRET must be set in production. Exiting.");
    Deno.exit(1);
  }
  console.warn(
    "[jwt] WARNING: JWT_SECRET not set. Using a random per-process secret — tokens will be invalidated on restart.",
  );
}

const getSecretKey = async () => {
  const secret = _JWT_SECRET_ENV || _FALLBACK_SECRET;
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
