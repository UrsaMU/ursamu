/**
 * @module @ursamu/site
 *
 * Generic UrsaMU public front-end: court-template framing +
 * design.md tokens + swappable CSS skins.
 *
 * Plugin contributions:
 *   registerSiteNav / registerSiteMenuBlock / registerSiteStatic
 */

export { plugin as default } from "./src/index.ts";
export { plugin } from "./src/index.ts";
export {
  readSiteConfig,
  normalizeMount,
  resolveSkinHref,
  applySkinDefaults,
  markNavActive,
  navHrefIsActive,
  normalizeNavPath,
  SITE_ASSET_V,
} from "./src/config.ts";
export type {
  SitePluginConfig,
  SiteNavItem,
} from "./src/config.ts";
export { injectSiteHtml } from "./src/html.ts";
export {
  siteStaticHandler,
  setSiteRuntime,
  getSiteRuntime,
  siteConfigResponse,
  resolvedSiteNav,
} from "./src/static.ts";

// ── Plugin contribution APIs ─────────────────────────────────────
export {
  registerSiteMenuBlock,
  unregisterSiteMenuBlock,
  listSiteMenuBlocks,
  clearSiteMenuBlocks,
  resolvePluginMenuBlocks,
  expandLeftMenuTemplate,
  DEFAULT_LEFT_MENU,
} from "./src/menu.ts";
export type {
  SiteMenuItem,
  SiteMenuBlockResult,
  SiteMenuBlockContext,
  SiteMenuBlockHandler,
  ExpandMenuOptions,
} from "./src/menu.ts";

export {
  registerSiteNav,
  unregisterSiteNav,
  listSiteNav,
  clearSiteNav,
  mergeSiteNav,
} from "./src/site-nav.ts";
export type { SiteNavRegistration } from "./src/site-nav.ts";

export {
  registerSiteStatic,
  unregisterSiteStatic,
  listSiteStatic,
  clearSiteStatic,
  isSiteStaticId,
  getSiteStaticRoot,
  safeJoinSiteStatic,
} from "./src/site-static.ts";
export type { SiteStaticRegistration } from "./src/site-static.ts";

export {
  listBuiltinSkins,
  builtinSkinsDir,
  skinCssHref,
} from "./src/skins.ts";
export {
  registerSiteTheme,
  unregisterSiteTheme,
  clearRegisteredThemes,
  listRegisteredThemes,
  listAllThemes,
  listBuiltinThemeEntries,
  scanInstalledThemes,
  installThemeZip,
  themeToSiteConfig,
  installedThemesRoot,
  isThemeId,
} from "./src/themes.ts";
export type {
  SiteThemeManifest,
  InstallThemeResult,
  ThemeListItem,
} from "./src/themes.ts";
