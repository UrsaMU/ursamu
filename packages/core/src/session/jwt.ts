import * as djwt from "djwt";

import { getConfig } from "../config/mod.ts";

const _FALLBACK_SECRET = crypto.randomUUID() + crypto.randomUUID();

let _resolvedSecret: string | null = null;
let _warned = false;

function resolveSecret(): string {
  if (_resolvedSecret) return _resolvedSecret;
  const env = Deno.env.get("JWT_SECRET");
  if (env) {
    _resolvedSecret = env;
    return env;
  }
  try {
    const cfg = getConfig<string>("server.jwtSecret");
    if (cfg) {
      _resolvedSecret = cfg;
      return cfg;
    }
  } catch {
    // Config not yet initialized
  }

  const file = ".jwt_secret";
  try {
    const persistent = Deno.readTextFileSync(file).trim();
    if (persistent) {
      _resolvedSecret = persistent;
      return persistent;
    }
  } catch {
    const generated = crypto.randomUUID() + crypto.randomUUID();
    try {
      Deno.writeTextFileSync(file, generated);
      _resolvedSecret = generated;
      return generated;
    } catch {
      // Ignore write errors (e.g., read-only filesystem)
    }
  }

  if (!_warned) {
    _warned = true;
    if (Deno.env.get("DENO_ENV") === "production") {
      console.error("[jwt] FATAL: JWT_SECRET must be set in production. Exiting.");
      Deno.exit(1);
    }
    console.warn(
      "[jwt] WARNING: JWT_SECRET not set and could not be persisted. Using a random per-process secret — tokens will be invalidated on restart.",
    );
  }
  _resolvedSecret = _FALLBACK_SECRET;
  return _FALLBACK_SECRET;
}

async function getSecretKey(): Promise<CryptoKey> {
  const keyData = new TextEncoder().encode(resolveSecret());
  return await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function createToken(payload: Record<string, unknown>): Promise<string> {
  const key = await getSecretKey();
  return await djwt.create(
    { alg: "HS256", typ: "JWT" },
    { ...payload, exp: (payload.exp as number) || djwt.getNumericDate(60 * 60) },
    key,
  );
}

export async function verifyToken(token: string): Promise<Record<string, unknown>> {
  const key = await getSecretKey();
  return (await djwt.verify(token, key)) as Record<string, unknown>;
}
