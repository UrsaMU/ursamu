/**
 * Soft-register Sprawl Gig Rooms in staff console.
 */
const PAGE = {
  id: "sprawl",
  label: "Sprawl Gigs",
  description: "Gig room type images",
  route: "sprawl-gigs",
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
    };
  } catch {
    return null;
  }
}

export async function registerSprawlStaffNav(): Promise<void> {
  const mod = await web();
  if (!mod) return;
  if (typeof mod.softRegisterStaffPage === "function") {
    await mod.softRegisterStaffPage({ ...PAGE });
    return;
  }
  mod.registerStaffPage?.({ ...PAGE });
}

export async function unregisterSprawlStaffNav(): Promise<void> {
  const mod = await web();
  if (!mod) return;
  if (typeof mod.softUnregisterStaffPage === "function") {
    await mod.softUnregisterStaffPage(PAGE.id);
    return;
  }
  mod.unregisterStaffPage?.(PAGE.id);
}
