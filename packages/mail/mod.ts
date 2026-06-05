/**
 * @module @ursamu/mail
 *
 * In-game mail system for UrsaMU — drafts, folders, attachments, quota, and expiry.
 */

export { plugin as mailPlugin, plugin as default } from "./src/index.ts";
export type { IMail } from "./src/mailDbo.ts";
export { mailDb, MAIL_QUOTA, EXPIRY_SWEEP_MS } from "./src/mailDbo.ts";
export { getMyMail, countPlayerMail, resolveNames, runExpirySweep } from "./src/mailHelpers.ts";
export { mailRouteHandler } from "./src/routes.ts";
