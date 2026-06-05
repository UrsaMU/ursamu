/**
 * @module app
 * @description UrsaMU HTTP application layer — thin bridge to @ursamu/mush routes.
 *
 * All REST route implementations now live in packages/mush/src/routes/.
 * Call setupRoutes() once at startup before httpTransport.start().
 */

import { authenticate } from "./middleware/authMiddleware.ts";
import {
  registerMushRoutes, handleRequest as _mushHandleRequest,
  setAuthenticator, MAX_API_TRACKED_IPS,
} from "@ursamu/mush";
import { registerRoute, verifyToken } from "@ursamu/core";
import type { IUIComponent } from "./@types/IUIComponent.ts";

export type { IUIComponent };
export { MAX_API_TRACKED_IPS };

/** Register all MUSH REST routes. Call before httpTransport.start(). */
export function setupRoutes(): void {
  setAuthenticator(authenticate);

  // Warn operators about wildcard CORS — a misconfiguration that allows all origins.
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

  // Handle UI manifest here — it uses the in-process registry.
  if (url.pathname === "/api/v1/ui-manifest" && req.method === "GET") {
    let userFlags = "";
    try {
      const auth = req.headers.get("authorization") ?? "";
      const token = auth.replace(/^Bearer\s+/i, "");
      if (token) {
        const payload = await verifyToken(token);
        const userId = payload.id as string;
        if (userId) {
          const { dbojs } = await import("@ursamu/mush");
          const player = await dbojs.queryOne({ id: userId });
          if (player) userFlags = player.flags;
        }
      }
    } catch { /* unauthenticated */ }

    const components = getRegisteredUIComponents(userFlags);
    // Strip internal fields (lock, plugin) — only expose public-safe fields.
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

  // Add enhanced CSP headers (the core transport adds basic ones; we augment here).
  const h = new Headers(res.headers);
  h.set("content-security-policy",
    "default-src 'none'; script-src 'self'; style-src 'self'; " +
    "img-src 'self' data:; connect-src 'self' ws: wss:; frame-ancestors 'none'; " +
    "form-action 'self'");
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
}

// Legacy plugin route API re-exports.
export { registerRoute as registerPluginRoute } from "@ursamu/core";
export { addCmd } from "@ursamu/mush";

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

// Register the UI manifest endpoint — returns components grouped by slot.
registerRoute("GET", "/api/v1/ui-manifest", async (req) => {
  // Optionally authenticate to filter by privilege
  let userFlags = "";
  try {
    const auth = req.headers.get("authorization") ?? "";
    const token = auth.replace(/^Bearer\s+/i, "");
    if (token) {
      const payload = await verifyToken(token);
      const userId = payload.id as string;
      if (userId) {
        const { dbojs } = await import("@ursamu/mush");
        const player = await dbojs.queryOne({ id: userId });
        if (player) userFlags = player.flags;
      }
    }
  } catch { /* unauthenticated */ }

  const components = getRegisteredUIComponents(userFlags);

  // Group by slot
  const slots: Record<string, typeof components> = {};
  for (const comp of components) {
    const slot = comp.slot ?? "default";
    if (!slots[slot]) slots[slot] = [];
    slots[slot].push(comp);
  }
  // Sort each slot by order
  for (const slot of Object.values(slots)) {
    slot.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }

  return Response.json({ slots });
});
