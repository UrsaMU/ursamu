// Central registry for all MUX softcode built-in functions.
// Re-exports register/lookup from registry.ts (no circular deps),
// then imports all stdlib modules as side effects so their register()
// calls populate the shared Map.

export { register, lookup, entries } from "./registry.ts";
export type { StdlibFn } from "./registry.ts";

// ── Load all modules (side-effect imports register their functions) ────────
import "./math.ts";
import "./logic.ts";
import "./string.ts";
import "./list.ts";
import "./object.ts";
import "./register.ts";
import "./output.ts";
import "./tags.ts";
