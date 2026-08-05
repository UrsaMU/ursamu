/**
 * Soft-register Channels in staff console
 * (`route: "channels"` → /admin/channels).
 */

const NAV = {
  id: "channels",
  label: "Channels",
  description:
    "Chat channels — locks, who, history, and admin tools.",
  route: "channels",
  order: 42,
} as const;

type NavApi = {
  registerStaffNav?: (item: typeof NAV) => void;
  unregisterStaffNav?: (id: string) => void;
};

async function loadWebNav(): Promise<NavApi | null> {
  try {
    const spec = "@ursamu/web";
    return await import(spec) as NavApi;
  } catch {
    return null;
  }
}

export async function registerChannelsStaffNav(): Promise<void> {
  const mod = await loadWebNav();
  if (typeof mod?.registerStaffNav !== "function") {
    console.log(
      "[channels] @ursamu/web not available — staff nav skipped",
    );
    return;
  }
  mod.registerStaffNav({ ...NAV });
  console.log(
    `[channels] Staff nav registered → /admin/${NAV.route}`,
  );
}

export async function unregisterChannelsStaffNav(): Promise<void> {
  const mod = await loadWebNav();
  if (typeof mod?.unregisterStaffNav === "function") {
    mod.unregisterStaffNav("channels");
  }
}
