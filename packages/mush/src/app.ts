/**
 * @module app
 * @description UrsaMU HTTP application layer — thin bridge to @ursamu/mush routes.
 *
 * All REST route implementations now live in packages/mush/src/routes/.
 * Call setupRoutes() once at startup before httpTransport.start().
 */

import { authenticate } from "./routes/authMiddleware.ts";
import {
  registerMushRoutes, handleRequest as _mushHandleRequest,
  setAuthenticator, MAX_API_TRACKED_IPS,
} from "./routes/index.ts";
import { registerRoute, verifyToken } from "@ursamu/core";

/**
 * Describes a UI component that a plugin contributes to the web client.
 */
export interface IUIComponent {
  element: string;
  slot: string;
  script: string;
  lock?: string;
  label?: string;
  order?: number;
  plugin?: string;
}
export { MAX_API_TRACKED_IPS };

/** Register all MUSH REST routes. Call before httpTransport.start(). */
export function setupRoutes(): void {
  setAuthenticator(authenticate);

  const configured = Deno.env.get("CORS_ORIGINS") ?? "*";
  if (configured === "*") {
    console.warn(
      "[app] WARNING: CORS is configured to allow all origins ('*'). " +
      "Set CORS_ORIGINS to a comma-separated list of allowed origins for production."
    );
  }

  registerMushRoutes(authenticate);
}

/** Full HTTP request dispatcher — used by registerFallback and tests. */
export async function handleRequest(req: Request, remoteAddr?: string): Promise<Response> {
  const url = new URL(req.url);

  if (url.pathname === "/api/v1/ui-manifest" && req.method === "GET") {
    let userFlags = "";
    try {
      const auth = req.headers.get("authorization") ?? "";
      const token = auth.replace(/^Bearer\s+/i, "");
      if (token) {
        const payload = await verifyToken(token);
        const userId = payload.id as string;
        if (userId) {
          const { dbojs } = await import("./world/dbobjs.ts");
          const player = await dbojs.queryOne({ id: userId });
          if (player) userFlags = player.flags;
        }
      }
    } catch { /* unauthenticated */ }

    const components = getRegisteredUIComponents(userFlags);
    type PComp = { element: string; slot: string; script: string; label?: string; order: number };
    const slots: Record<string, PComp[]> = {};
    for (const comp of components) {
      const slot = comp.slot ?? "default";
      if (!slots[slot]) slots[slot] = [];
      slots[slot].push({ element: comp.element, slot: comp.slot, script: comp.script, label: comp.label, order: comp.order ?? 0 });
    }
    for (const slot of Object.values(slots)) {
      slot.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    }
    return Response.json({ slots });
  }

  const res = await _mushHandleRequest(req, remoteAddr);

  const h = new Headers(res.headers);
  h.set("content-security-policy",
    "default-src 'none'; script-src 'self'; style-src 'self'; " +
    "img-src 'self' data:; connect-src 'self' ws: wss:; frame-ancestors 'none'; " +
    "form-action 'self'");
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
}

export { registerRoute as registerPluginRoute } from "@ursamu/core";
export { addCmd } from "./commands/addCmd.ts";

// ── UI component registry ─────────────────────────────────────────────────────

const _uiComponents = new Map<string, IUIComponent>();

export function registerUIComponent(component: IUIComponent): void {
  _uiComponents.set(component.element, { lock: "connected", order: 0, ...component });
}

export function unregisterUIComponent(element: string): void {
  _uiComponents.delete(element);
}

export function getRegisteredUIComponents(userFlags = ""): IUIComponent[] {
  return Array.from(_uiComponents.values()).filter((c) => {
    const lock = c.lock ?? "connected";
    if (!lock) return true;
    if (lock === "connected") return userFlags.includes("connected");
    if (lock.includes("admin+")) return userFlags.includes("admin") || userFlags.includes("wizard") || userFlags.includes("superuser");
    if (lock.includes("wizard")) return userFlags.includes("wizard") || userFlags.includes("superuser");
    if (lock.includes("builder+")) return userFlags.includes("builder") || userFlags.includes("admin") || userFlags.includes("wizard") || userFlags.includes("superuser");
    return true;
  });
}

registerRoute("GET", "/api/v1/ui-manifest", async (req) => {
  let userFlags = "";
  try {
    const auth = req.headers.get("authorization") ?? "";
    const token = auth.replace(/^Bearer\s+/i, "");
    if (token) {
      const payload = await verifyToken(token);
      const userId = payload.id as string;
      if (userId) {
        const { dbojs } = await import("./world/dbobjs.ts");
        const player = await dbojs.queryOne({ id: userId });
        if (player) userFlags = player.flags;
      }
    }
  } catch { /* unauthenticated */ }

  const components = getRegisteredUIComponents(userFlags);

  const slots: Record<string, typeof components> = {};
  for (const comp of components) {
    const slot = comp.slot ?? "default";
    if (!slots[slot]) slots[slot] = [];
    slots[slot].push(comp);
  }
  for (const slot of Object.values(slots)) {
    slot.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }

  return Response.json({ slots });
});
