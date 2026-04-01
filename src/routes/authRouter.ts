import { dbojs } from "../services/Database/index.ts";
import { Obj } from "../services/DBObjs/index.ts";
import { compare, hash, genSalt } from "../../deps.ts";
import { sign } from "../services/jwt/index.ts";
import { getNextId } from "../utils/getNextId.ts";
import { logSecurity } from "../utils/logger.ts";
import { getConfig } from "../services/Config/mod.ts";

const escRx = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// --- Brute-force protection for login ---
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const MAX_LOGIN_ATTEMPTS = 10;
const LOGIN_WINDOW_MS = 60_000; // 1 minute
// Hard cap on tracked IPs — prevents memory exhaustion from IP-cycling attacks.
export const MAX_TRACKED_IPS = 10_000;

function evictExpiredLoginAttempts(now: number): void {
  for (const [ip, entry] of loginAttempts) {
    if (now >= entry.resetAt) loginAttempts.delete(ip);
  }
}

function isLoginRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || now >= entry.resetAt) {
    if (!entry) {
      // Sweep expired entries before admitting a new IP.
      evictExpiredLoginAttempts(now);
      // If still full, conservatively rate-limit rather than FIFO-evicting.
      if (loginAttempts.size >= MAX_TRACKED_IPS) return true;
    }
    loginAttempts.set(ip, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
    return false;
  }
  entry.count++;
  return entry.count > MAX_LOGIN_ATTEMPTS;
}

