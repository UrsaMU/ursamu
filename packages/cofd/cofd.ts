// Back-compat shim: re-exports the modular CoFD engine surface from ./src.
// New code should import directly from "./src/..." subpaths.

export * from "./src/dictionary/index.ts";
export * from "./src/stats/index.ts";
export * from "./src/support/index.ts";
export * from "./src/roller/index.ts";
export * from "./src/sheet/index.ts";
