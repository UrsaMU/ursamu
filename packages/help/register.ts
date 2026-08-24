/**
 * Lightweight entry for plugins that only need registerHelpDir.
 * Avoids pulling the full help command surface into dependents.
 */
export { registerHelpDir, bustCache } from "./src/providers/file.ts";