function recordLoginFailure(ip: string): void {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || now >= entry.resetAt) {
    if (!entry) {
      evictExpiredLoginAttempts(now);
      if (loginAttempts.size >= MAX_TRACKED_IPS) return; // map full, skip silently
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

// --- Input length limits ---
const MIN_PASSWORD = 8;
const MAX_USERNAME = 64;
const MAX_PASSWORD = 512;
const MAX_EMAIL = 254;

export const authHandler = async (req: Request, remoteAddr = "unknown"): Promise<Response> => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const url = new URL(req.url);
  const isRegister = url.pathname.endsWith("/register");
  const isReset = url.pathname.endsWith("/reset-password");

  const trustedProxy = getConfig<boolean>("server.trustedProxy") ?? false;
  const clientIp = trustedProxy
    ? (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown"
    : remoteAddr;

  // --- Password reset ---
  if (isReset) {
    if (isLoginRateLimited(clientIp)) {
      await logSecurity("RESET_RATE_LIMITED", { ip: clientIp });
      return new Response(JSON.stringify({ error: "Too many requests. Try again later." }), {
        status: 429, headers: { "Content-Type": "application/json", "Retry-After": "60" },
      });
    }
    try {
      const { token, newPassword } = await req.json();
      if (!token || !newPassword) {
        return new Response(JSON.stringify({ error: "token and newPassword are required." }), {
          status: 400, headers: { "Content-Type": "application/json" },
        });
      }
      if (typeof newPassword !== "string" || newPassword.length < MIN_PASSWORD || newPassword.length > MAX_PASSWORD) {
        return new Response(JSON.stringify({ error: `Password must be between ${MIN_PASSWORD} and ${MAX_PASSWORD} characters.` }), {
          status: 400, headers: { "Content-Type": "application/json" },
        });
      }
      const user = await dbojs.queryOne({ "data.resetToken": token });

      // Constant-time token comparison — no early exit on length mismatch.
      // Pad both sides to the longer length so the XOR loop always runs the
      // same number of iterations, removing the timing oracle on token length.
      const storedToken  = (user?.data?.resetToken as string | undefined) ?? "";
      const enc          = new TextEncoder();
      const maxLen       = Math.max(storedToken.length, token.length);
      const storedBytes  = enc.encode(storedToken.padEnd(maxLen, "\0"));
      const tokenBytes   = enc.encode(token.padEnd(maxLen, "\0"));
      let _diff = 0;
      for (let i = 0; i < maxLen; i++) _diff |= storedBytes[i] ^ tokenBytes[i];
      // Incorporate length difference so tokens of unequal length never match.
      _diff |= storedToken.length ^ token.length;
      const tokensMatch  = _diff === 0;

      const expiry = user?.data?.resetTokenExpiry as number | undefined;
      const expired = !expiry || Date.now() > expiry;

      if (!user || !tokensMatch || expired) {
        // Clean up an expired token while still returning the same error.
        if (user && expired) {
          delete user.data!.resetToken;
          delete user.data!.resetTokenExpiry;
          await dbojs.modify({ id: user.id }, "$set", { data: user.data });
        }
        return new Response(JSON.stringify({ error: "Invalid or expired reset token." }), {
          status: 400, headers: { "Content-Type": "application/json" },
        });
      }
      const hashed = await hash(newPassword, await genSalt(10));
      user.data!.password = hashed;
      delete user.data!.resetToken;
      delete user.data!.resetTokenExpiry;
      await dbojs.modify({ id: user.id }, "$set", { data: user.data });
      await logSecurity("PASSWORD_RESET", { userId: user.id, ip: clientIp });
      return new Response(JSON.stringify({ message: "Password updated successfully." }), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
    } catch {
      return new Response(JSON.stringify({ error: "Invalid request." }), {
        status: 400, headers: { "Content-Type": "application/json" },
      });
    }
  }

  try {
    const { username, password, email } = await req.json();

    if (isRegister) {
        // REGISTRATION logic
        if (isLoginRateLimited(clientIp)) {
            await logSecurity("REGISTER_RATE_LIMITED", { ip: clientIp });
            return new Response(JSON.stringify({ error: "Too many requests. Try again later." }), {
                status: 429, headers: { "Content-Type": "application/json", "Retry-After": "60" },
            });
        }
        if (!username || !password || !email) {
            return new Response(JSON.stringify({ error: "Username, email, and password are required." }), {
                status: 400,
                headers: { "Content-Type": "application/json" },
            });
        }

        if (typeof username !== "string" || username.length > MAX_USERNAME) {
            return new Response(JSON.stringify({ error: `Username must be ${MAX_USERNAME} characters or fewer.` }), { status: 400, headers: { "Content-Type": "application/json" } });
        }
        if (typeof password !== "string" || password.length < MIN_PASSWORD || password.length > MAX_PASSWORD) {
            return new Response(JSON.stringify({ error: `Password must be between ${MIN_PASSWORD} and ${MAX_PASSWORD} characters.` }), { status: 400, headers: { "Content-Type": "application/json" } });
        }
        if (typeof email !== "string" || email.length > MAX_EMAIL) {
            return new Response(JSON.stringify({ error: `Email must be ${MAX_EMAIL} characters or fewer.` }), { status: 400, headers: { "Content-Type": "application/json" } });
        }

        // Check if user exists
        const existing = await dbojs.findOne({
            $or: [
                { "data.alias": new RegExp(`^${escRx(username)}$`, "i") },
                { "data.name": new RegExp(`^${escRx(username)}$`, "i") },
                { "data.email": new RegExp(`^${escRx(email)}$`, "i") },
            ],
        });

        if (existing) {
            recordLoginFailure(clientIp);
            return new Response(JSON.stringify({ error: "Username or email already taken." }), {
                status: 409,
                headers: { "Content-Type": "application/json" },
            });
        }

        const id = await getNextId("objid");
        const hashedPassword = await hash(password, await genSalt(10));

        await dbojs.create({
            id,
            flags: "player connected",
            data: {
                name: username,
                alias: username,
                email,
                password: hashedPassword,
                home: "1",
            },
            location: "1",
        });

        const token = await sign({ id });
        return new Response(JSON.stringify({ token, id, name: username }), {
            status: 201,
            headers: { "Content-Type": "application/json" },
        });

    } else {
        // LOGIN logic
        if (isLoginRateLimited(clientIp)) {
            await logSecurity("LOGIN_RATE_LIMITED", { ip: clientIp, username });
            return new Response(JSON.stringify({ error: "Too many login attempts. Try again later." }), {
                status: 429,
                headers: { "Content-Type": "application/json", "Retry-After": "60" },
            });
        }

        const ob = await dbojs.findOne({
            $or: [
                { "data.alias": new RegExp(`^${escRx(username)}$`, "i") },
                { "data.name": new RegExp(`^${escRx(username)}$`, "i") },
            ],
        });

        if (!ob) {
            recordLoginFailure(clientIp);
            await logSecurity("LOGIN_FAILED", { ip: clientIp, username });
            return new Response(JSON.stringify({ error: "Invalid username or password." }), {
                status: 401,
                headers: { "Content-Type": "application/json" },
            });
        }

        const obj = new Obj().load(ob);
        obj.dbobj.data ||= {};
        const hashedPassword = obj.dbobj.data.password || "";

        const isMatch = await compare(password, hashedPassword);
        if (!isMatch) {
            recordLoginFailure(clientIp);
            await logSecurity("LOGIN_FAILED", { ip: clientIp, username });
            return new Response(JSON.stringify({ error: "Invalid username or password." }), {
                status: 401,
                headers: { "Content-Type": "application/json" },
            });
        }

        const token = await sign({ id: obj.dbobj.id });
        return new Response(JSON.stringify({ token, id: obj.dbobj.id, name: obj.dbobj.data.name || "Unknown" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        });
    }

  } catch {
    return new Response(JSON.stringify({ error: "Internal server error." }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
