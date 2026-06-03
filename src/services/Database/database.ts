/**
 * Bridge: re-exports DBO and named collections from @ursamu/core and @ursamu/mush.
 * The actual implementations now live in packages/. This file keeps all existing
 * imports in src/ working without any changes.
 */
export { DBO } from "@ursamu/core";
export type { Query } from "@ursamu/core";

// Named game-object collections (same KV namespaces as before)
export { dbojs, counters, chans, texts, scenes, chanHistory, Obj } from "@ursamu/mush";

// Re-export IDBOBJ for code that imports it from here
export type { IDBOBJ } from "@ursamu/mush";
