/**
 * @module @ursamu/wiki
 *
 * File-based markdown wiki for UrsaMU.
 */

export { plugin as default } from "./src/index.ts";
export { wikiHooks } from "./src/hooks.ts";
export type { WikiPageRef, WikiHookMap, IWikiHooks } from "./src/hooks.ts";
export {
  WIKI_DIR,
  MAX_UPLOAD_BYTES,
  ALLOWED_MEDIA_TYPES,
  parseFrontmatter,
  serializePage,
  walkWiki,
  readPageFile,
  findPageFile,
  safePath,
  mimeForPath,
  normalisePath,
} from "./src/fs.ts";
export type { WikiMeta, WikiStub } from "./src/fs.ts";
export { scanBacklinks, resolveWikilinks, extractWikilinks } from "./src/backlinks.ts";
export { saveSnapshot, listHistory, readSnapshot } from "./src/history.ts";
export { isWebhookUrlSafe, isPrivateIp } from "./src/url-safety.ts";
export { loadWebhooks, saveWebhooks, fireWebhook } from "./src/webhook.ts";
