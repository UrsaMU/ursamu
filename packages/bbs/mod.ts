/**
 * @module @ursamu/bbs
 *
 * Full-featured bulletin board system for UrsaMU.
 */

export { default } from "./src/index.ts";
export { seedBoards } from "./src/db.ts";
export type { ISeedBoardOptions, IBoard, IPost, IReply, IFlag, IDraft } from "./src/db.ts";
