/**
 * Admin WS RPC — proxy staff API calls through the existing REST stack.
 *
 * Client sends:  { type:"req", id, method, path, body? }
 * Server replies: { type:"res", id, status, data }
 */

import { handleRequest } from "@ursamu/mush";
import { listStaffNav } from "./staff-nav.ts";
import { listStaffBadges } from "./staff-badges.ts";
import { listStaffSideNav } from "./staff-sidenav.ts";

const ALLOWED_PREFIXES = [
  "/api/v1/me",
  "/api/v1/wiki",
  "/api/v1/jobs",
  "/api/v1/boards",
  "/api/v1/dbos",
  "/api/v1/dbobj",
  "/api/v1/objects",
  "/api/v1/players",
  "/api/v1/admin",
  "/api/v1/map",
  "/api/v1/mail",
  "/api/v1/channels",
  "/api/v1/help",
];

const ALLOWED_METHODS = new Set([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
]);

export type RpcResult = {
  status: number;
  data: unknown;
};

/** Exported for unit tests. */
export function pathAllowed(path: string): boolean {
  if (!path.startsWith("/api/v1/")) return false;
  if (path.includes("..")) return false;
  return ALLOWED_PREFIXES.some(
    (p) => path === p || path.startsWith(p + "/") ||
      path.startsWith(p + "?"),
  );
}

/** Run one staff API call as the authenticated JWT holder. */
export async function runAdminRpc(
  token: string,
  method: string,
  path: string,
  body?: unknown,
  remoteAddr = "admin-ws",
): Promise<RpcResult> {
  const m = method.toUpperCase();
  if (!ALLOWED_METHODS.has(m)) {
    return { status: 405, data: { error: "Method not allowed" } };
  }

  const bare = path.split("?")[0] ?? path;
  if (!pathAllowed(bare)) {
    return { status: 403, data: { error: "Path not allowed" } };
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  };
  let initBody: string | undefined;
  if (
    body !== undefined &&
    m !== "GET" &&
    m !== "HEAD" &&
    m !== "DELETE"
  ) {
    headers["Content-Type"] = "application/json";
    initBody = typeof body === "string" ? body : JSON.stringify(body);
  } else if (m === "DELETE" && body !== undefined) {
    headers["Content-Type"] = "application/json";
    initBody = typeof body === "string" ? body : JSON.stringify(body);
  }

  const url = new URL(path, "http://admin.local");
  const req = new Request(url, {
    method: m,
    headers,
    body: initBody,
  });

  try {
    const res = await handleRequest(req, remoteAddr);
    const text = await res.text();
    let data: unknown = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = { error: text || res.statusText };
      }
    }
    return { status: res.status, data };
  } catch (e: unknown) {
    return {
      status: 500,
      data: { error: String(e) },
    };
  }
}

export type SnapshotPayload = {
  me: unknown;
  pages: unknown;
  online: unknown;
  objects: unknown;
  jobs: unknown;
  jobStats: unknown;
  boards: unknown;
  /** Plugin-contributed topbar entries. */
  staffNav: unknown;
  /** Live badge map key → { key, value, title? }. */
  staffBadges: unknown;
  /** pageId → side-nav groups for plugin pages. */
  staffSideNav: unknown;
};

/** Full console snapshot after auth. */
export async function buildSnapshot(
  token: string,
  remoteAddr = "admin-ws",
): Promise<SnapshotPayload> {
  const rpc = (
    method: string,
    path: string,
  ) => runAdminRpc(token, method, path, undefined, remoteAddr);

  const [me, pages, online, objects, jobs, jobStats, boards] =
    await Promise.all([
      rpc("GET", "/api/v1/me"),
      rpc("GET", "/api/v1/wiki"),
      rpc("GET", "/api/v1/players/online"),
      rpc("GET", "/api/v1/dbos?limit=1000"),
      rpc("GET", "/api/v1/jobs?limit=200"),
      rpc("GET", "/api/v1/jobs/stats"),
      rpc("GET", "/api/v1/boards"),
    ]);

  let objs = objects.data;
  if (objects.status === 404) {
    const alt = await rpc("GET", "/api/v1/objects?limit=500");
    objs = alt.data;
  }

  return {
    me: me.status < 400 ? me.data : null,
    pages: Array.isArray(pages.data) ? pages.data : [],
    online: Array.isArray(online.data)
      ? online.data
      : (online.data as { players?: unknown })?.players ?? [],
    objects: objs,
    jobs: Array.isArray(jobs.data) ? jobs.data : [],
    jobStats: jobStats.status < 400 ? jobStats.data : null,
    boards: Array.isArray(boards.data) ? boards.data : [],
    staffNav: listStaffNav(),
    staffBadges: listStaffBadges(),
    staffSideNav: listStaffSideNav(),
  };
}
