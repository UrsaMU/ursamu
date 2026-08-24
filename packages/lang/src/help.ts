/**
 * Explicitly wire the plugin's help/ directory into @ursamu/help-plugin
 * at startup. Topics derive from filenames in ../help/:
 *
 *   help/language.md            → +help language
 *   help/language-authoring.md  → +help language-authoring
 *   help/language-staff.md      → +help language-staff
 *
 * Section: "language". The help plugin is a hard dependency declared
 * in deno.json — if it isn't loaded by the host, the import fails
 * loudly rather than silently.
 */

import { registerHelpDir } from "@ursamu/help/register";

const HELP_DIR = new URL("../help", import.meta.url);
const SECTION  = "language";

export function registerHelp(): void {
  registerHelpDir(HELP_DIR, SECTION);
  console.log(
    `[sgp-language] Registered help directory ${HELP_DIR.href} ` +
      `(section "${SECTION}").`,
  );
}
