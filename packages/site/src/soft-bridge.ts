/**
 * Optional helpers — plugins may also dynamic-import @ursamu/site.
 * These re-export the same APIs for a single import path.
 */

export {
  registerSiteMenuBlock,
  unregisterSiteMenuBlock,
  listSiteMenuBlocks,
  clearSiteMenuBlocks,
  resolvePluginMenuBlocks,
  expandLeftMenuTemplate,
  DEFAULT_LEFT_MENU,
} from "./menu.ts";
export type {
  SiteMenuItem,
  SiteMenuBlockResult,
  SiteMenuBlockContext,
  SiteMenuBlockHandler,
  ExpandMenuOptions,
} from "./menu.ts";

export {
  registerSiteNav,
  unregisterSiteNav,
  listSiteNav,
  clearSiteNav,
  mergeSiteNav,
} from "./site-nav.ts";
export type { SiteNavRegistration } from "./site-nav.ts";

export {
  registerSiteStatic,
  unregisterSiteStatic,
  listSiteStatic,
  clearSiteStatic,
  isSiteStaticId,
  getSiteStaticRoot,
} from "./site-static.ts";
export type { SiteStaticRegistration } from "./site-static.ts";
