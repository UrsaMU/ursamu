/**
 * Soft-register Map in the staff console when @ursamu/web is present.
 * In-console only (`route: "map"`).
 */

const MAP_PLUGIN_ID = "map";
const MAP_TITLE = "Map";
const MAP_DESCRIPTION =
  "Vehicles, sector look, legend glyphs, and marks.";

const PAGE = {
  id: MAP_PLUGIN_ID,
  label: MAP_TITLE,
  description: MAP_DESCRIPTION,
  route: "map",
  order: 55,
} as const;

async function web() {
  try {
    const spec = "@ursamu/web";
    return await import(spec) as {
      softRegisterStaffPage?: (
        p: typeof PAGE,
      ) => Promise<boolean>;
      softUnregisterStaffPage?: (id: string) => Promise<boolean>;
      registerStaffPage?: (p: typeof PAGE) => void;
      unregisterStaffPage?: (id: string) => void;
      registerStaffNav?: (p: typeof PAGE) => void;
      unregisterStaffNav?: (id: string) => void;
    };
  } catch {
    return null;
  }
}

export async function registerMapStaffNav(): Promise<void> {
  const mod = await web();
  if (!mod) return;
  if (typeof mod.softRegisterStaffPage === "function") {
    await mod.softRegisterStaffPage({ ...PAGE });
    return;
  }
  if (typeof mod.registerStaffPage === "function") {
    mod.registerStaffPage({ ...PAGE });
    return;
  }
  mod.registerStaffNav?.({ ...PAGE });
}

export async function unregisterMapStaffNav(): Promise<void> {
  const mod = await web();
  if (!mod) return;
  if (typeof mod.softUnregisterStaffPage === "function") {
    await mod.softUnregisterStaffPage(MAP_PLUGIN_ID);
    return;
  }
  if (typeof mod.unregisterStaffPage === "function") {
    mod.unregisterStaffPage(MAP_PLUGIN_ID);
    return;
  }
  mod.unregisterStaffNav?.(MAP_PLUGIN_ID);
}
