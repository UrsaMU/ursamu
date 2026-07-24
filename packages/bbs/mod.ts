/**
 * @module @ursamu/bbs
 *
 * Full-featured bulletin board system for UrsaMU.
 *
 * On install (engine:ready), seeds Announcements (player-read /
 * staff-write), OOC (open), and Jobs (staff-only). When @ursamu/jobs
 * is present, job lifecycle events mirror onto the Jobs board.
 */

export { default } from "./src/index.ts";
export { seedBoards } from "./src/db.ts";
export {
  DEFAULT_BOARDS,
  seedDefaultBoards,
} from "./src/seed.ts";
export {
  header,
  divider,
  footer,
  formatPost,
  bbDate,
  WIDTH,
} from "./src/display.ts";
export type { IDefaultBoard } from "./src/seed.ts";
export type {
  ISeedBoardOptions,
  IBoard,
  IPost,
  IReply,
  IFlag,
  IDraft,
} from "./src/db.ts";
