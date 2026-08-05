/**
 * Staff admin WebSocket — GET /admin/ws?token=<jwt>
 *
 * All console data + mutations after login go over this socket:
 *   req/res RPC  ·  snapshot on auth  ·  live push events
 *
 * Optional first-message auth: { "type": "auth", "token": "..." }
 */

import { registerRoute } from "@ursamu/mush";
import {
  attachSocket,
  resolveStaffUserId,
  broadcastAdmin,
  adminClientCount,
  closeAllClients,
} from "./admin-ws-hub.ts";
import { wireAdminWsHooks } from "./admin-ws-hooks.ts";
import { setStaffBadgePusher } from "./staff-badges.ts";
import { setStaffChromeNotifier } from "./staff-chrome.ts";
import { listStaffNav } from "./staff-nav.ts";
import { listStaffSideNav } from "./staff-sidenav.ts";

export type { AdminWsMsg, OnlineRow } from "./admin-ws-hub.ts";
export {
  broadcastAdmin,
  adminClientCount,
  resolveStaffUserId,
} from "./admin-ws-hub.ts";

let _wired = false;
let _hooksOff: (() => void) | null = null;

async function adminWsHandler(req: Request): Promise<Response> {
  const upgrade = req.headers.get("upgrade")?.toLowerCase() ?? "";
  if (upgrade !== "websocket") {
    return new Response("Upgrade required", { status: 426 });
  }

  const url = new URL(req.url);
  const qToken = url.searchParams.get("token")?.trim() ?? "";
  let preAuth: { userId: string; token: string } | null = null;
  if (qToken) {
    const userId = await resolveStaffUserId(qToken);
    if (!userId) {
      return new Response("Forbidden", { status: 403 });
    }
    preAuth = { userId, token: qToken };
  }

  const { socket, response } = Deno.upgradeWebSocket(req);
  attachSocket(socket, preAuth);
  return response;
}

/** Register GET /admin/ws and subscribe to game/wiki/job hooks. */
export function startAdminWs(): void {
  if (_wired) return;
  _wired = true;

  registerRoute(
    "GET",
    "/admin/ws",
    (req: Request) => adminWsHandler(req),
  );

  setStaffBadgePusher((msg) => {
    broadcastAdmin(msg);
  });
  setStaffChromeNotifier(() => {
    broadcastAdmin({
      type: "staff:chrome",
      staffNav: listStaffNav(),
      staffSideNav: listStaffSideNav(),
    });
  });

  void wireAdminWsHooks().then((off) => {
    _hooksOff = off;
  });

  console.log(
    "[web] Admin WS at /admin/ws (RPC + snapshot + badges + chrome)",
  );
}

export function stopAdminWs(): void {
  if (_hooksOff) {
    _hooksOff();
    _hooksOff = null;
  }
  setStaffBadgePusher(null);
  setStaffChromeNotifier(null);
  closeAllClients();
  _wired = false;
}
