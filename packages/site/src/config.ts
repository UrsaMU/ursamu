/**
 * plugins.site config from game config.json.
 */

export type SiteNavItem = {
  /** Stable id for merge with registerSiteNav (optional in config). */
  id?: string;
  label: string;
  href: string;
  active?: boolean;
  /** Sort key; lower first. Default 50 (config) / 100 (plugins). */
  order?: number;
};

export type SitePluginConfig = {
  /** Named skin: "default" | "changeling" | "court" | path-like */
  skin?: string;
  /**
   * Absolute or site-relative CSS URL for a fully custom skin.
   * Wins over `skin`. Example: "/theme/my-game.css"
   * or a game-local path served via themeDir: "/site/theme/my.css"
   */
  skinCss?: string;
  /** Document / brand title */
  title?: string;
  /** Banner image URL (optional) */
  bannerImage?: string;
  /** Suppress top background art */
  plainBg?: boolean;
  /**
   * Mount path for static assets (default "/site/").
   * Trailing slash normalized.
   */
  mount?: string;
  /** Also serve index at GET / when true (default false). */
  serveRoot?: boolean;
  /**
   * Game-relative directory of custom CSS/images.
   * Served at `{mount}/theme/…` (e.g. "theme" → /site/theme/foo.css).
   */
  themeDir?: string;
  nav?: SiteNavItem[];
  /**
   * Left-menu template (markdown-ish). See menu.ts.
   * Macros: [[featured]], [[section]], plugin [[name]].
   */
  leftMenu?: string;
  /** Telnet address shown in the connect panel (e.g. "host:4201") */
  telnet?: string;
};

export function normalizeMount(raw: unknown): string {
  let m = typeof raw === "string" && raw.trim() ? raw.trim() : "/site";
  if (!m.startsWith("/")) m = `/${m}`;
  if (m.length > 1 && m.endsWith("/")) m = m.slice(0, -1);
  return m;
}

/** Normalize a URL path for nav active matching. */
export function normalizeNavPath(raw: string): string {
  let p = String(raw ?? "").split("?")[0].split("#")[0].trim();
  if (!p || p === "#") return "";
  if (p.endsWith("/index.html")) {
    p = p.slice(0, -"/index.html".length) || "/";
  }
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
  return p || "/";
}

/**
 * True when a nav href should show as active for the current path.
 * Home (`/site`) only matches home — not login/wiki/etc.
 * Prefix match only for multi-segment hrefs (`/site/wiki` → lore).
 */
export function navHrefIsActive(
  href: string,
  path: string,
): boolean {
  const h = normalizeNavPath(href);
  const p = normalizeNavPath(path);
  if (!h || h === "#") return false;
  if (h === p) return true;
  // Bare roots (/ or /site) must not match every child path
  const depth = h.split("/").filter(Boolean).length;
  if (depth >= 2 && p.startsWith(`${h}/`)) return true;
  return false;
}

/** Apply path-based active flags (ignores static active:true). */
export function markNavActive(
  items: SiteNavItem[],
  path: string,
): SiteNavItem[] {
  return items.map((item) => ({
    ...item,
    active: navHrefIsActive(item.href, path),
  }));
}

/** Cache-bust query for shipped site CSS (bump when layout/tokens change). */
export const SITE_ASSET_V = "20260802m";

/** Resolve stylesheet href for the active skin. */
export function resolveSkinHref(cfg: SitePluginConfig): string {
  const custom = (cfg.skinCss ?? "").trim();
  if (custom) {
    // Preserve absolute/custom URLs; append bust only for same-origin skins
    if (custom.startsWith("/site/") && !custom.includes("?")) {
      return `${custom}?v=${SITE_ASSET_V}`;
    }
    return custom;
  }
  const named = (cfg.skin ?? "default").trim() || "default";
  if (named.startsWith("/") || named.startsWith("http")) {
    return named;
  }
  return `/site/css/skins/${named}.css?v=${SITE_ASSET_V}`;
}

/**
 * Brand defaults when skin is "changeling" or legacy "court"
 * and fields are left unset. Installed themes fill gaps via
 * registerSiteTheme / themeToSiteConfig.
 */
export function applySkinDefaults(
  cfg: SitePluginConfig,
): SitePluginConfig {
  const out = { ...cfg };
  const skin = (cfg.skinCss ? "" : (cfg.skin ?? "default")).trim()
    .toLowerCase();

  // Builtin Court family — only fill fields that were never set.
  // Empty string from admin means "explicitly hide" (do not restore).
  if (skin === "changeling" || skin === "court") {
    const asset = skin === "court" ? "court" : "changeling";
    if (out.bannerImage === undefined) {
      out.bannerImage =
        `/site/skins/${asset}/imgs/header.png`;
    }
    if (out.title === undefined) {
      out.title = "Court of Miracles";
    }
  }

  // Installed / registered theme may already set skinCss
  if (!out.nav) {
    out.nav = [
      { label: "Home", href: "/site/" },
      { label: "Characters", href: "#" },
      { label: "Help", href: "#" },
      { label: "Wiki", href: "#" },
    ];
  }
  return out;
}

export function readSiteConfig(
  // deno-lint-ignore no-explicit-any
  gameConfig: any,
): SitePluginConfig {
  const block = gameConfig?.plugins?.site;
  if (!block || typeof block !== "object") return {};
  const o = block as Record<string, unknown>;
  const out: SitePluginConfig = {};
  if (typeof o.skin === "string") out.skin = o.skin.trim();
  if (typeof o.skinCss === "string") out.skinCss = o.skinCss.trim();
  if (typeof o.title === "string") out.title = o.title.trim();
  if (typeof o.bannerImage === "string") {
    out.bannerImage = o.bannerImage.trim();
  }
  if (typeof o.plainBg === "boolean") out.plainBg = o.plainBg;
  if (typeof o.mount === "string") out.mount = o.mount.trim();
  if (typeof o.serveRoot === "boolean") out.serveRoot = o.serveRoot;
  if (typeof o.themeDir === "string") {
    out.themeDir = o.themeDir.trim();
  }
  if (typeof o.telnet === "string") {
    out.telnet = o.telnet.trim();
  }
  if (typeof o.leftMenu === "string") {
    out.leftMenu = o.leftMenu;
  }
  if (Array.isArray(o.nav)) {
    out.nav = o.nav
      .filter((x) => x && typeof x === "object")
      .map((x) => {
        const r = x as Record<string, unknown>;
        const order = typeof r.order === "number" &&
            Number.isFinite(r.order)
          ? r.order
          : undefined;
        const id = typeof r.id === "string" && r.id.trim()
          ? r.id.trim()
          : undefined;
        return {
          id,
          label: String(r.label ?? "Link"),
          href: String(r.href ?? "#"),
          active: r.active === true,
          order,
        };
      });
  }
  return out;
}
