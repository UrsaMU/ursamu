/**
 * @module routes/auth
 *
 * Authentication REST endpoints: POST /api/v1/login, /api/v1/register,
 * /api/v1/reset-password.
 *
 * Includes brute-force rate limiting per IP, constant-time token comparison
 * for reset flows, and input length guards.
 */

import { dbojs, Obj }         from "@ursamu/mush";
import { createToken, getConfig, log } from "@ursamu/core";
import bcrypt                 from "bcrypt";

// ── helpers ───────────────────────────────────────────────────────────────────

const escRx = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// ── brute-force protection ────────────────────────────────────────────────────

const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const MAX_LOGIN_ATTEMPTS = 10;
const LOGIN_WINDOW_MS    = 60_000;
export const MAX_TRACKED_IPS = 10_000;

function evictExpiredLoginAttempts(now: number): void {
  for (const [ip, entry] of loginAttempts) {
    if (now >= entry.resetAt) loginAttempts.delete(ip);
  }
}

function isLoginRateLimited(ip: string): boolean {
  const now   = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || now >= entry.resetAt) {
    if (!entry) {
      evictExpiredLoginAttempts(now);
      if (loginAttempts.size >= MAX_TRACKED_IPS) return true;
    }
    loginAttempts.set(ip, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
    return false;
  }
  entry.count++;
  return entry.count > MAX_LOGIN_ATTEMPTS;
}

function recordLoginFailure(ip: string): void {
  const now   = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || now >= entry.resetAt) {
    if (!entry) {
      evictExpiredLoginAttempts(now);
      if (loginAttempts.size >= MAX_TRACKED_IPS) return;
    }
    loginAttempts.set(ip, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
  } else {
    entry.count++;
  }
}

setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of loginAttempts) {
    if (now >= entry.resetAt) loginAttempts.delete(ip);
  }
}, 60_000);

// ── input limits ──────────────────────────────────────────────────────────────

const MIN_PASSWORD = 8;
const MAX_USERNAME = 64;
const MAX_PASSWORD = 512;
const MAX_EMAIL    = 254;

// ── JSON helpers ──────────────────────────────────────────────────────────────

