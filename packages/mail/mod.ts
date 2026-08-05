/**
 * @module @ursamu/mail
 *
 * In-game mail (stable 2.5 on mush 1.x) — drafts, folders,
 * attachments, quota, and expiry. See docs/STABLE.md.
 */

export {
  plugin as mailPlugin,
  plugin as default,
} from "./src/index.ts";
export type { IMail } from "./src/mailDbo.ts";
export {
  mailDb,
  MAIL_QUOTA,
  EXPIRY_SWEEP_MS,
} from "./src/mailDbo.ts";
export {
  getMyMail,
  countPlayerMail,
  resolveNames,
  runExpirySweep,
} from "./src/mailHelpers.ts";
export { mailRouteHandler } from "./src/routes.ts";
export {
  getDraft,
  setDraft,
  getMailState,
  type MailPlayerState,
} from "./src/draft.ts";
