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

import type { Router } from "vue-router";
import type { StaffNavItem } from "@/api/types";

/** Vue peer major expected by the host UI. */
export const HOST_VUE_PEER_MAJOR = 3;

const loaded = new Set<string>();
const failed = new Set<string>();

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

/** Test helper. */
export function resetPluginModuleState(): void {
  loaded.clear();
  failed.clear();
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

    const routeName = (item.route?.trim() || `ext-${item.id}`).trim();
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
        console.warn("[web] layout route \"app\" missing — skip module");
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
    } catch (e: unknown) {
      console.warn(`[web] failed to load plugin module ${modUrl}:`, e);
      failed.add(item.id);
    }
  }
}

/**
 * Resolve which top-nav target to use for a staff nav item.
 * If module failed and embed exists → plugin-embed shell.
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

  if (routeName && (hasRoute(routeName) || !mod)) {
    return { name: routeName, to: { name: routeName } };
  }

  if (mod && !failed.has(item.id) && routeName) {
    // Module still loading — point at intended route name
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