function jsonResp(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function rateLimitResp(message: string): Response {
  return new Response(
    JSON.stringify({ error: message }),
    { status: 429, headers: { "Content-Type": "application/json", "Retry-After": "60" } },
  );
}

// ── main handler ──────────────────────────────────────────────────────────────

export async function authHandler(req: Request, remoteAddr = "unknown"): Promise<Response> {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const url        = new URL(req.url);
  const isRegister = url.pathname.endsWith("/register");
  const isReset    = url.pathname.endsWith("/reset-password");

  const trustedProxy = getConfig<boolean>("server.trustedProxy") ?? false;
  const clientIp = trustedProxy
    ? (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown"
    : remoteAddr;

  // ── password reset ────────────────────────────────────────────────────────

  if (isReset) {
    if (isLoginRateLimited(clientIp)) {
      await log("warn", "RESET_RATE_LIMITED", { ip: clientIp });
      return rateLimitResp("Too many requests. Try again later.");
    }
    try {
      const { token, newPassword } = await req.json();
      if (!token || !newPassword) {
        return jsonResp({ error: "token and newPassword are required." }, 400);
      }
      if (typeof newPassword !== "string" || newPassword.length < MIN_PASSWORD || newPassword.length > MAX_PASSWORD) {
        return jsonResp({ error: `Password must be between ${MIN_PASSWORD} and ${MAX_PASSWORD} characters.` }, 400);
      }

      const user = await dbojs.queryOne({ "data.resetToken": token });

      // Constant-time comparison to avoid timing oracle on token length.
      const storedToken = (user?.data?.resetToken as string | undefined) ?? "";
      const enc         = new TextEncoder();
      const maxLen      = Math.max(storedToken.length, token.length);
      const storedBytes = enc.encode(storedToken.padEnd(maxLen, "\0"));
      const tokenBytes  = enc.encode(token.padEnd(maxLen, "\0"));
      let _diff = 0;
      for (let i = 0; i < maxLen; i++) _diff |= storedBytes[i] ^ tokenBytes[i];
      _diff |= storedToken.length ^ token.length;
      const tokensMatch = _diff === 0;

      const expiry  = user?.data?.resetTokenExpiry as number | undefined;
      const expired = !expiry || Date.now() > expiry;

      if (!user || !tokensMatch || expired) {
        if (user && expired) {
          delete user.data!.resetToken;
          delete user.data!.resetTokenExpiry;
          await dbojs.modify({ id: user.id }, "$set", { data: user.data });
        }
        return jsonResp({ error: "Invalid or expired reset token." }, 400);
      }

      const hashed = await bcrypt.hash(newPassword, 10);
      user.data!.password = hashed;
      delete user.data!.resetToken;
      delete user.data!.resetTokenExpiry;
      await dbojs.modify({ id: user.id }, "$set", { data: user.data });
      await log("info", "PASSWORD_RESET", { userId: user.id, ip: clientIp });
      return jsonResp({ message: "Password updated successfully." });
    } catch {
      return jsonResp({ error: "Invalid request." }, 400);
    }
  }

  // ── register / login ──────────────────────────────────────────────────────

  try {
    const { username, password, email } = await req.json();

    if (isRegister) {
      if (isLoginRateLimited(clientIp)) {
        await log("warn", "REGISTER_RATE_LIMITED", { ip: clientIp });
        return rateLimitResp("Too many requests. Try again later.");
      }
      if (!username || !password || !email) {
        return jsonResp({ error: "Username, email, and password are required." }, 400);
      }
      if (typeof username !== "string" || username.length > MAX_USERNAME) {
        return jsonResp({ error: `Username must be ${MAX_USERNAME} characters or fewer.` }, 400);
      }
      if (typeof password !== "string" || password.length < MIN_PASSWORD || password.length > MAX_PASSWORD) {
        return jsonResp({ error: `Password must be between ${MIN_PASSWORD} and ${MAX_PASSWORD} characters.` }, 400);
      }
      if (typeof email !== "string" || email.length > MAX_EMAIL) {
        return jsonResp({ error: `Email must be ${MAX_EMAIL} characters or fewer.` }, 400);
      }

      const existing = await dbojs.findOne({
        $or: [
          { "data.alias": new RegExp(`^${escRx(username)}$`, "i") },
          { "data.name":  new RegExp(`^${escRx(username)}$`, "i") },
          { "data.email": new RegExp(`^${escRx(email)}$`,    "i") },
        ],
      });

      if (existing) {
        recordLoginFailure(clientIp);
        return jsonResp({ error: "Username or email already taken." }, 409);
      }

      const counters = (await import("@ursamu/mush")).counters;
      const counter  = await counters.queryOne({ id: "objid" });
      const id       = String((counter?.value ?? 0) + 1);
      await counters.modify({ id: "objid" }, "$set", { id: "objid", value: parseInt(id, 10) });

      const hashedPassword = await bcrypt.hash(password, 10);

      await dbojs.create({
        id,
        flags: "player connected",
        data: { name: username, alias: username, email, password: hashedPassword, home: "1" },
        location: "1",
      } as Parameters<typeof dbojs.create>[0]);

      const token = await createToken({ id });
      return jsonResp({ token, id, name: username }, 201);

    } else {
      // LOGIN
      if (isLoginRateLimited(clientIp)) {
        await log("warn", "LOGIN_RATE_LIMITED", { ip: clientIp, username });
        return jsonResp({ error: "Too many login attempts. Try again later." }, 429);
      }

      const ob = await dbojs.findOne({
        $or: [
          { "data.alias": new RegExp(`^${escRx(username)}$`, "i") },
          { "data.name":  new RegExp(`^${escRx(username)}$`, "i") },
        ],
      });

      if (!ob) {
        recordLoginFailure(clientIp);
        await log("warn", "LOGIN_FAILED", { ip: clientIp, username });
        return jsonResp({ error: "Invalid username or password." }, 401);
      }

      const obj = new Obj().load(ob);
      obj.dbobj.data ||= {};
      const storedHash = (obj.dbobj.data.password as string | undefined) || "";

      const isMatch = await bcrypt.compare(password, storedHash);
      if (!isMatch) {
        recordLoginFailure(clientIp);
        await log("warn", "LOGIN_FAILED", { ip: clientIp, username });
        return jsonResp({ error: "Invalid username or password." }, 401);
      }

      const token = await createToken({ id: obj.dbobj.id });
      return jsonResp({ token, id: obj.dbobj.id, name: obj.dbobj.data.name || "Unknown" });
    }
  } catch {
    return jsonResp({ error: "Internal server error." }, 500);
  }
}
