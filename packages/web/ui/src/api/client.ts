/**
 * API client — WebSocket RPC for all staff calls after login.
 * Only POST /api/v1/login uses HTTP (to obtain the JWT).
 */

import { getAdminSocket } from "@/api/adminSocket";

const TOKEN_KEY = "ursamu.webAdmin.token";
const TOKEN_KEY_LEGACY = "ursamu.wikiAdmin.token";

export function getToken(): string {
  try {
    const cur = sessionStorage.getItem(TOKEN_KEY) ?? "";
    if (cur) return cur;
    const legacy = sessionStorage.getItem(TOKEN_KEY_LEGACY) ?? "";
    if (legacy) {
      sessionStorage.setItem(TOKEN_KEY, legacy);
      sessionStorage.removeItem(TOKEN_KEY_LEGACY);
      return legacy;
    }
    return "";
  } catch {
    return "";
  }
}

export function setToken(token: string | null): void {
  try {
    if (token) {
      sessionStorage.setItem(TOKEN_KEY, token);
      sessionStorage.removeItem(TOKEN_KEY_LEGACY);
    } else {
      sessionStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(TOKEN_KEY_LEGACY);
    }
  } catch {
    /* private mode */
  }
}

export type ApiResult<T = unknown> = {
  res: Response;
  data: T;
};

function fakeResponse(status: number, data: unknown): Response {
  return new Response(
    data == null ? null : JSON.stringify(data),
    {
      status,
      headers: { "Content-Type": "application/json" },
    },
  );
}

async function httpFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<ApiResult<T>> {
  const headers = new Headers(init.headers ?? {});
  const isForm = typeof FormData !== "undefined" &&
    init.body instanceof FormData;
  // Let the browser set multipart boundary for FormData
  if (!headers.has("Content-Type") && init.body && !isForm) {
    headers.set("Content-Type", "application/json");
  }
  if (isForm && headers.has("Content-Type")) {
    headers.delete("Content-Type");
  }
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(path, { ...init, headers });
  const text = await res.text();
  let data: T = null as T;
  try {
    data = (text ? JSON.parse(text) : null) as T;
  } catch {
    data = { error: text || res.statusText } as T;
  }
  return { res, data };
}

async function wsFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<ApiResult<T>> {
  const sock = getAdminSocket();
  if (!sock?.connected) {
    return {
      res: fakeResponse(503, { error: "WebSocket not connected" }),
      data: { error: "WebSocket not connected" } as T,
    };
  }
  const method = (init.method ?? "GET").toUpperCase();
  let body: unknown;
  if (init.body != null && typeof init.body === "string") {
    try {
      body = JSON.parse(init.body);
    } catch {
      body = init.body;
    }
  }
  try {
    const { status, data } = await sock.request(method, path, body);
    return {
      res: fakeResponse(status, data),
      data: data as T,
    };
  } catch (e: unknown) {
    return {
      res: fakeResponse(503, { error: String(e) }),
      data: { error: String(e) } as T,
    };
  }
}

/**
 * Staff API call. Login + multipart uploads use HTTP;
 * everything else prefers WebSocket.
 */
export async function api<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<ApiResult<T>> {
  const method = (init.method ?? "GET").toUpperCase();
  const isForm = typeof FormData !== "undefined" &&
    init.body instanceof FormData;
  if (
    (path === "/api/v1/login" && method === "POST") ||
    isForm ||
    (path === "/api/v1/admin/site/theme" && method === "POST" &&
      isForm)
  ) {
    return httpFetch<T>(path, init);
  }
  const sock = getAdminSocket();
  if (sock?.connected) {
    return wsFetch<T>(path, init);
  }
  // Bootstrap before socket is up — rare; login path only ideally.
  return httpFetch<T>(path, init);
}
