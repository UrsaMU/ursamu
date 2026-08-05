/**
 * Dynamically load same-origin plugin Vue ESM modules into the host router.
 *
 * Plugin registers:
 *   registerStaffPage({
 *     id: "mytool",
 *     label: "My Tool",
 *     module: "/admin/mytool/host-entry.js",
 *     route: "ext-mytool", // optional
 *     embed: "/admin/mytool/", // fallback if import fails
 *   })
 *
 * host-entry.js must export default a Vue component (or { default }).
 * Peer: vue major must match the host console (see package.json).
 */

import { ref } from "vue";
import type { Router } from "vue-router";
import type { StaffNavItem } from "@/api/types";

/** Vue peer major expected by the host UI. */
export const HOST_VUE_PEER_MAJOR = 3;

const loaded = new Set<string>();
const failed = new Set<string>();
const stubbed = new Set<string>();

/**
 * Bumped when routes are added so AppLayout `primary` recomputes.
 * vue-router hasRoute is not reactive on its own.
 */
export const staffRoutesEpoch = ref(0);

function bumpRoutesEpoch(): void {
  staffRoutesEpoch.value += 1;
}

export function isSameOriginModule(url: string): boolean {
  if (!url || typeof url !== "string") return false;
  const u = url.trim();
  if (u.startsWith("/")) return true;
  try {
    return new URL(u, window.location.origin).origin ===
      window.location.origin;
  } catch {
    return false;
  }
}

export function moduleLoadFailed(pluginId: string): boolean {
  return failed.has(pluginId);
}

export function moduleLoadOk(pluginId: string): boolean {
  return loaded.has(pluginId);
}

/** Safe path segment for /admin/<path> (plugin id). */
function safePathSeg(raw: string): string | null {
  const s = raw.trim().toLowerCase();
  if (!s || s.length > 64) return null;
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(s)) return null;
  return s;
}

/** Test helper. */
export function resetPluginModuleState(): void {
  loaded.clear();
  failed.clear();
  stubbed.clear();
  staffRoutesEpoch.value = 0;
}

/**
 * Register missing routes for nav items that declare `module`.
 * Safe to call multiple times (idempotent per id).
 * On failure, marks id failed so UI can fall back to embed.
 */
export async function ensurePluginModules(
  router: Router,
  nav: StaffNavItem[],
): Promise<void> {
  let added = 0;
  for (const item of nav) {
    const modUrl = item.module?.trim();
    if (!modUrl) continue;
    if (loaded.has(item.id) || failed.has(item.id)) continue;

    if (!isSameOriginModule(modUrl)) {
      console.warn(
        `[web] plugin module must be same-origin: ${modUrl}`,
      );
      failed.add(item.id);
      continue;
    }

    const routeName = (item.route?.trim() || `ext-${item.id}`)
      .trim();
    if (router.hasRoute(routeName)) {
      loaded.add(item.id);
      continue;
    }

    try {
      // @ts-expect-error Vite cannot analyze dynamic plugin URLs
      const mod = await import(/* @vite-ignore */ modUrl);
      const component = mod?.default ?? mod?.Component ?? null;
      if (!component) {
        console.warn(
          `[web] plugin module ${modUrl} has no default export`,
        );
        failed.add(item.id);
        continue;
      }
      if (!router.hasRoute("app")) {
        console.warn(
          "[web] layout route \"app\" missing — skip module",
        );
        failed.add(item.id);
        continue;
      }
      router.addRoute("app", {
        path: `p/${encodeURIComponent(item.id)}`,
        name: routeName,
        component,
        meta: {
          requiresAuth: true,
          pluginId: item.id,
          vuePeerMajor: HOST_VUE_PEER_MAJOR,
        },
      });
      loaded.add(item.id);
      added += 1;
    } catch (e: unknown) {
      console.warn(
        `[web] failed to load plugin module ${modUrl}:`,
        e,
      );
      failed.add(item.id);
    }
  }
  if (added) bumpRoutesEpoch();
}

/**
 * Plugins may registerStaffNav({ route: "mail" }) before the host
 * ships a real page. Without a vue-router entry, RouterLink throws
 * on resolve and the top-tab renders empty. Register a pending stub
 * so the tab always has a valid href.
 */
export function ensureStaffRouteStubs(
  router: Router,
  nav: StaffNavItem[],
): number {
  if (!router.hasRoute("app")) return 0;
  let added = 0;
  for (const item of nav) {
    const routeName = item.route?.trim();
    if (!routeName || routeName === "plugin-embed") continue;
    // Dynamic modules own their route registration.
    if (item.module?.trim()) continue;
    if (router.hasRoute(routeName)) continue;
    if (stubbed.has(routeName)) continue;

    const path = safePathSeg(item.id) || safePathSeg(routeName);
    if (!path) {
      console.warn(
        `[web] skip stub route for unsafe id: ${item.id}`,
      );
      continue;
    }

    router.addRoute("app", {
      path,
      name: routeName,
      component: () => import("@/views/PluginPendingView.vue"),
      meta: {
        requiresAuth: true,
        pluginId: item.id,
        stub: true,
      },
    });
    stubbed.add(routeName);
    added += 1;
  }
  if (added) bumpRoutesEpoch();
  return added;
}

/**
 * Resolve which top-nav target to use for a staff nav item.
 * Never returns a named route the host cannot resolve — that makes
 * Vue RouterLink render an empty tab.
 */
export function resolveNavTarget(
  item: StaffNavItem,
  hasRoute: (name: string) => boolean,
): {
  name?: string;
  params?: Record<string, string>;
  href?: string;
  to?: { name: string; params?: Record<string, string> };
} {
  const routeName = item.route?.trim();
  const embed = item.embed?.trim();
  const mod = item.module?.trim();

  if (mod && failed.has(item.id) && embed) {
    return {
      name: "plugin-embed",
      to: {
        name: "plugin-embed",
        params: { pluginId: item.id },
      },
    };
  }

  if (routeName === "plugin-embed" || (embed && !routeName && !mod)) {
    return {
      name: "plugin-embed",
      to: {
        name: "plugin-embed",
        params: { pluginId: item.id },
      },
    };
  }

  // Only use a named route when the host actually has it.
  if (routeName && hasRoute(routeName)) {
    return { name: routeName, to: { name: routeName } };
  }

  // Module still loading — provisional (caller should hide until
  // hasRoute becomes true / epoch bumps).
  if (mod && !failed.has(item.id) && routeName) {
    return { name: routeName, to: { name: routeName } };
  }

  if (embed) {
    return {
      name: "plugin-embed",
      to: {
        name: "plugin-embed",
        params: { pluginId: item.id },
      },
    };
  }

  if (item.href?.trim()) {
    return { href: item.href.trim() };
  }

  return {};
}

/** True when the resolved target is safe to pass to RouterLink. */
export function navTargetReady(
  target: ReturnType<typeof resolveNavTarget>,
  hasRoute: (name: string) => boolean,
): boolean {
  if (target.href) return true;
  const name = target.to?.name ?? target.name;
  if (!name) return false;
  if (name === "plugin-embed") {
    return Boolean(target.to?.params?.pluginId) || hasRoute(name);
  }
  return hasRoute(name);
}
