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

function isLoginRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || now >= entry.resetAt) {
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
      if (!user || !user.data?.resetToken || user.data.resetToken !== token) {
        return new Response(JSON.stringify({ error: "Invalid or expired reset token." }), {
          status: 400, headers: { "Content-Type": "application/json" },
        });
      }
      const expiry = user.data.resetTokenExpiry as number | undefined;
      if (!expiry || Date.now() > expiry) {
        delete user.data.resetToken;
        delete user.data.resetTokenExpiry;
        await dbojs.modify({ id: user.id }, "$set", { data: user.data });
        return new Response(JSON.stringify({ error: "Invalid or expired reset token." }), {
          status: 400, headers: { "Content-Type": "application/json" },
        });
      }
      const hashed = await hash(newPassword, await genSalt(10));
      user.data.password = hashed;
      delete user.data.resetToken;
      delete user.data.resetTokenExpiry;
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
