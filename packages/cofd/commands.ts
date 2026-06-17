// Back-compat shim: re-exports CoFD command executors and triggers addCmd()
// registration via the side-effect import of ./src/commands/register.ts.

import "./src/commands/register.ts";

export { sheetExec, sheetSetExec, rollExec, cgExec } from "./src/commands/index.ts";
