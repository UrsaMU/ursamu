import { djwt } from "../../../deps.ts";

// Generate a per-process fallback so there is no known static secret.
// Tokens signed with it will be invalidated on restart — set JWT_SECRET in
// production (or in .env for development) for cross-restart auto-reauth.
const _FALLBACK_SECRET = crypto.randomUUID() + crypto.randomUUID();

let _resolvedSecret: string | null = null;
let _warned = false;

const resolveSecret = (): string => {
  if (_resolvedSecret) return _resolvedSecret;
  const env = Deno.env.get("JWT_SECRET");
  if (env) {
    _resolvedSecret = env;
    return env;
  }
  if (!_warned) {
    _warned = true;
    if (Deno.env.get("DENO_ENV") === "production") {
      console.error("[jwt] FATAL: JWT_SECRET must be set in production. Exiting.");
      Deno.exit(1);
    }
    console.warn(
      "[jwt] WARNING: JWT_SECRET not set. Using a random per-process secret — tokens will be invalidated on restart.",
    );
  }
  _resolvedSecret = _FALLBACK_SECRET;
  return _FALLBACK_SECRET;
};

const getSecretKey = async () => {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(resolveSecret());
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
