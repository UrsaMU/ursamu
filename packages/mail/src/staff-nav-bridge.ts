/**
 * Soft-register Mail in the staff console topbar when
 * @ursamu/web is present (`route: "mail"` → /admin/mail).
 */

const NAV = {
  id: "mail",
  label: "Mail",
  description: "In-game mail — inbox, sent, trash, and compose.",
  route: "mail",
  order: 48,
  badgeKey: "mail:unread",
  badgeTitle: "Unread (all players)",
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

export async function registerMailStaffNav(): Promise<void> {
  const mod = await loadWebNav();
  if (typeof mod?.registerStaffNav !== "function") {
    console.log(
      "[mail] @ursamu/web not available — staff nav skipped",
    );
    return;
  }
  mod.registerStaffNav({ ...NAV });
  console.log(`[mail] Staff nav registered → /admin/${NAV.route}`);
}

export async function unregisterMailStaffNav(): Promise<void> {
  const mod = await loadWebNav();
  if (typeof mod?.unregisterStaffNav === "function") {
    mod.unregisterStaffNav("mail");
  }
}
