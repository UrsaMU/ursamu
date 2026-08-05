/**
 * Copy host staff-theme.css into known plugin vendor paths
 * so standalone SPAs stay in sync when the host is absent.
 *
 * Run from packages/web: deno task theme:sync
 */
import { copyFile, mkdir } from "node:fs/promises";
import { dirname, fromFileUrl, join } from "@std/path";

const here = dirname(fromFileUrl(import.meta.url));
const src = join(here, "../ui/src/assets/staff-theme.css");
const targets = [
  join(here, "../../bbs/ui/src/vendor/staff-theme.css"),
];

const header =
  "/* SYNCED COPY of @ursamu/web staff-theme.css — do not edit.\n" +
  " * Source: packages/web/ui/src/assets/staff-theme.css\n" +
  " * Prefer runtime /admin/staff-theme.css when the host is present.\n" +
  " * Regenerate: cd packages/web && deno task theme:sync\n" +
  " */\n\n";

const body = await Deno.readTextFile(src);

for (const dest of targets) {
  await mkdir(dirname(dest), { recursive: true });
  await Deno.writeTextFile(dest, header + body);
  console.log("[theme:sync]", dest);
}
