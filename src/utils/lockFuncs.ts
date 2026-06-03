/**
 * Bridge: re-exports registerLockFunc from @ursamu/mush.
 * The lock function registry lives in packages/mush/src/world/locks.ts.
 */
export { registerLockFunc } from "@ursamu/mush";
export { callLockFunc } from "@ursamu/mush";
// Type alias for backwards compat
export type { LockFunc } from "@ursamu/mush";
