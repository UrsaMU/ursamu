/**
 * Live-game harness for events E2E tests.
 * Starts games/events-local when not already up.
 */

import { dirname, fromFileUrl, join } from "jsr:@std/path@^0.224.0";

export const OPTS = { sanitizeResources: false, sanitizeOps: false };

const HERE = dirname(fromFileUrl(import.meta.url));
export const GAME_ROOT = join(HERE, "../../../games/events-local");

export const BASE = (Deno.env.get("EVENTS_E2E_BASE") ||
  "http://127.0.0.1:4393").replace(/\/$/, "");

export const ADMIN = BASE + "/admin";

let startedByUs = false;

export function hasPlaywright(): boolean {
  const home = Deno.env.get("HOME") || "";
  for (const p of [
    home + "/Library/Caches/ms-playwright",
    home + "/.cache/ms-playwright",
  ]) {
    try {
      Deno.statSync(p);
      return true;
    } catch {
      /* next */
    }
  }
  return false;
}

export async function gameUp(timeoutMs = 2500): Promise<boolean> {
  try {
    const r = await fetch(BASE + "/api/v1/register", {
      method: "OPTIONS",
      signal: AbortSignal.timeout(timeoutMs),
    });
    // Any response means the server is listening
    return r.status > 0;
  } catch {
    try {
      const r = await fetch(BASE + "/", {
        signal: AbortSignal.timeout(timeoutMs),
      });
      return r.status > 0;
    } catch {
      return false;
    }
  }
}

export async function ensureGame(): Promise<void> {
  if (await gameUp()) {
    console.log("[e2e] game already up at " + BASE);
    return;
  }
  console.log("[e2e] starting games/events-local …");
  // Reset DB for clean first-user superuser
  const reset = new Deno.Command("bash", {
    args: ["-lc", "rm -rf data/typegraph.db data/ursamu.db && mkdir -p data logs run"],
    cwd: GAME_ROOT,
    stdout: "piped",
    stderr: "piped",
  });
  await reset.output();

  const start = new Deno.Command("bash", {
    args: ["./scripts/daemon.sh"],
    cwd: GAME_ROOT,
    stdout: "piped",
    stderr: "piped",
  });
  const out = await start.output();
  if (out.code !== 0) {
    const err = new TextDecoder().decode(out.stderr) +
      new TextDecoder().decode(out.stdout);
    throw new Error("failed to start events-local:\n" + err);
  }
  startedByUs = true;

  for (let i = 0; i < 60; i++) {
    if (await gameUp(2000)) {
      console.log("[e2e] game ready");
      return;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("events-local did not become ready within 60s");
}

export async function stopGameIfStarted(): Promise<void> {
  if (!startedByUs) return;
  console.log("[e2e] stopping games/events-local …");
  const stop = new Deno.Command("bash", {
    args: ["./scripts/stop.sh"],
    cwd: GAME_ROOT,
    stdout: "piped",
    stderr: "piped",
  });
  await stop.output();
  startedByUs = false;
}

export type AuthUser = {
  username: string;
  password: string;
  token: string;
};

const GOD_USER = "e2egod";
const GOD_PASS = "TestPass123!";
let cachedGod: AuthUser | null = null;

async function loginUser(
  username: string,
  password: string,
): Promise<string | null> {
  const login = await fetch(BASE + "/api/v1/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const ld = await login.json() as { token?: string };
  return login.ok && ld.token ? ld.token : null;
}

/**
 * Stable superuser for staff routes.
 * On a fresh DB the first register becomes superuser — we claim that slot.
 */
export async function ensureGod(): Promise<AuthUser> {
  if (cachedGod) {
    // Refresh token in case of expiry
    const t = await loginUser(cachedGod.username, cachedGod.password);
    if (t) {
      cachedGod = { ...cachedGod, token: t };
      return cachedGod;
    }
    cachedGod = null;
  }

  const existing = await loginUser(GOD_USER, GOD_PASS);
  if (existing) {
    cachedGod = { username: GOD_USER, password: GOD_PASS, token: existing };
    return cachedGod;
  }

  const r = await fetch(BASE + "/api/v1/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: GOD_USER,
      password: GOD_PASS,
      email: "e2egod@test.local",
    }),
  });
  const data = await r.json() as { token?: string; error?: string };
  if (!r.ok || !data.token) {
    // Race: someone else registered first — login again
    const t = await loginUser(GOD_USER, GOD_PASS);
    if (!t) {
      throw new Error(
        "ensureGod failed: " + (data.error || r.status),
      );
    }
    cachedGod = { username: GOD_USER, password: GOD_PASS, token: t };
    return cachedGod;
  }
  cachedGod = {
    username: GOD_USER,
    password: GOD_PASS,
    token: data.token,
  };
  return cachedGod;
}

/** Register a unique non-staff player (for RSVP capacity paths). */
export async function registerPlayer(
  prefix = "evplay",
): Promise<AuthUser> {
  // Ensure god exists first so this user is NOT the first (non-superuser).
  await ensureGod();
  const username = prefix + Date.now().toString(36) +
    Math.floor(Math.random() * 1e4).toString(36);
  const password = "TestPass123!";
  const r = await fetch(BASE + "/api/v1/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username,
      password,
      email: username + "@test.local",
    }),
  });
  const data = await r.json() as { token?: string; error?: string };
  if (!r.ok || !data.token) {
    throw new Error(
      "registerPlayer failed: " + (data.error || r.status),
    );
  }
  return { username, password, token: data.token };
}

/** @deprecated use ensureGod / registerPlayer */
export async function registerStaff(
  prefix = "evstaff",
): Promise<AuthUser> {
  if (prefix.startsWith("evplay") || prefix.startsWith("evfull")) {
    return registerPlayer(prefix);
  }
  return ensureGod();
}

export async function apiJson<T = unknown>(
  token: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; data: T }> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const r = await fetch(BASE + path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let data = null as T;
  try {
    data = (text ? JSON.parse(text) : null) as T;
  } catch {
    data = { error: text } as T;
  }
  return { status: r.status, data };
}
